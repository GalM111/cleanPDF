import { normValue } from './text';
import { FIELD_KIND, type DetailField, type Details } from './types';

/** A match in the normalised page text, before it is mapped to boxes. */
export interface RawMatch {
  start: number;
  end: number;
  kind: string;
  key: string;
  source: 'details' | 'found';
  note?: string;
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

/** Layer 1: every occurrence of the user's own details in normalised text. */
export function detailMatches(text: string, details: Details): RawMatch[] {
  const matches: RawMatch[] = [];
  for (const field of Object.keys(details) as DetailField[]) {
    for (const value of details[field]) {
      const key = `${field}:${normValue(value)}`;
      const kind = FIELD_KIND[field];
      const isNumber = NUMBER_FIELDS.includes(field);
      const variants = isNumber ? numberVariants(field, value) : textVariants(field, value);
      for (const variant of variants) {
        const re = isNumber ? numberRegex(field, variant) : textRegex(variant);
        const note = !isNumber && variant.length <= 2 ? 'Short word, please check' : undefined;
        for (const m of text.matchAll(re)) {
          matches.push({
            start: m.index,
            end: m.index + m[0].length,
            kind,
            key,
            source: 'details',
            note,
          });
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
