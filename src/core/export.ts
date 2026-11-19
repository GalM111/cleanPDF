import { PDFDocument } from 'pdf-lib';
import { capScale, openPdf, startRender, type PDFDocumentProxy } from './pdf';
import type { OutputMode } from './replace';
import { normValue } from './text';
import type { Rect } from './types';

export interface DrawBox {
  rect: Rect;
  /** Text drawn in the box in label and sample modes ('' = none). */
  label: string;
  /** Draw the text right-to-left (Hebrew). */
  rtl?: boolean;
}

// 2.5 x 72 = 180 dots per inch: sharp enough to read, small enough to email.
// Very large pages get less (see capScale) so their canvas is not left blank.
const EXPORT_SCALE = 2.5;

interface Px {
  x: number;
  y: number;
  w: number;
  h: number;
}

const toPx = (r: Rect, s: number): Px => ({
  x: Math.floor(r.x * s) - 1,
  y: Math.floor(r.y * s) - 1,
  w: Math.ceil(r.w * s) + 2,
  h: Math.ceil(r.h * s) + 2,
});

interface Colors {
  bg: string;
  ink: string;
}

/**
 * Reads the page colours around a box before it is painted: the background
 * (most common colour on the box edge) and the text colour (the colour inside
 * that differs most from the background).
 */
function sampleColors(ctx: CanvasRenderingContext2D, p: Px): Colors {
  const pad = 3;
  const X = Math.max(0, p.x - pad);
  const Y = Math.max(0, p.y - pad);
  const W = Math.min(ctx.canvas.width - X, p.w + 2 * pad);
  const H = Math.min(ctx.canvas.height - Y, p.h + 2 * pad);
  if (W <= 0 || H <= 0) return { bg: '#ffffff', ink: '#222222' };
  const d = ctx.getImageData(X, Y, W, H).data;

  const buckets = new Map<number, [number, number, number, number]>();
  const add = (px: number, py: number) => {
    const i = (py * W + px) * 4;
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    const b = buckets.get(key) ?? [0, 0, 0, 0];
    b[0]++;
    b[1] += d[i];
    b[2] += d[i + 1];
    b[3] += d[i + 2];
    buckets.set(key, b);
  };
  for (let px = 0; px < W; px++) {
    add(px, 0);
    add(px, H - 1);
  }
  for (let py = 0; py < H; py++) {
    add(0, py);
    add(W - 1, py);
  }
  let top: [number, number, number, number] = [0, 255, 255, 255];
  for (const b of buckets.values()) if (b[0] > top[0]) top = b;
  const bg = [top[1] / top[0], top[2] / top[0], top[3] / top[0]].map(Math.round);

  let ink = bg;
  let far = 0;
  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
    if (dist > far) {
      far = dist;
      ink = [d[i], d[i + 1], d[i + 2]];
    }
  }
  if (far < 150) {
    const light = bg[0] * 0.3 + bg[1] * 0.59 + bg[2] * 0.11 > 128;
    ink = light ? [34, 34, 34] : [238, 238, 238];
  }
  const css = (c: number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  return { bg: css(bg), ink: css(ink) };
}

function paint(
  ctx: CanvasRenderingContext2D,
  box: DrawBox,
  mode: OutputMode,
  colors: Colors,
  s: number,
) {
  const { x, y, w, h } = toPx(box.rect, s);
  if (mode === 'black' || mode === 'white' || mode === 'page') {
    // A little extra width: character widths are estimated, and an error
    // must never leave the edge of a hidden letter showing.
    const extra = Math.max(1, Math.round(h * 0.08));
    ctx.fillStyle = mode === 'black' ? '#000' : mode === 'white' ? '#fff' : colors.bg;
    ctx.fillRect(x - extra, y, w + 2 * extra, h);
    return;
  }
  if (mode === 'sample') {
    // Page-coloured patch with made-up text in the original text colour,
    // sitting on the original baseline.
    ctx.fillStyle = colors.bg;
    ctx.fillRect(x, y, w, h);
    if (!box.label) return;
    let size = (box.rect.h * s) / 1.3;
    ctx.font = `${size}px Arial, sans-serif`;
    const width = ctx.measureText(box.label).width;
    if (width > w - 6) {
      size = Math.max(6, (size * (w - 6)) / width);
      ctx.font = `${size}px Arial, sans-serif`;
    }
    ctx.fillStyle = colors.ink;
    ctx.direction = box.rtl ? 'rtl' : 'ltr';
    ctx.textAlign = box.rtl ? 'right' : 'left';
    ctx.textBaseline = 'alphabetic';
    const baseline = box.rect.y * s + (box.rect.h * s) / 1.3;
    ctx.fillText(box.label, box.rtl ? x + w - 3 : x + 3, baseline);
    ctx.direction = 'ltr';
    return;
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  let size = Math.max(8, h * 0.6);
  ctx.font = `600 ${size}px Arial, sans-serif`;
  const textWidth = ctx.measureText(box.label).width;
  if (textWidth > w - 8) {
    size = Math.max(6, (size * (w - 8)) / textWidth);
    ctx.font = `600 ${size}px Arial, sans-serif`;
  }
  ctx.fillStyle = '#222';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(box.label, x + w / 2, y + h / 2 + 1);
}

/**
 * Builds the cleaned PDF. Every page is drawn to an image with the boxes
 * painted into the pixels, and a new file is made from those images only.
 * Nothing from the original file (text, metadata, attachments, form data) is
 * carried over, so what is under a box cannot be recovered.
 */
export async function exportPdf(
  doc: PDFDocumentProxy,
  boxesByPage: DrawBox[][],
  mode: OutputMode,
  onProgress: (page: number, total: number) => void,
): Promise<Uint8Array> {
  // No creation or modification date: it would tell when the file was cleaned.
  const out = await PDFDocument.create({ updateMetadata: false });
  for (let i = 0; i < doc.numPages; i++) {
    onProgress(i + 1, doc.numPages);
    const page = await doc.getPage(i + 1);
    const size = page.getViewport({ scale: 1 });
    const scale = capScale(size.width, size.height, EXPORT_SCALE);
    const canvas = document.createElement('canvas');
    await startRender(page, canvas, scale).promise;
    const ctx = canvas.getContext('2d')!;
    // Read all colours first, so one painted box cannot affect its neighbour.
    const boxes = boxesByPage[i] ?? [];
    const colors = boxes.map((box) => sampleColors(ctx, toPx(box.rect, scale)));
    boxes.forEach((box, k) => paint(ctx, box, mode, colors[k], scale));

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode page'))), 'image/jpeg', 0.9),
    );
    const image = await out.embedJpg(await blob.arrayBuffer());
    const outPage = out.addPage([size.width, size.height]);
    outPage.drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });
    canvas.width = canvas.height = 0;
    // Release this page's fonts and images: matters on phones with long files.
    page.cleanup();
  }
  out.setTitle('');
  out.setAuthor('');
  out.setProducer('cleanPDF');
  out.setCreator('cleanPDF');
  return out.save();
}

export interface Verification {
  ok: boolean;
  /** Hidden values that can still be read in the output. */
  leaks: string[];
  /** Characters of readable text left in the output (expected: 0). */
  textChars: number;
}

/** Re-opens the output and checks that no hidden value can be read from it. */
export async function verifyPdf(bytes: Uint8Array, hiddenValues: string[]): Promise<Verification> {
  const doc = await openPdf(bytes);
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    for (const it of content.items) if ('str' in it) text += it.str + ' ';
  }
  const info = (await doc.getMetadata().catch(() => null))?.info as Record<string, unknown> | undefined;
  text += ` ${info?.Title ?? ''} ${info?.Author ?? ''} ${info?.Subject ?? ''} ${info?.Keywords ?? ''}`;
  await doc.destroy();

  const haystack = normValue(text);
  const digits = haystack.replace(/\D/g, '');
  const leaks = [...new Set(hiddenValues)].filter((value) => {
    const v = normValue(value);
    if (v.length >= 2 && haystack.includes(v)) return true;
    const d = v.replace(/\D/g, '');
    return d.length >= 5 && digits.includes(d);
  });
  return { ok: leaks.length === 0, leaks, textChars: haystack.replace(/\s/g, '').length };
}
