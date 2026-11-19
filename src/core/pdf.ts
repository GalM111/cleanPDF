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
    // Never compile code from a document (the path past PDF.js exploits used);
    // the Content-Security-Policy would block it anyway.
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
    let text: string;
    if (a.subtype === 'Widget') {
      if (a.checkBox || a.radioButton || a.pushButton) continue;
      const value = a.fieldValue;
      text = Array.isArray(value) ? value.join(' ') : typeof value === 'string' ? value : '';
      if (!text.trim() && a.fieldType !== 'Sig') continue; // an empty field shows nothing
    } else {
      text = a.contentsObj?.str ?? '';
    }
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

// Pictures smaller than this (in their own pixels) are icons and rules.
const MIN_IMAGE_SIDE = 100;

/** Counts the pictures drawn on a page that are big enough to hold text. */
async function countImages(page: PDFPageProxy): Promise<number> {
  const { OPS } = pdfjs;
  const ops = await page.getOperatorList().catch(() => null);
  if (!ops) return 0;
  let count = 0;
  ops.fnArray.forEach((fn, i) => {
    const args = ops.argsArray[i];
    let w: number;
    let h: number;
    if (fn === OPS.paintImageXObject) [, w, h] = args;
    else if (fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject)
      ({ width: w, height: h } = args[0] ?? {});
    else if (fn === OPS.paintImageXObjectRepeat || fn === OPS.paintInlineImageXObjectGroup)
      w = h = MIN_IMAGE_SIDE;
    else return;
    if (w >= MIN_IMAGE_SIDE && h >= MIN_IMAGE_SIDE) count++;
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
