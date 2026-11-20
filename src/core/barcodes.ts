import type { WorkerCode, WorkerRequest, WorkerResponse } from './barcodeWorker';
import { capScale, startRender, type PDFPageProxy } from './pdf';
import type { Rect } from './types';

/** A barcode or QR code found on a page, with its box in page units. */
export interface Barcode {
  text: string;
  format: string;
  rect: Rect;
}

// 2 x 72 = 144 dots per inch: enough for the small codes printed on bills.
const SCALE = 2;

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<
  number,
  { resolve: (c: WorkerCode[]) => void; reject: (e: Error) => void }
>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./barcodeWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const job = waiting.get(e.data.id);
    if (!job) return;
    waiting.delete(e.data.id);
    if ('codes' in e.data) job.resolve(e.data.codes);
    else job.reject(new Error(e.data.error));
  };
  worker.onerror = () => stopBarcodes();
  return worker;
}

/** Stops the background reader; pending pages are given up. */
export function stopBarcodes() {
  worker?.terminate();
  worker = null;
  for (const job of waiting.values()) job.reject(new Error('stopped'));
  waiting.clear();
}

/**
 * Renders a page and reads every barcode and QR code on it. `thorough` is for
 * scans and photos: slower, but finds blurry or tilted codes. Codes in an
 * ordinary PDF are drawn sharply and are found by the quick search.
 */
export async function findBarcodes(page: PDFPageProxy, thorough: boolean): Promise<Barcode[]> {
  const viewport = page.getViewport({ scale: 1 });
  const scale = capScale(viewport.width, viewport.height, SCALE);
  const canvas = document.createElement('canvas');
  await startRender(page, canvas, scale).promise;
  const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = canvas.height = 0;

  const id = nextId++;
  const codes = await new Promise<WorkerCode[]>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    getWorker().postMessage({ id, image, thorough } satisfies WorkerRequest, [image.data.buffer]);
  });

  return codes.map((c) => {
    const xs = c.corners.map((p) => p[0] / scale);
    const ys = c.corners.map((p) => p[1] / scale);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // A margin all round: the quiet zone and any digits printed under a barcode.
    const m = Math.max(3, 0.08 * Math.max(x1 - x0, y1 - y0));
    const x = Math.max(0, x0 - m);
    const y = Math.max(0, y0 - m);
    return {
      text: c.text,
      format: c.format,
      rect: {
        x,
        y,
        w: Math.min(viewport.width, x1 + m) - x,
        h: Math.min(viewport.height, y1 + m) - y,
      },
    };
  });
}
