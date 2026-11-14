import type { Worker } from 'tesseract.js';
import { linesToItems, type OcrLine } from './ocrItems';
import { startRender, type PDFPageProxy } from './pdf';
import type { PageText } from './types';

// The engine and its language data are part of the app's own files. Nothing
// is fetched from another server, and the page image never leaves the device.
const assets = new URL(`${import.meta.env.BASE_URL}ocr/`, document.baseURI).href;

// 3 x 72 = 216 dots per inch, in the range the engine reads best.
const OCR_SCALE = 3;

/** A copy of the picture, blurred by `radius` pixels. */
function blurred(src: HTMLCanvasElement, radius: number, shrink = 1): ImageData {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width / shrink));
  c.height = Math.max(1, Math.round(src.height / shrink));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.filter = `blur(${radius / shrink}px)`;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  c.width = c.height = 0;
  return data;
}

const grey = (d: Uint8ClampedArray, i: number) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;

/**
 * Cleans a picture for reading: grey, lightly smoothed to remove camera
 * noise, and divided by the local background so that shadows, grey paper
 * and the table around a photographed page all turn white. Done in place.
 */
export function prepare(canvas: HTMLCanvasElement) {
  const SHRINK = 8;
  const soft = blurred(canvas, 1.2);
  const back = blurred(canvas, 48, SHRINK);
  const w = canvas.width;
  const h = canvas.height;
  const d = soft.data;
  for (let y = 0; y < h; y++) {
    const by = Math.min(back.height - 1, Math.floor(y / SHRINK));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const b = (by * back.width + Math.min(back.width - 1, Math.floor(x / SHRINK))) * 4;
      const ratio = grey(d, i) / Math.max(1, grey(back.data, b));
      // Stretch: anything close to the background becomes pure white.
      const v = Math.max(0, Math.min(255, (ratio - 0.5) * 2.4 * 255));
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  canvas.getContext('2d')!.putImageData(soft, 0, 0);
}

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
    prepare(canvas);
    const w = await getWorker();
    onProgress = progress;
    try {
      // rotateAuto: a tilted page is straightened before it is read.
      const { data } = await w.recognize(canvas, { rotateAuto: true }, { blocks: true, text: false });
      const lines: OcrLine[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
      return {
        items: linesToItems(lines, OCR_SCALE, data.rotateRadians ?? 0, canvas),
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
