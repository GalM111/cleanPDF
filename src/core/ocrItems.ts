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
 */
export function linesToItems(lines: OcrLine[], scale: number): TextItem[] {
  const items: TextItem[] = [];
  for (const line of lines) {
    // All words of a line share the line's height, so they are read as one
    // line even when one word has a tall letter and its neighbour has none.
    const lineH = (line.bbox.y1 - line.bbox.y0) / scale;
    for (const word of line.words) {
      const str = word.text.trim();
      if (!str || word.confidence < MIN_CONFIDENCE) continue;
      items.push({
        str,
        x: word.bbox.x0 / scale,
        y: line.bbox.y0 / scale - lineH * 0.05,
        w: (word.bbox.x1 - word.bbox.x0) / scale,
        h: lineH * 1.1,
        rtl: RTL.test(str),
        font: 'sans-serif',
      });
    }
  }
  return items;
}
