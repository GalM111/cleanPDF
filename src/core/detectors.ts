import { escapeRegex, WORD_START, type RawMatch } from './matcher';
import { normValue } from './text';

/** Israeli ID check digit (9 digits, alternating weights 1 and 2). */
export function isIsraeliId(digits: string): boolean {
  if (!/^\d{9}$/.test(digits) || /^0+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const n = Number(digits[i]) * ((i % 2) + 1);
    sum += n > 9 ? n - 9 : n;
  }
  return sum % 10 === 0;
}

/** Luhn check used by payment card numbers. */
export function isLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/** IBAN mod-97 check. Expects lower-case letters and digits without spaces. */
export function isIban(iban: string): boolean {
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const c of moved) {
    const value = c >= 'a' && c <= 'z' ? String(c.charCodeAt(0) - 87) : c;
    for (const d of value) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

interface Pattern {
  kind: string;
  re: RegExp;
  valid?: (compact: string) => boolean;
}

const compact = (s: string) => s.replace(/[\s\-./+]/g, '');

// Order matters: earlier patterns win when two overlap.
const PATTERNS: Pattern[] = [
  { kind: 'Email', re: /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/g },
  { kind: 'IBAN', re: /(?<![a-z0-9])il\d{2}(?: ?\d){19}(?![a-z0-9])/g, valid: isIban },
  // Before Phone: nine digits in a row with a valid check digit read as an ID,
  // even when they also look like a landline number.
  { kind: 'ID number', re: /(?<!\d)\d{9}(?!\d)/g, valid: isIsraeliId },
  {
    kind: 'Phone',
    re: /(?<!\d)(?:\+?972[- ]?|0)(?:5\d|7\d|[23489])[- ]?\d{3}[- ]?\d{4}(?!\d)/g,
  },
  // Israeli bank account written as bank-branch-account (12-999-000001).
  // After Phone, so a landline with dashes is still read as a phone.
  { kind: 'Bank account', re: /(?<!\d)\d{2}-\d{3}-\d{4,9}(?!\d)/g },
  {
    kind: 'Card number',
    re: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g,
    valid: (c) => isLuhn(c),
  },
];

// Field labels in English and Hebrew. The value after the label is suggested.
const LABELS: [string, string[]][] = [
  [
    'Name',
    [
      'full name',
      'first name',
      'last name',
      'surname',
      'name',
      'שם מלא',
      'שם פרטי',
      'שם משפחה',
      'שם',
    ],
  ],
  [
    'ID number',
    [
      'id number',
      'id no',
      'id',
      'passport',
      'תעודת זהות',
      'מספר זהות',
      "מס' זהות",
      'ת.ז.',
      'ת.ז',
      'ת"ז',
      'דרכון',
    ],
  ],
  ['Address', ['address', 'כתובת', 'מען']],
  ['Phone', ['phone', 'mobile', 'tel', 'טלפון', 'נייד', 'טל']],
  [
    'Bank account',
    ['account number', 'account no', 'account', 'מספר חשבון', "מס' חשבון", 'חשבון בנק', 'חשבון'],
  ],
  ['Email', ['email', 'e-mail', 'דוא"ל', 'מייל']],
];

const LABEL_KIND = new Map<string, string>();
for (const [kind, labels] of LABELS) for (const l of labels) LABEL_KIND.set(normValue(l), kind);
const LABEL_ALT = [...LABEL_KIND.keys()]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  .join('|');
// label, an optional extra word ("name of employee" style), a colon, the value.
const LABEL_RE = new RegExp(
  `${WORD_START}(${LABEL_ALT})(?: [\\p{L}"']{1,14})?\\s*:[ ]*([^\\n]{2,40})`,
  'gu',
);
const NEXT_LABEL_RE = new RegExp(`${WORD_START}(?:${LABEL_ALT})(?: [\\p{L}"']{1,14})?\\s*:`, 'u');

/** Layer 2: values that look sensitive, found by pattern or by field label. */
export function patternMatches(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  const push = (start: number, end: number, kind: string) =>
    out.push({
      start,
      end,
      kind,
      key: `found:${kind}:${compact(text.slice(start, end))}`,
      source: 'found',
    });

  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const raw = m[0].replace(/[\s-]+$/, '');
      if (p.valid && !p.valid(compact(raw))) continue;
      push(m.index, m.index + raw.length, p.kind);
    }
  }

  const labelRe = new RegExp(LABEL_RE);
  let m: RegExpExecArray | null;
  while ((m = labelRe.exec(text))) {
    let value = m[2];
    const next = value.search(NEXT_LABEL_RE);
    if (next >= 0) value = value.slice(0, next);
    const trimmed = value.replace(/[\s,;.:|]+$/, '');
    const start = m.index + m[0].length - m[2].length;
    // Continue right after this value so a second label on the same line is read too.
    labelRe.lastIndex = start + Math.max(trimmed.length, 1);
    if (trimmed.length < 2) continue;
    push(start, start + trimmed.length, LABEL_KIND.get(m[1]) ?? 'Other');
  }
  return out;
}
