import type { TextItem } from './types';

/** Points a character of the page stream back to the text item it came from. */
export interface CharRef {
  item: number;
  ch: number;
}

/** All text of a page as one string, with every character mapped to its item. */
export interface Stream {
  text: string;
  ref: (CharRef | null)[];
}

/** Normalised text plus, for each character, its index in the original string. */
export interface Norm {
  text: string;
  map: number[];
}

/**
 * Joins the text items of a page into one string. Items on the same line that
 * touch each other are joined without a space, so a word that the PDF split
 * into several pieces is still found as one word.
 */
export function buildStream(items: TextItem[]): Stream {
  let text = '';
  const ref: (CharRef | null)[] = [];
  let prev: TextItem | null = null;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.str) continue;
    if (prev) {
      const sameLine =
        Math.abs(prev.y + prev.h / 2 - (it.y + it.h / 2)) < Math.max(prev.h, it.h) * 0.5;
      // Form fields and comments never run on into the page text.
      if (!sameLine || it.whole || prev.whole) {
        text += '\n';
        ref.push(null);
      } else {
        const gap = Math.max(it.x - (prev.x + prev.w), prev.x - (it.x + it.w));
        if (gap > Math.min(prev.h, it.h) * 0.15) {
          text += ' ';
          ref.push(null);
        }
      }
    }
    for (let c = 0; c < it.str.length; c++) {
      text += it.str[c];
      ref.push({ item: i, ch: c });
    }
    prev = it;
  }
  return { text, ref };
}

const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
// Hebrew vowel points and cantillation, bidi controls, zero-width characters.
const DROP =
  /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;

/** Normalises one character. Returns '' when the character should be dropped. */
export function normChar(c: string): string {
  if (DROP.test(c)) return '';
  if (FINALS[c]) return FINALS[c];
  if (/[‐-―−־]/.test(c)) return '-';
  if (/[‘’׳`]/.test(c)) return "'";
  if (/[“”״]/.test(c)) return '"';
  if (c === ' ' || c === '\t' || c === '\r') return ' ';
  const lower = c.toLowerCase();
  return lower.length === 1 ? lower : c;
}

/** Normalises text for matching and keeps a map back to the original indices. */
export function normalize(text: string): Norm {
  let out = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const n = normChar(text[i]);
    if (!n) continue;
    if (n === ' ' && (out.endsWith(' ') || out.endsWith('\n'))) continue;
    out += n;
    map.push(i);
  }
  return { text: out, map };
}

/** Normalises a value typed by the user the same way as document text. */
export function normValue(value: string): string {
  return normalize(value).text.replace(/\s+/g, ' ').trim();
}
