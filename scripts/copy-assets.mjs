// Copies third-party runtime files into public/ so the app never asks another
// server for anything: PDF.js character maps and fonts, and the OCR engine
// with its English and Hebrew language data.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');
const pub = join(root, 'public');

function copy(from, to) {
  const src = join(modules, from);
  if (!existsSync(src)) return;
  const dest = join(pub, to);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

for (const dir of ['cmaps', 'standard_fonts']) copy(`pdfjs-dist/${dir}`, `pdfjs/${dir}`);

copy('tesseract.js/dist/worker.min.js', 'ocr/worker.min.js');
// Only the "lstm" builds are needed; the engine picks one by browser support.
for (const core of ['tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm']) {
  copy(`tesseract.js-core/${core}.wasm.js`, `ocr/core/${core}.wasm.js`);
}
for (const lang of ['eng', 'heb']) {
  copy(`@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, `ocr/lang/${lang}.traineddata.gz`);
}
