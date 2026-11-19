import type { CharRef } from './text';
import type { Rect, TextItem } from './types';

/** Returns a relative width for every character of a string. */
export type Measure = (str: string, font: string) => number[];

export const uniformMeasure: Measure = (str) => Array.from({ length: str.length }, () => 1);

const R = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/;
const L = /[A-Za-z0-9À-ɏ]/;

/**
 * Works out where each character of a text item sits horizontally, as a
 * [left, right] fraction of the item's width. Text is stored in reading order,
 * but in a right-to-left item the first character is drawn on the right, and
 * numbers or Latin words inside Hebrew text still run left to right. This is a
 * simplified version of the Unicode bidirectional algorithm, enough for
 * Hebrew mixed with digits and Latin text.
 */
export function charSpans(str: string, baseRtl: boolean, widths: number[]): [number, number][] {
  const n = str.length;
  const total = widths.reduce((a, b) => a + b, 0) || 1;
  const base = baseRtl ? 'R' : 'L';

  const types: string[] = [];
  for (let i = 0; i < n; i++) types.push(R.test(str[i]) ? 'R' : L.test(str[i]) ? 'L' : 'N');
  // Neutral characters (spaces, punctuation) take the direction of their
  // neighbours when both sides agree, otherwise the base direction.
  for (let i = 0; i < n; i++) {
    if (types[i] !== 'N') continue;
    let j = i;
    while (j < n && types[j] === 'N') j++;
    const before = i > 0 ? types[i - 1] : base;
    const after = j < n ? types[j] : base;
    const resolved = before === after ? before : base;
    for (let k = i; k < j; k++) types[k] = resolved;
    i = j - 1;
  }

  const spans: [number, number][] = new Array(n);
  let cursor = baseRtl ? 1 : 0;
  let i = 0;
  while (i < n) {
    let j = i;
    let runWidth = 0;
    while (j < n && types[j] === types[i]) runWidth += widths[j++] / total;
    const left = baseRtl ? cursor - runWidth : cursor;
    if (types[i] === 'L') {
      let pos = left;
      for (let k = i; k < j; k++) {
        const w = widths[k] / total;
        spans[k] = [pos, pos + w];
        pos += w;
      }
    } else {
      let pos = left + runWidth;
      for (let k = i; k < j; k++) {
        const w = widths[k] / total;
        spans[k] = [pos - w, pos];
        pos -= w;
      }
    }
    cursor = baseRtl ? cursor - runWidth : cursor + runWidth;
    i = j;
  }
  return spans;
}

const PAD = 1.5;

/** Boxes on the page that cover the stream characters from start to end. */
export function rangeRects(
  items: TextItem[],
  ref: (CharRef | null)[],
  start: number,
  end: number,
  measure: Measure,
): Rect[] {
  const byItem = new Map<number, number[]>();
  for (let i = start; i < end; i++) {
    const r = ref[i];
    if (!r) continue;
    const list = byItem.get(r.item);
    if (list) list.push(r.ch);
    else byItem.set(r.item, [r.ch]);
  }

  const rects: Rect[] = [];
  for (const [index, chars] of byItem) {
    const it = items[index];
    if (it.whole) {
      rects.push({ x: it.x - PAD, y: it.y - PAD, w: it.w + 2 * PAD, h: it.h + 2 * PAD });
      continue;
    }
    const spans = charSpans(it.str, it.rtl, measure(it.str, it.font));
    const intervals = chars.map((c) => spans[c]).sort((a, b) => a[0] - b[0]);
    let cur: [number, number] = [intervals[0][0], intervals[0][1]];
    const flush = () =>
      rects.push({
        x: it.x + cur[0] * it.w - PAD,
        y: it.y,
        w: (cur[1] - cur[0]) * it.w + 2 * PAD,
        h: it.h,
      });
    for (let k = 1; k < intervals.length; k++) {
      if (intervals[k][0] <= cur[1] + 1e-6) cur[1] = Math.max(cur[1], intervals[k][1]);
      else {
        flush();
        cur = [intervals[k][0], intervals[k][1]];
      }
    }
    flush();
  }
  return rects;
}
