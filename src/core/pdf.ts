import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Measure } from './geometry';
import type { PageText, TextItem } from './types';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy, PDFPageProxy };

// Must be an absolute URL: PDF.js loads these files from its background worker,
// where a relative path would resolve against the worker script's own folder.
const assets = new URL(`${import.meta.env.BASE_URL}pdfjs/`, document.baseURI).href;

/** Opens a PDF from bytes held in memory. Nothing is sent anywhere. */
export function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument({
    data: data.slice(),
    cMapUrl: `${assets}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
    // Never compile code from a document: the path past PDF.js exploits used,
    // and the Content-Security-Policy blocks it anyway.
    isEvalSupported: false,
  }).promise;
}

/** Extracts the text of a page with a box for every piece of text. */
export async function extractPage(page: PDFPageProxy): Promise<PageText> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: TextItem[] = [];
  for (const it of content.items) {
    if (!('str' in it) || !it.str) continue;
    const tx = pdfjs.Util.transform(viewport.transform, it.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]) || it.height || 10;
    items.push({
      str: it.str,
      x: tx[4],
      // tx[5] is the baseline. The box runs from above the tallest letters to
      // below the descenders, a little generous on purpose.
      y: tx[5] - fontHeight,
      w: it.width,
      h: fontHeight * 1.3,
      rtl: it.dir === 'rtl',
      font: content.styles[it.fontName]?.fontFamily ?? 'sans-serif',
    });
  }
  const marks = await addAnnotationText(page, viewport, items);
  const images = await countImages(page);
  return { items, width: viewport.width, height: viewport.height, images, marks };
}

/** Annotation types that draw nothing personal: links, note icons, popups. */
const HARMLESS = new Set(['Link', 'Popup', 'Text']);

/**
 * Form fields and text comments are drawn on the page, but they are not part
 * of the page text. Their text is added as extra items (covered whole when it
 * matches). Returns how many other marks are drawn: signatures, stamps,
 * drawings and empty or unreadable fields, which the user should check.
 */
async function addAnnotationText(
  page: PDFPageProxy,
  viewport: ReturnType<PDFPageProxy['getViewport']>,
  items: TextItem[],
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const annotations: any[] = await page.getAnnotations({ intent: 'display' }).catch(() => []);
  let marks = 0;
  for (const a of annotations) {
    if (HARMLESS.has(a.subtype) || !Array.isArray(a.rect)) continue;
    if (a.subtype === 'Widget' && (a.checkBox || a.radioButton || a.pushButton)) continue;
    const text = annotationText(a);
    // An empty form field shows nothing; an empty signature field still counts.
    if (a.subtype === 'Widget' && !text.trim() && a.fieldType !== 'Sig') continue;
    if (!text.trim()) {
      marks++;
      continue;
    }
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect);
    items.push({
      str: text.replace(/\s+/g, ' ').trim(),
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
      rtl: /[\u0590-\u05FF]/.test(text),
      font: 'sans-serif',
      whole: true,
    });
    marks++;
  }
  return marks;
}

/** The text an annotation draws: a form field's value or a comment's text. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function annotationText(a: any): string {
  if (a.subtype !== 'Widget') return a.contentsObj?.str ?? '';
  const value = a.fieldValue;
  if (Array.isArray(value)) return value.join(' ');
  return typeof value === 'string' ? value : '';
}

// Pictures smaller than this (in their own pixels) are icons and rules.
const MIN_IMAGE_SIDE = 100;

/** Pixel size of the picture an operator draws, or null if it draws none. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function imageSize(fn: number, args: any): [number, number] | null {
  const { OPS } = pdfjs;
  if (fn === OPS.paintImageXObject) return [args[1], args[2]];
  if (fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject)
    return [args[0]?.width ?? 0, args[0]?.height ?? 0];
  // Repeated or grouped pictures: assume they are big enough to matter.
  if (fn === OPS.paintImageXObjectRepeat || fn === OPS.paintInlineImageXObjectGroup)
    return [MIN_IMAGE_SIDE, MIN_IMAGE_SIDE];
  return null;
}

/** Counts the pictures drawn on a page that are big enough to hold text. */
async function countImages(page: PDFPageProxy): Promise<number> {
  const ops = await page.getOperatorList().catch(() => null);
  if (!ops) return 0;
  let count = 0;
  ops.fnArray.forEach((fn, i) => {
    const size = imageSize(fn, ops.argsArray[i]);
    if (size && size[0] >= MIN_IMAGE_SIDE && size[1] >= MIN_IMAGE_SIDE) count++;
  });
  return count;
}

// Safari (iPhone, iPad, Mac) leaves a canvas blank above about 16.7 million
// pixels. Normal pages (A4, Letter, up to about A2 at the export scale) stay
// well below this; only very large pages are drawn at a lower scale.
const MAX_CANVAS_PIXELS = 16_000_000;

/** The wanted scale, lowered if needed so the page fits in one canvas. */
export function capScale(width: number, height: number, wanted: number): number {
  const fit = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
  return Math.min(wanted, fit);
}

/** Starts drawing a page into a canvas. The returned task can be cancelled. */
export function startRender(page: PDFPageProxy, canvas: HTMLCanvasElement, scale: number) {
  const viewport = page.getViewport({ scale });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const canvasContext = canvas.getContext('2d')!;
  return page.render({ canvasContext, viewport });
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** Measures character widths with the browser so boxes fit proportional fonts. */
export const canvasMeasure: Measure = (str, font) => {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  measureCtx.font = `16px ${font}`;
  return Array.from({ length: str.length }, (_, i) => measureCtx!.measureText(str[i]).width || 1);
};

// Longest side of a photo in pixels. Larger photos are scaled down: enough
// to read small print, and it keeps the work in memory manageable.
const MAX_IMAGE_SIDE = 3000;

/** Wraps a photo or image file in a one-page PDF, so it is handled like a scan. */
export async function imageToPdf(file: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const shrink = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * shrink);
  canvas.height = Math.round(bitmap.height * shrink);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not read image'))),
      'image/jpeg',
      0.92,
    ),
  );
  const out = await PDFDocument.create();
  const image = await out.embedJpg(await blob.arrayBuffer());
  // A4 width; the height follows the picture.
  const width = 595;
  const height = (width * canvas.height) / canvas.width;
  out.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
  canvas.width = canvas.height = 0;
  return out.save();
}

/** A page with (almost) no text of its own is a picture and has to be read by OCR. */
export function needsOcr(page: PageText): boolean {
  // Form-field text sits on top of the page; it says nothing about the page itself.
  const own = page.items.filter((it) => !it.whole);
  return own.reduce((n, it) => n + it.str.replace(/\s/g, '').length, 0) < 10;
}
