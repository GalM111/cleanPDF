// Copies PDF.js character maps and standard fonts into public/ so pages render
// correctly without any network request to a third party.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pdfjs-dist');
const dest = join(root, 'public', 'pdfjs');

if (existsSync(src)) {
  mkdirSync(dest, { recursive: true });
  for (const dir of ['cmaps', 'standard_fonts']) {
    cpSync(join(src, dir), join(dest, dir), { recursive: true });
  }
}
