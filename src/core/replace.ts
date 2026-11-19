import type { Finding, Rect } from './types';

/** How a hidden value is drawn in the output. */
export type OutputMode = 'black' | 'white' | 'page' | 'template' | 'sample';

export const MODES: { mode: OutputMode; label: string; hint: string }[] = [
  { mode: 'black', label: 'Black', hint: 'Solid black box' },
  { mode: 'white', label: 'White', hint: 'Solid white box' },
  { mode: 'page', label: 'Page colour', hint: 'Blends into the page background' },
  { mode: 'template', label: 'Labels', hint: 'A label such as [NAME]' },
  { mode: 'sample', label: 'Sample data', hint: 'Made-up values such as John Doe' },
];

// Candidates in order of preference. Several lengths, so a sample can be
// picked that fits the space of the value it replaces.
const EN_NAMES = [
  'John Doe',
  'Jane Roe',
  'Alex Smith',
  'Sam Brown',
  'Chris Green',
  'Jo Poe',
  'Li Wu',
];
const HE_NAMES = ['ישראל ישראלי', 'משה כהן', 'נועה בר', 'רון טל', 'יעל גור', 'דן לב'];
const EMAILS = ['john.doe@example.com', 'jane.roe@example.com', 'jd@example.com', 'a@b.co'];
const EN_ADDRESSES = ['# Sample St, Sampletown', '# Main St, Anytown', '# Main St'];
const HE_ADDRESSES = ['רחוב הדוגמה #, עיר הדוגמה', 'רחוב הגפן #, חיפה', 'הגפן #'];
const HEBREW = /[א-ת]/;

/**
 * Picks the index-th candidate among those that fit in `room` characters.
 * Falls back to the shortest candidate when none fits.
 */
function pick(candidates: string[], index: number, room: number): string {
  const fitting = candidates.filter((c) => c.length <= room + 1);
  if (fitting.length) return fitting[index % fitting.length];
  return candidates.reduce((a, b) => (b.length < a.length ? b : a));
}

export const isHebrew = (text: string) => HEBREW.test(text);

/** Replaces digits with made-up ones and keeps the layout (dashes, spaces, length). */
function fakeDigits(text: string, seed: number, keep: number): string {
  const total = text.replace(/\D/g, '').length;
  let seen = 0;
  return text.replace(/\d/g, (d) => {
    const i = seen++;
    // Counted from the right, so 052-1234567 and +972 52-123-4567 end the same.
    return i < keep ? d : String((seed * 7 + (total - i) * 3 + 1) % 10);
  });
}

/**
 * A made-up value of the same kind, shape and language as the original.
 * `index` picks the identity, so the same person gets the same sample name
 * everywhere. Returns '' when there is no sensible sample (free text).
 */
export function sampleValue(kind: string, text: string, index: number): string {
  const he = isHebrew(text);
  const room = text.trim().length;
  switch (kind) {
    case 'Name': {
      const names = he ? HE_NAMES : EN_NAMES;
      const single = text.trim().split(/\s+/).length === 1;
      return pick(single ? names.map((n) => n.split(' ')[0]) : names, index, room);
    }
    case 'Email':
      return pick(EMAILS, index, room);
    case 'Address':
      return pick(he ? HE_ADDRESSES : EN_ADDRESSES, 0, room).replace('#', String(index + 1));
    case 'Phone':
      // Keep the prefix (05 / 03 / +972) so it still reads as a phone number.
      return fakeDigits(text, index, text.trim().startsWith('+') ? 4 : 2);
    case 'ID number':
    case 'Bank account':
    case 'IBAN':
    case 'Card number':
      return fakeDigits(text, index, 0);
    default:
      return '';
  }
}

/**
 * The text drawn in place of each hidden finding, by finding id.
 * Labels and sample values are consistent: one value, one replacement.
 */
export function buildReplacements(hidden: Finding[], mode: OutputMode): Map<string, string> {
  const out = new Map<string, string>();
  if (mode !== 'template' && mode !== 'sample') return out;

  // Numbered per kind and language, so a person entered in English and in
  // Hebrew gets the first sample name in each language.
  const group = (f: Finding) => `${f.kind}|${isHebrew(f.text)}`;
  const keysByKind = new Map<string, string[]>();
  for (const f of hidden) {
    const keys = keysByKind.get(group(f)) ?? [];
    if (!keys.includes(f.key)) keys.push(f.key);
    keysByKind.set(group(f), keys);
  }
  for (const f of hidden) {
    const keys = keysByKind.get(group(f))!;
    const index = keys.indexOf(f.key);
    out.set(
      f.id,
      mode === 'template'
        ? `[${f.kind.toUpperCase()}${keys.length > 1 ? ` ${index + 1}` : ''}]`
        : sampleValue(f.kind, f.text, index),
    );
  }
  return out;
}

/** A finding can span several boxes; its replacement text goes in the widest. */
export function widestIndex(rects: Rect[]): number {
  let best = 0;
  rects.forEach((r, i) => {
    if (r.w > rects[best].w) best = i;
  });
  return best;
}
