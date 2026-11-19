import type { TextItem } from './types';

/** A word as the OCR engine reports it, in image pixels. */
export interface OcrWord {
  text: string;
  /** 0 to 100. */
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrLine {
  bbox: { x0: number; y0: number; x1: number; y1: number };
  words: OcrWord[];
}

const RTL = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/;
// Below this the engine is guessing at noise (specks, stamps, table lines).
const MIN_CONFIDENCE = 15;

/**
 * Turns OCR words into the same text items a PDF with real text gives, so
 * the rest of the app treats a scan like any other page. `scale` is image
 * pixels per page unit.
 *
 * When the engine straightened a tilted picture before reading it, the boxes
 * it reports belong to the straightened picture. `tilt` (radians, as the
 * engine reports it) and the picture size turn them back to where the words
 * are on the page as the user sees it.
 */
export function linesToItems(
  lines: OcrLine[],
  scale: number,
  tilt = 0,
  size: { width: number; height: number } = { width: 0, height: 0 },
): TextItem[] {
  const cos = Math.cos(-tilt);
  const sin = Math.sin(-tilt);
  const cx = size.width / 2;
  const cy = size.height / 2;
  const items: TextItem[] = [];
  for (const line of lines) {
    // All words of a line share the line's height and centre, so they are
    // read as one line even when one word has a tall letter and its
    // neighbour has none.
    const lineH = (line.bbox.y1 - line.bbox.y0) * 1.1;
    const lineY = (line.bbox.y0 + line.bbox.y1) / 2 - cy;
    for (const word of line.words) {
      const str = word.text.trim();
      if (!str || word.confidence < MIN_CONFIDENCE) continue;
      const w = word.bbox.x1 - word.bbox.x0;
      const wordX = (word.bbox.x0 + word.bbox.x1) / 2 - cx;
      const x = cx + wordX * cos - lineY * sin;
      const y = cy + wordX * sin + lineY * cos;
      // A tilted word needs a slightly taller upright box to be covered.
      const h = lineH + w * Math.abs(sin);
      items.push({
        str,
        x: (x - w / 2) / scale,
        y: (y - h / 2) / scale,
        w: w / scale,
        h: h / scale,
        rtl: RTL.test(str),
        font: 'sans-serif',
        word: true,
      });
    }
  }
  return items;
}
