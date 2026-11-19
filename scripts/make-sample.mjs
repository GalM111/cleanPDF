// Generates public/sample.pdf: a made-up rental agreement in English and
// Hebrew, used by the "Try it with a sample document" button and for testing.
// All people and numbers in it are invented.
// Needs a TrueType font with Hebrew letters. Looks for one on Windows, macOS and
// Linux; set the SAMPLE_FONT environment variable to use a different file.
// The numbers are well-known dummies or obviously fake, so they are not
// meant to match a real person.
import fontkit from '@pdf-lib/fontkit';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, rgb } from 'pdf-lib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FONT_CANDIDATES = [
  'C:/Windows/Fonts/arial.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/Library/Fonts/Arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/TTF/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
];
const fontPath = process.env.SAMPLE_FONT ?? FONT_CANDIDATES.find((p) => existsSync(p));
if (!fontPath) {
  console.error(
    'No font with Hebrew letters found. Set SAMPLE_FONT to the path of a .ttf file, for example:\n' +
      '  SAMPLE_FONT=/path/to/NotoSansHebrew-Regular.ttf npm run sample',
  );
  process.exit(1);
}

// A Hebrew line is drawn run by run from the right edge: Hebrew runs (the font
// engine lays those out right to left by itself) and number or Latin runs,
// which keep their left-to-right order.
const LTR_RUN = /[0-9A-Za-z][0-9A-Za-z\-.@/+]*[0-9A-Za-z]|[0-9A-Za-z]/g;
function runs(line) {
  const out = [];
  let last = 0;
  for (const m of line.matchAll(LTR_RUN)) {
    if (m.index > last) out.push(line.slice(last, m.index));
    out.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

function iban(bank, branch, account) {
  const bban = bank + branch + account.padStart(13, '0');
  const rem = BigInt(bban + '1821' + '00') % 97n; // I=18, L=21
  return `IL${String(98n - rem).padStart(2, '0')}${bban}`;
}

const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const font = await doc.embedFont(readFileSync(fontPath), { subset: true });
doc.setTitle('Rental agreement - Dana Levi');
doc.setAuthor('Dana Levi');

const W = 595;
const H = 842;
const M = 56;
const page = doc.addPage([W, H]);
let y = H - 70;

const en = (text, size = 11) => {
  page.drawText(text, { x: M, y, size, font, color: rgb(0.1, 0.1, 0.1) });
  y -= size * 1.75;
};
const he = (text, size = 11) => {
  let right = W - M;
  for (const run of runs(text)) {
    right -= font.widthOfTextAtSize(run, size);
    page.drawText(run, { x: right, y, size, font, color: rgb(0.1, 0.1, 0.1) });
  }
  y -= size * 1.75;
};
const gap = (n = 10) => (y -= n);

en('Residential Rental Agreement', 18);
gap();
en('Made on 1 March 2026 between the landlord and the tenant named below.');
gap();
en('Tenant');
en('Full name: Dana Levi');
en('ID number: 123456782');
en('Phone: 052-1234567');
en('Email: dana.levi@example.com');
en('Address: 12 Herzl St, Tel Aviv');
gap();
en('Landlord');
en('Name: Yossi Cohen');
en('ID: 111111118');
en('Phone: 03-0000000');
gap();
en('1. The landlord rents to Dana Levi the apartment at 12 Herzl St, Tel Aviv.');
en('2. Rent of 5,200 NIS is paid monthly to bank account 12-999-000001.');
en(`3. Transfers may also use IBAN ${iban('012', '999', '000001')}.`);
en('4. Levi Dana confirms receiving two keys. Contact: +972 52-123-4567.');
gap(24);

he('הסכם שכירות למגורים', 18);
gap();
he('נערך ביום 1 במרץ 2026 בין המשכיר לבין השוכרת.');
gap();
he('שם מלא: דנה לוי');
he('ת.ז: 123456782');
he('טלפון: 052-1234567');
he('כתובת: רחוב הרצל 12, תל אביב');
gap();
he('שם המשכיר: יוסי כהן');
he('ת.ז: 111111118');
gap();
he('1. המשכיר משכיר לדנה לוי את הדירה ברחוב הרצל 12, תל אביב.');
he('2. דמי השכירות ישולמו לחשבון בנק 12-999-000001.');
he('3. ההודעות יישלחו לדנה בדוא"ל dana.levi@example.com או בטלפון 0521234567.');

writeFileSync(join(root, 'public', 'sample.pdf'), await doc.save());
console.log('Wrote public/sample.pdf');
