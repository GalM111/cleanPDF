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
