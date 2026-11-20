// Reads barcodes and QR codes in page pictures, in a background thread so
// the screen stays responsive. The decoder (zxing-wasm) is loaded from the
// app's own files, never from a CDN.
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? wasmUrl : prefix + path,
  },
});

export interface WorkerCode {
  text: string;
  format: string;
  /** Corner points in the picture's pixels. */
  corners: [number, number][];
}

export interface WorkerRequest {
  id: number;
  image: ImageData;
  /** Slower search for blurry, tilted or small codes (scans and photos). */
  thorough: boolean;
}

export type WorkerResponse = { id: number; codes: WorkerCode[] } | { id: number; error: string };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, image, thorough } = e.data;
  try {
    const results = await readBarcodes(image, {
      tryHarder: thorough,
      maxNumberOfSymbols: 32,
    });
    const codes: WorkerCode[] = results
      .filter((r) => r.isValid)
      .map((r) => ({
        text: r.text,
        format: r.format,
        corners: [
          r.position.topLeft,
          r.position.topRight,
          r.position.bottomRight,
          r.position.bottomLeft,
        ].map((p) => [p.x, p.y] as [number, number]),
      }));
    self.postMessage({ id, codes } satisfies WorkerResponse);
  } catch (err) {
    self.postMessage({ id, error: String(err) } satisfies WorkerResponse);
  }
};
