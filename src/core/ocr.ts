import type { Worker } from 'tesseract.js';
import { linesToItems, type OcrLine } from './ocrItems';
import { startRender, type PDFPageProxy } from './pdf';
import type { PageText } from './types';

// The engine and its language data are part of the app's own files. Nothing
// is fetched from another server, and the page image never leaves the device.
const assets = new URL(`${import.meta.env.BASE_URL}ocr/`, document.baseURI).href;

// 3 x 72 = 216 dots per inch, in the range the engine reads best.
const OCR_SCALE = 3;

let worker: Promise<Worker> | null = null;
let onProgress: ((fraction: number) => void) | null = null;
// Pages are read one at a time; each call waits for the one before it.
let queue: Promise<unknown> = Promise.resolve();

function getWorker(): Promise<Worker> {
  worker ??= (async () => {
    const { createWorker, OEM, PSM } = await import('tesseract.js');
    const w = await createWorker(['heb', 'eng'], OEM.LSTM_ONLY, {
      workerPath: `${assets}worker.min.js`,
      corePath: `${assets}core`,
      langPath: `${assets}lang`,
      gzip: true,
      cacheMethod: 'none',
      workerBlobURL: false,
      logger: (m) => {
        if (m.status === 'recognizing text') onProgress?.(m.progress);
      },
    });
    await w.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      user_defined_dpi: String(72 * OCR_SCALE),
    });
    return w;
  })();
  worker.catch(() => (worker = null));
  return worker;
}

/** Reads the text of a page from its picture (scans and photos). */
export function ocrPage(page: PDFPageProxy, progress: (fraction: number) => void): Promise<PageText> {
  const run = async (): Promise<PageText> => {
    const viewport = page.getViewport({ scale: 1 });
    const canvas = document.createElement('canvas');
    await startRender(page, canvas, OCR_SCALE).promise;
    const w = await getWorker();
    onProgress = progress;
    try {
      const { data } = await w.recognize(canvas, {}, { blocks: true, text: false });
      const lines: OcrLine[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
      return {
        items: linesToItems(lines, OCR_SCALE),
        width: viewport.width,
        height: viewport.height,
        ocr: true,
      };
    } finally {
      onProgress = null;
      canvas.width = canvas.height = 0;
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

/** Shuts the engine down and frees its memory. */
export function stopOcr() {
  const w = worker;
  worker = null;
  void w?.then((x) => x.terminate()).catch(() => {});
}
