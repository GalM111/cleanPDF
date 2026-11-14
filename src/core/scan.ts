import { patternMatches } from './detectors';
import { rangeRects, uniformMeasure, type Measure } from './geometry';
import { detailMatches, resolveOverlaps } from './matcher';
import { buildStream, normalize } from './text';
import type { Details, Finding, PageText } from './types';

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
  const matches = resolveOverlaps(detailMatches(norm.text, details), found);

  const findings: Finding[] = [];
  for (const m of matches) {
    const start = norm.map[m.start];
    const end = norm.map[m.end - 1] + 1;
    const rects = rangeRects(page.items, stream.ref, start, end, measure);
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
    });
  }
  return findings;
}
