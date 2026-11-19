import { normValue } from './text';
import { FIELD_KIND, type DetailField, type Details } from './types';

/** Why a match should be looked at; the interface shows the wording. */
export type Note = 'short' | 'fuzzy';

/** A match in the normalised page text, before it is mapped to boxes. */
export interface RawMatch {
  start: number;
  end: number;
  kind: string;
  key: string;
  source: 'details' | 'found';
  note?: Note;
  /** Too uncertain to hide without asking: shown, and hidden only if the user says so. */
  review?: boolean;
}

export const WORD_START = '(?<![\\p{L}\\p{N}])';
export const WORD_END = '(?![\\p{L}\\p{N}])';
// One-letter Hebrew prefixes ("to", "in", "and", "from", "the", "that", "as").
const HEBREW_PREFIX = '(?:[ולבמהשכ]{1,2})?';
const HEBREW_START = /^[\u05D0-\u05EA]/;
const DIGIT_SEP = '[ \\-./]{0,2}';

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const NUMBER_FIELDS: DetailField[] = ['id', 'phone', 'account'];

/** Written forms of a text value that should all be hidden. */
export function textVariants(field: DetailField, value: string): string[] {
  const v = normValue(value);
  if (v.length < 2) return [];
  const out = [v];
  if (field === 'name') {
    const parts = v.split(' ').filter((p) => p.length >= 2);
    if (parts.length > 1) {
      out.push([...parts].reverse().join(' '));
      out.push(...parts);
    }
  } else if (field === 'address') {
    out.push(
      ...v
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length >= 4),
    );
  }
  return [...new Set(out)];
}

/** Digit strings that represent the same number in its common written forms. */
export function numberVariants(field: DetailField, value: string): string[] {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return [];
  const out = [digits];
  if (field === 'id') {
    // Israeli IDs have 9 digits but are often written without leading zeros.
    const stripped = digits.replace(/^0+/, '');
    if (stripped.length >= 5) out.push(stripped);
    if (digits.length < 9) out.push(digits.padStart(9, '0'));
  } else if (field === 'phone') {
    if (digits.startsWith('972')) out.push('0' + digits.slice(3));
    else if (digits.startsWith('0')) out.push('972' + digits.slice(1));
  } else if (field === 'account') {
    // "12-345-678901": also hide the account number when it appears alone.
    const parts = value.split(/\D+/).filter((p) => p.length >= 5);
    if (parts.length > 0 && parts.length < 4) out.push(parts[parts.length - 1]);
  }
  return [...new Set(out)];
}

function textRegex(variant: string): RegExp {
  const prefix = HEBREW_START.test(variant) ? HEBREW_PREFIX : '';
  const body = escapeRegex(variant).replace(/ /g, '\\s+');
  return new RegExp(WORD_START + prefix + body + WORD_END, 'gu');
}

function numberRegex(field: DetailField, digits: string): RegExp {
  const plus = field === 'phone' ? '\\+?' : '';
  return new RegExp(`(?<!\\d)${plus}${digits.split('').join(DIGIT_SEP)}(?!\\d)`, 'g');
}

// Letters that a scan often shows in place of a digit (text is lower-cased).
const LOOKALIKE: Record<string, string> = {
  0: '[0oq]',
  1: '[1li|!]',
  2: '[2z]',
  5: '[5s]',
  8: '[8b]',
};
// Shorter values are not matched loosely: one changed letter is another word.
const FUZZY_MIN = 6;

/** A number as a scan may show it, with look-alike letters in place of digits. */
function fuzzyNumberRegex(field: DetailField, digits: string): RegExp {
  const plus = field === 'phone' ? '\\+?' : '';
  const body = digits
    .split('')
    .map((d) => LOOKALIKE[d] ?? d)
    .join(DIGIT_SEP);
  return new RegExp(`(?<![\\p{L}\\p{N}])${plus}${body}(?![\\p{L}\\p{N}])`, 'gu');
}

/** A text value with any one of its characters misread. */
function fuzzyTextRegex(variant: string): RegExp | null {
  const chars = [...variant];
  if (chars.filter((c) => c !== ' ').length < FUZZY_MIN) return null;
  const prefix = HEBREW_START.test(variant) ? HEBREW_PREFIX : '';
  const piece = (c: string) => (c === ' ' ? '\\s+' : escapeRegex(c));
  const alternatives: string[] = [];
  chars.forEach((c, i) => {
    if (c === ' ') return;
    alternatives.push(chars.map((x, k) => (k === i ? '[\\p{L}\\p{N}]' : piece(x))).join(''));
  });
  return new RegExp(`${WORD_START}${prefix}(?:${alternatives.join('|')})${WORD_END}`, 'gu');
}

/**
 * Layer 1: every occurrence of the user's own details in normalised text.
 * With `fuzzy` (pages read from a scan) small reading errors are allowed.
 */
export function detailMatches(text: string, details: Details, fuzzy = false): RawMatch[] {
  const matches: RawMatch[] = [];
  for (const field of Object.keys(details) as DetailField[]) {
    for (const value of details[field]) {
      const key = `${field}:${normValue(value)}`;
      const kind = FIELD_KIND[field];
      const isNumber = NUMBER_FIELDS.includes(field);
      const variants = isNumber ? numberVariants(field, value) : textVariants(field, value);
      for (const variant of variants) {
        const re = isNumber ? numberRegex(field, variant) : textRegex(variant);
        // A very short name is often also an ordinary word (Hebrew גל is
        // "wave"), so it is shown and left for the user to decide.
        const review = !isNumber && variant.length <= 2;
        for (const m of text.matchAll(re)) {
          matches.push({
            start: m.index,
            end: m.index + m[0].length,
            kind,
            key,
            source: 'details',
            note: review ? 'short' : undefined,
            review: review || undefined,
          });
        }
      }
      if (!fuzzy) continue;
      // After the exact matches, so an exact match of the same text wins.
      for (const variant of variants) {
        const re = isNumber ? fuzzyNumberRegex(field, variant) : fuzzyTextRegex(variant);
        if (!re) continue;
        for (const m of text.matchAll(re)) {
          const start = m.index;
          const end = m.index + m[0].length;
          if (matches.some((x) => x.start === start && x.end === end)) continue;
          matches.push({ start, end, kind, key, source: 'details', note: 'fuzzy' });
        }
      }
    }
  }
  return matches;
}

/**
 * Removes overlapping matches. The user's details win over suggestions, and
 * within each group a longer match wins over a shorter one inside it.
 */
export function resolveOverlaps(details: RawMatch[], found: RawMatch[]): RawMatch[] {
  // An email address that contains one of the user's details (usually their
  // name) is theirs: hide the whole address, not just the name inside it.
  const promoted = found
    .filter(
      (f) =>
        f.kind === 'Email' &&
        details.some(
          (d) => d.start >= f.start && d.end <= f.end && d.end - d.start < f.end - f.start,
        ),
    )
    .map((f): RawMatch => ({ ...f, source: 'details' }));
  details = [...details, ...promoted];

  const accepted: RawMatch[] = [];
  const free = (m: RawMatch) => accepted.every((a) => m.end <= a.start || m.start >= a.end);
  const byLength = (a: RawMatch, b: RawMatch) => b.end - b.start - (a.end - a.start);
  for (const m of [...details].sort(byLength)) if (free(m)) accepted.push(m);
  for (const m of found) if (free(m)) accepted.push(m);
  return accepted.sort((a, b) => a.start - b.start);
}
