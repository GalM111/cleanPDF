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
  return { items, width: viewport.width, height: viewport.height };
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
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read image'))), 'image/jpeg', 0.92),
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
  return page.items.reduce((n, it) => n + it.str.replace(/\s/g, '').length, 0) < 10;
}
