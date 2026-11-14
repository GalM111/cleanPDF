import { describe, expect, it } from 'vitest';
import { isIban, isIsraeliId, isLuhn, patternMatches } from './detectors';
import { charSpans, mergeRects } from './geometry';
import { detailMatches, numberVariants, resolveOverlaps } from './matcher';
import { linesToItems } from './ocrItems';
import { buildReplacements, sampleValue } from './replace';
import { scanPage } from './scan';
import { buildStream, normalize, normValue } from './text';
import type { Details, Finding, PageText, TextItem } from './types';

const empty: Details = { name: [], id: [], phone: [], account: [], email: [], address: [], other: [] };
const norm = (s: string) => normalize(s).text;
const hits = (text: string, details: Partial<Details>) => {
  const t = norm(text);
  const all = detailMatches(t, { ...empty, ...details });
  return resolveOverlaps(all, []).map((m) => t.slice(m.start, m.end));
};
const item = (str: string, x: number, y: number, rtl = false): TextItem => ({
  str,
  x,
  y,
  w: str.length * 6,
  h: 12,
  rtl,
  font: 'sans-serif',
});

describe('normalisation', () => {
  it('lower-cases, unifies final letters and strips vowel points', () => {
    expect(normValue('  Dana   LEVI ')).toBe('dana levi');
    expect(normValue('שלום')).toBe('שלומ');
    expect(normValue('שָׁלוֹם')).toBe('שלומ');
  });

  it('joins touching items into one word and breaks lines', () => {
    const s = buildStream([item('Da', 0, 0), item('na', 12, 0), item('Levi', 40, 0), item('next', 0, 30)]);
    expect(s.text).toBe('Dana Levi\nnext');
  });
});

describe('details matcher', () => {
  it('finds a name in any order and each part alone', () => {
    expect(hits('Signed by Levi Dana. Dear Dana,', { name: ['Dana Levi'] })).toEqual([
      'levi dana',
      'dana',
    ]);
  });

  it('does not match inside another word', () => {
    expect(hits('Danabol and Levitate', { name: ['Dana Levi'] })).toEqual([]);
  });

  it('finds Hebrew names with one-letter prefixes', () => {
    expect(hits('שולם לדנה לוי ולדנה', { name: ['דנה לוי'] })).toEqual(['לדנה לוי', 'ולדנה']);
    expect(hits('בגלל הגשם', { name: ['גל'] })).toEqual([]);
  });

  it('finds an ID with separators and without leading zeros', () => {
    expect(hits('ID 01234-5678 or 12345678', { id: ['012345678'] })).toEqual(['01234-5678', '12345678']);
    expect(hits('ref 9912345678', { id: ['012345678'] })).toEqual([]);
  });

  it('finds a phone in local and international form', () => {
    expect(numberVariants('phone', '052-1234567')).toContain('972521234567');
    expect(hits('call +972 52-123-4567 or 0521234567', { phone: ['052-1234567'] })).toEqual([
      '+972 52-123-4567',
      '0521234567',
    ]);
  });

  it('finds a name split across a line break', () => {
    expect(hits('tenant Dana\nLevi agrees', { name: ['Dana Levi'] })).toEqual(['dana\nlevi']);
  });
});

describe('detectors', () => {
  it('validates check digits', () => {
    expect(isIsraeliId('123456782')).toBe(true);
    expect(isIsraeliId('123456789')).toBe(false);
    expect(isLuhn('4111111111111111')).toBe(true);
    expect(isIban('gb82west12345698765432')).toBe(true);
  });

  it('suggests emails, phones, valid IDs and labelled values', () => {
    const t = norm('Name: Yossi Cohen\nmail yossi@example.com tel 03-1234567 id 123456782 ref 123456789');
    const found = patternMatches(t).map((m) => `${m.kind}=${t.slice(m.start, m.end)}`);
    expect(found).toContain('Email=yossi@example.com');
    expect(found).toContain('Phone=03-1234567');
    expect(found).toContain('ID number=123456782');
    expect(found).not.toContain('ID number=123456789');
    expect(found).toContain('Name=yossi cohen');
  });

  it('reads Hebrew labels and stops at the next label', () => {
    const t = norm('שם: יוסי כהן ת.ז: 123456782');
    const found = patternMatches(t).map((m) => `${m.kind}=${t.slice(m.start, m.end)}`);
    expect(found).toContain('Name=יוסי כהנ');
    expect(found).toContain('ID number=123456782');
  });
});

describe('scan', () => {
  it('hides a whole email address that contains the user name', () => {
    const page: PageText = { width: 600, height: 800, items: [item('Mail dana.levi@example.com now', 10, 20)] };
    const findings = scanPage(0, page, { ...empty, name: ['Dana Levi'] });
    expect(findings.map((f) => [f.source, f.kind, f.text])).toEqual([
      ['details', 'Email', 'dana.levi@example.com'],
    ]);
  });
});

describe('replacements', () => {
  it('makes sample values of the same shape and language', () => {
    expect(sampleValue('Name', 'Dana Levi', 0)).toBe('John Doe');
    expect(sampleValue('Name', 'Dana', 0)).toBe('John');
    // A sample that fits the space of the original is preferred.
    expect(sampleValue('Name', 'דנה לוי', 0)).toBe('משה כהן');
    expect(sampleValue('Name', 'אלכסנדרה רוזנברג', 0)).toBe('ישראל ישראלי');
    expect(sampleValue('Address', '12 Herzl St, Tel Aviv', 0)).toBe('1 Main St, Anytown');
    const phone = sampleValue('Phone', '052-1234567', 0);
    expect(phone).toMatch(/^05\d-\d{7}$/);
    expect(phone).not.toBe('052-1234567');
    expect(sampleValue('ID number', '123456782', 0)).toMatch(/^\d{9}$/);
    expect(sampleValue('Custom', 'Acme Ltd', 0)).toBe('');
  });

  it('gives the same value the same replacement and numbers different ones', () => {
    const f = (id: string, key: string, text: string): Finding => ({
      id,
      page: 0,
      source: 'details',
      kind: 'Name',
      text,
      key,
      rects: [],
    });
    const hidden = [f('a', 'k1', 'Dana Levi'), f('b', 'k2', 'Yossi Cohen'), f('c', 'k1', 'Dana Levi')];
    const labels = buildReplacements([...hidden], 'template');
    expect([labels.get('a'), labels.get('b'), labels.get('c')]).toEqual(['[NAME 1]', '[NAME 2]', '[NAME 1]']);
    const samples = buildReplacements([...hidden], 'sample');
    expect([samples.get('a'), samples.get('b'), samples.get('c')]).toEqual(['John Doe', 'Jane Roe', 'John Doe']);
    expect(buildReplacements([...hidden], 'black').size).toBe(0);
  });
});

describe('geometry', () => {
  it('places right-to-left characters from the right and digits left to right', () => {
    // Reading order: Hebrew letter, space, "12". Drawn as: 12 [space] letter.
    const spans = charSpans('א 12', true, [1, 1, 1, 1]);
    expect(spans[0]).toEqual([0.75, 1]);
    expect(spans[2]).toEqual([0, 0.25]);
    expect(spans[3]).toEqual([0.25, 0.5]);
  });

  it('returns boxes only for the matched part of an item', () => {
    const page: PageText = { width: 600, height: 800, items: [item('Tenant: Dana Levi, born 1990', 10, 20)] };
    const findings = scanPage(0, page, { ...empty, name: ['Dana Levi'] });
    expect(findings).toHaveLength(1);
    expect(findings[0].text).toBe('Dana Levi');
    const r = findings[0].rects[0];
    expect(r.x).toBeCloseTo(10 + 8 * 6 - 1.5);
    expect(r.w).toBeCloseTo(9 * 6 + 3);
  });
});

describe('short names', () => {
  it('leaves a two-letter name for review instead of hiding it', () => {
    const t = norm('גל כהן שילם. היה גל גדול בים.');
    const all = detailMatches(t, { ...empty, name: ['גל כהן'] });
    const full = all.find((m) => t.slice(m.start, m.end) === 'גל כהנ');
    const alone = all.filter((m) => t.slice(m.start, m.end) === 'גל');
    expect(full?.review).toBeUndefined();
    expect(alone.length).toBeGreaterThan(0);
    expect(alone.every((m) => m.review)).toBe(true);
  });
});

describe('scanned pages', () => {
  const fuzzy = (text: string, details: Partial<Details>) => {
    const t = norm(text);
    return resolveOverlaps(detailMatches(t, { ...empty, ...details }, true), []).map((m) => ({
      text: t.slice(m.start, m.end),
      note: m.note,
    }));
  };

  it('turns OCR words into items on a shared line box', () => {
    const items = linesToItems(
      [
        {
          bbox: { x0: 30, y0: 60, x1: 300, y1: 90 },
          words: [
            { text: 'Dana', confidence: 90, bbox: { x0: 30, y0: 66, x1: 120, y1: 90 } },
            { text: 'לוי', confidence: 80, bbox: { x0: 150, y0: 60, x1: 210, y1: 88 } },
            { text: '~', confidence: 3, bbox: { x0: 250, y0: 60, x1: 300, y1: 88 } },
          ],
        },
      ],
      3,
    );
    expect(items.map((i) => i.str)).toEqual(['Dana', 'לוי']);
    expect(items[0].y).toBe(items[1].y);
    expect(items[0].x).toBeCloseTo(10);
    expect(items[0].w).toBeCloseTo(30);
    // The line box (60 to 90 px, plus a margin) is used, not the word's own.
    expect(items[0].y).toBeCloseTo(19.5);
    expect(items[0].h).toBeCloseTo(11);
    expect(items.map((i) => i.rtl)).toEqual([false, true]);
    expect(buildStream(items).text).toBe('Dana לוי');
  });

  it('puts boxes back on a page that was straightened before reading', () => {
    const word = { text: 'Dana', confidence: 90, bbox: { x0: 900, y0: 480, x1: 1000, y1: 520 } };
    const [it] = linesToItems([{ bbox: word.bbox, words: [word] }], 1, -Math.PI / 2, { width: 1000, height: 1000 });
    // A quarter turn about the centre moves the middle of the right edge to the middle of the bottom edge.
    expect(it.x + it.w / 2).toBeCloseTo(500);
    expect(it.y + it.h / 2).toBeCloseTo(950);
  });

  it('joins word boxes on one line and keeps separate lines apart', () => {
    const r = (x: number, y: number) => ({ x, y, w: 30, h: 12 });
    expect(mergeRects([r(0, 0), r(34, 1), r(70, 2), r(0, 30)])).toEqual([
      { x: 0, y: 0, w: 100, h: 14 },
      { x: 0, y: 30, w: 30, h: 12 },
    ]);
  });

  it('accepts one misread character in longer values and marks it', () => {
    expect(fuzzy('Tenant: Dana Lcvi', { name: ['Dana Levi'] })).toEqual([
      { text: 'dana lcvi', note: 'fuzzy' },
    ]);
    expect(fuzzy('Dana Levi', { name: ['Dana Levi'] })).toEqual([{ text: 'dana levi', note: undefined }]);
    // Too short to match loosely: "Lena" is a different name, not a misread "Dana".
    expect(fuzzy('Lena', { name: ['Dana'] })).toEqual([]);
  });

  it('reads look-alike letters as digits in numbers', () => {
    expect(fuzzy('ID O123456l8', { id: ['012345618'] }).map((m) => m.text)).toEqual(['o123456l8']);
    expect(hits('ID O123456l8', { id: ['012345618'] })).toEqual([]);
  });
});
