// Renders the app icon into the PNG sizes phones and browsers ask for.
// Run once after changing the design: node scripts/make-icons.mjs
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// require() so a globally installed Playwright is found too.
const { chromium } = createRequire(import.meta.url)('playwright');

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Full-bleed square (iOS rounds the corners itself; a transparent corner would
// show as black). The bar sits in the middle 60% so it survives maskable crops.
const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16">
  <rect width="16" height="16" fill="#1f5fd6"/>
  <rect x="3.5" y="6.5" width="9" height="3" rx="0.4" fill="#000"/>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${svg(size)}</body>`);
  await page.locator('svg').screenshot({ path: join(pub, name), omitBackground: false });
}
await browser.close();
