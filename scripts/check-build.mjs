// Checks the production build in dist/ for the privacy promises in CLAUDE.md:
// the Content-Security-Policy is in place, no new outside address has crept into
// the code (a CDN, analytics, tracking), and the app bundle has not suddenly
// grown, which usually means a dependency was added by accident.
// Run after `npm run build`. Exits with an error listing every problem found.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

// Hostnames that appear in the built code without ever being contacted: XML
// namespaces used by PDF.js and links inside library error messages. Add to
// this list only after checking that the new address is never requested.
const ALLOWED_HOSTS = new Set([
  'www.w3.org', // SVG / XML namespaces
  'www.xfa.org', // PDF form (XFA) namespaces
  'ns.adobe.com', // PDF metadata namespaces
  'www.apache.org', // licence notice in PDF.js
  'react.dev', // links in React error messages
  'github.com', // link in a library error message
  'rolldown.rs', // link in a bundler error message
  'bit.ly', // "Learn more" link in a Workbox (service worker) console warning
  // Tesseract.js (OCR) default download places, used only when no path is
  // given. src/core/ocr.ts always passes the app's own files, and the CSP
  // would block these anyway.
  'cdn.jsdelivr.net',
  'opencollective.com', // funding link in the bundled tesseract.js package.json
]);

// Largest allowed size of the main app script, in KiB. About 970 KiB today.
const APP_JS_BUDGET_KIB = 1200;

// Each directive the policy must contain, exactly.
const REQUIRED_CSP = ["default-src 'self'", "connect-src 'self'", "script-src 'self'"];

const problems = [];

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html not found. Run `npm run build` first.');
  process.exit(1);
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

// 1. Content-Security-Policy
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const meta = html.match(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>/i);
if (!meta) {
  problems.push('index.html has no Content-Security-Policy <meta> tag.');
} else {
  const content = (meta[0].match(/content="([^"]*)"/)?.[1] ?? '').replaceAll('&#39;', "'");
  const directives = content.split(';').map((d) => d.trim());
  for (const required of REQUIRED_CSP) {
    if (!directives.includes(required))
      problems.push(`Content-Security-Policy is missing "${required}" (found: ${content}).`);
  }
}

// 2. Outside addresses
const URL_RE = /\b(?:https?|wss?):\/\/([a-z0-9.-]+)/gi;
for (const path of files(dist)) {
  if (!/\.(m?js|html|css|json|webmanifest)$/.test(path)) continue;
  const text = readFileSync(path, 'utf8');
  const found = new Set();
  for (const m of text.matchAll(URL_RE)) {
    const host = m[1].toLowerCase().replace(/\.$/, '');
    if (host === 'localhost' || ALLOWED_HOSTS.has(host)) continue;
    found.add(host);
  }
  for (const host of found)
    problems.push(`${relative(root, path)} contains an address on an unknown host: ${host}`);
}

// 3. Size budget
const assets = join(dist, 'assets');
for (const name of readdirSync(assets)) {
  if (!/^index-.*\.js$/.test(name)) continue;
  const kib = Math.round(statSync(join(assets, name)).size / 1024);
  console.log(`App script ${name}: ${kib} KiB (budget ${APP_JS_BUDGET_KIB} KiB)`);
  if (kib > APP_JS_BUDGET_KIB)
    problems.push(`dist/assets/${name} is ${kib} KiB, over the ${APP_JS_BUDGET_KIB} KiB budget.`);
}

if (problems.length) {
  console.error(`\nBuild check failed:\n${problems.map((p) => `- ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('Build check passed: CSP in place, no unknown outside addresses, size within budget.');
