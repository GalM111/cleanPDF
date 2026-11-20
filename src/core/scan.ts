import { patternMatches } from './detectors';
import { mergeRects, rangeRects, uniformMeasure, type Measure } from './geometry';
import { detailMatches, resolveOverlaps } from './matcher';
import { buildStream, normalize } from './text';
import type { Details, Finding, PageText, Rect } from './types';

/**
 * Scans one page: finds the user's details (layer 1) and other sensitive
 * values (layer 2), and returns them with their boxes on the page.
 */
export function scanPage(
  pageIndex: number,
  page: PageText,
  details: Details,
  ignore: ReadonlySet<string> = new Set(),
  measure: Measure = uniformMeasure,
): Finding[] {
  const stream = buildStream(page.items);
  const norm = normalize(stream.text);
  const found = patternMatches(norm.text).filter((m) => !ignore.has(m.key));
  const matches = resolveOverlaps(detailMatches(norm.text, details, page.ocr), found);

  const findings: Finding[] = [];
  for (const m of matches) {
    const start = norm.map[m.start];
    const end = norm.map[m.end - 1] + 1;
    const raw = rangeRects(page.items, stream.ref, start, end, measure);
    const rects = page.ocr ? mergeRects(raw) : raw;
    if (rects.length === 0) continue;
    findings.push({
      id: `${pageIndex}:${start}:${end}:${m.source}`,
      page: pageIndex,
      source: m.source,
      kind: m.kind,
      text: stream.text.slice(start, end).replace(/\s+/g, ' '),
      key: m.key,
      rects,
      note: m.note,
      review: m.review,
    });
  }
  return findings;
}

/** A decoded barcode or QR code, as `findBarcodes` returns it. */
export interface PageCode {
  text: string;
  format: string;
  rect: Rect;
}

const MAX_SHOWN = 40;

/**
 * Turns the barcodes and QR codes on a page into findings. A code whose
 * content holds one of the user's details is theirs and hidden by default;
 * any other code is a suggestion, marked when its content looks personal.
 */
export function barcodeFindings(
  pageIndex: number,
  codes: PageCode[],
  details: Details,
  ignore: ReadonlySet<string> = new Set(),
): Finding[] {
  return codes.flatMap((c, i) => {
    const key = `found:Barcode:${c.format}:${c.text}`;
    if (ignore.has(key)) return [];
    const norm = normalize(c.text).text;
    const mine = detailMatches(norm, details).length > 0;
    const personal = mine || patternMatches(norm).length > 0;
    const shown = c.text.trim() || c.format;
    const finding: Finding = {
      id: `${pageIndex}:barcode:${i}:${mine ? 'details' : 'found'}`,
      page: pageIndex,
      source: mine ? 'details' : 'found',
      kind: 'Barcode',
      text: shown.length > MAX_SHOWN ? `${shown.slice(0, MAX_SHOWN)}…` : shown,
      key,
      rects: [c.rect],
      note: mine ? 'barcodeMine' : personal ? 'barcodeData' : undefined,
    };
    return [finding];
  });
}
