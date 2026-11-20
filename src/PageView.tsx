import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { capScale, startRender, type PDFPageProxy } from './core/pdf';
import { widestIndex, type OutputMode } from './core/replace';
import type { ScanState } from './App';
import type { Strings } from './i18n';
import type { Finding, ManualBox, Rect } from './core/types';

interface Props {
  page: PDFPageProxy;
  index: number;
  width: number;
  height: number;
  hasText: boolean;
  /** Pictures on the page: text inside them is not found automatically. */
  images: number;
  /** Form fields, signatures, stamps and drawings on the page. */
  marks: number;
  /** The text of this page was read from its picture. */
  ocr: boolean;
  /** Set while the page is being read as a scan. */
  scan: ScanState | undefined;
  onReadAsScan: () => void;
  findings: Finding[];
  isHidden: (f: Finding) => boolean;
  mode: OutputMode;
  t: Strings;
  replacement: (f: Finding) => string;
  manual: ManualBox[];
  onToggle: (f: Finding) => void;
  onAddManual: (page: number, rect: Rect) => void;
  onUpdateManual: (id: string, rect: Rect) => void;
  onRemoveManual: (id: string) => void;
  /** Phones: a finger draws only while this is on; otherwise it scrolls. */
  drawing: boolean;
}

type Corner = 'nw' | 'ne' | 'sw' | 'se';
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];
const MIN_SIDE = 4;

/** What a pointer drag is doing: drawing a new box, or moving / resizing one. */
type Drag =
  | { kind: 'draw'; origin: { x: number; y: number } }
  | {
      kind: 'move' | 'resize';
      id: string;
      start: { x: number; y: number };
      rect: Rect;
      corner?: Corner;
    };

export function PageView(props: Props) {
  const { page, index, width, height, findings, manual, t } = props;
  const holder = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  // The user's box that is selected for moving, resizing or removing.
  const [selected, setSelected] = useState<string | null>(null);
  // Live position of a box being moved or resized.
  const [editing, setEditing] = useState<{ id: string; rect: Rect } | null>(null);
  const drag = useRef<Drag | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const { onRemoveManual } = props;

  // A removed box cannot stay selected.
  const selectedBox = manual.find((m) => m.id === selected) ?? null;

  // Escape lets go of the selected box; Delete or Backspace removes it.
  useEffect(() => {
    if (!selectedBox) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      if (typing) return;
      if (e.key === 'Escape') setSelected(null);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onRemoveManual(selectedBox.id);
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedBox, onRemoveManual]);

  useEffect(() => {
    let cancelled = false;
    // A fresh canvas per render: PDF.js refuses to draw twice into the same one.
    const canvas = document.createElement('canvas');
    const wanted = Math.min(3, (window.devicePixelRatio || 1) * 1.5);
    const task = startRender(page, canvas, capScale(width, height, wanted));
    task.promise.then(
      () => {
        if (!cancelled) holder.current?.replaceChildren(canvas);
      },
      () => {},
    );
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [page, width, height]);

  const style = (r: Rect) => ({
    left: `${(r.x / width) * 100}%`,
    top: `${(r.y / height) * 100}%`,
    width: `${(r.w / width) * 100}%`,
    height: `${(r.h / height) * 100}%`,
  });

  /** The pointer position in page units. */
  const point = (e: PointerEvent<HTMLElement>) => {
    const b = overlay.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - b.left) / b.width) * width,
      y: ((e.clientY - b.top) / b.height) * height,
    };
  };

  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

  /** Starts a drag; all further pointer events go to the overlay. */
  const begin = (e: PointerEvent<HTMLElement>, d: Drag) => {
    e.stopPropagation();
    // Stops the browser starting its own drag or text selection, which would
    // cancel this one half-way.
    e.preventDefault();
    overlay.current!.setPointerCapture(e.pointerId);
    drag.current = d;
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.button !== 0) return;
    // On a phone a finger scrolls the page unless drawing is switched on.
    if (e.pointerType === 'touch' && !props.drawing) return;
    setSelected(null);
    begin(e, { kind: 'draw', origin: point(e) });
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    if (d.kind === 'draw') {
      const o = d.origin;
      setDraft({
        x: clamp(Math.min(o.x, p.x), 0, width),
        y: clamp(Math.min(o.y, p.y), 0, height),
        w: Math.abs(clamp(p.x, 0, width) - o.x),
        h: Math.abs(clamp(p.y, 0, height) - o.y),
      });
      return;
    }
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    const r = d.rect;
    if (d.kind === 'move') {
      setEditing({
        id: d.id,
        rect: { ...r, x: clamp(r.x + dx, 0, width - r.w), y: clamp(r.y + dy, 0, height - r.h) },
      });
      return;
    }
    // Resize: the opposite corner stays where it is.
    let [x0, y0, x1, y1] = [r.x, r.y, r.x + r.w, r.y + r.h];
    if (d.corner!.includes('w')) x0 = clamp(x0 + dx, 0, x1 - MIN_SIDE);
    else x1 = clamp(x1 + dx, x0 + MIN_SIDE, width);
    if (d.corner!.includes('n')) y0 = clamp(y0 + dy, 0, y1 - MIN_SIDE);
    else y1 = clamp(y1 + dy, y0 + MIN_SIDE, height);
    setEditing({ id: d.id, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'draw' && draft && draft.w > MIN_SIDE && draft.h > MIN_SIDE)
      props.onAddManual(index, draft);
    if (d && d.kind !== 'draw' && editing) props.onUpdateManual(editing.id, editing.rect);
    setDraft(null);
    setEditing(null);
  };

  return (
    <section className="page" id={`page-${index}`}>
      <div className="page-title">
        {t.page(index + 1)}
        {props.scan === undefined ? (
          <>
            {props.ocr && (
              <span className="warn">
                {' — '}
                {props.hasText ? t.scanRead : t.scanEmpty}
              </span>
            )}
            {!props.ocr && (
              <button
                type="button"
                className="link reread"
                title={t.rereadTitle}
                onClick={props.onReadAsScan}
              >
                {t.reread}
              </button>
            )}
          </>
        ) : props.scan === 'failed' ? (
          <span className="warn">
            {` — ${t.scanFailed} `}
            <button type="button" className="link" onClick={props.onReadAsScan}>
              {t.tryAgain}
            </button>
          </span>
        ) : (
          <span className="reading">
            {' — '}
            {props.scan === 'wait' ? t.scanWaiting : t.scanReading(Math.round(props.scan * 100))}
          </span>
        )}
        {/* On a page read as a scan the whole page is a picture: no extra warning. */}
        {!props.ocr && props.hasText && props.images > 0 && (
          <span className="warn">
            {' — '}
            {t.imagesWarn}
          </span>
        )}
        {props.marks > 0 && (
          <span className="warn">
            {' — '}
            {t.marksWarn}
          </span>
        )}
      </div>
      <div className="sheet" dir="ltr" style={{ aspectRatio: `${width} / ${height}` }}>
        <div className="canvas-holder" ref={holder} />
        <div
          ref={overlay}
          className={`overlay ${props.drawing ? 'drawing' : ''}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {findings.map((f) => {
            const hidden = props.isHidden(f);
            const text = hidden ? props.replacement(f) : '';
            const main = widestIndex(f.rects);
            return f.rects.map((r, i) => (
              <button
                key={`${f.id}-${i}`}
                type="button"
                className={`box ${f.source} ${hidden ? `hidden fill-${props.mode}` : 'kept'}`}
                style={style(r)}
                title={t.boxTitle(t.kinds[f.kind] ?? f.kind, f.text, hidden)}
                onClick={() => props.onToggle(f)}
              >
                {text && (props.mode === 'template' || i === main) && (
                  <span dir="auto">{text}</span>
                )}
              </button>
            ));
          })}
          {manual.map((m) => {
            const rect = editing?.id === m.id ? editing.rect : m.rect;
            const isSelected = selected === m.id;
            return (
              <button
                key={m.id}
                type="button"
                className={`box manual hidden fill-${props.mode} ${isSelected ? 'selected' : ''}`}
                style={style(rect)}
                title={t.manualTitle}
                aria-pressed={isSelected}
                onPointerDown={(e) => {
                  if (!isSelected || e.button !== 0) return;
                  begin(e, { kind: 'move', id: m.id, start: point(e), rect: m.rect });
                }}
                onClick={() => setSelected(m.id)}
              >
                {props.mode === 'template' && <span>[{t.redacted}]</span>}
              </button>
            );
          })}
          {selectedBox && (
            <>
              {CORNERS.map((c) => {
                const r = editing?.id === selectedBox.id ? editing.rect : selectedBox.rect;
                const left = c.includes('w') ? r.x : r.x + r.w;
                const top = c.includes('n') ? r.y : r.y + r.h;
                return (
                  <span
                    key={c}
                    className={`handle handle-${c}`}
                    style={{ left: `${(left / width) * 100}%`, top: `${(top / height) * 100}%` }}
                    onPointerDown={(e) =>
                      begin(e, {
                        kind: 'resize',
                        id: selectedBox.id,
                        start: point(e),
                        rect: selectedBox.rect,
                        corner: c,
                      })
                    }
                  />
                );
              })}
              <button
                type="button"
                className="remove-box"
                title={t.removeBox}
                aria-label={t.removeBox}
                style={{
                  left: `${((selectedBox.rect.x + selectedBox.rect.w) / width) * 100}%`,
                  top: `${(selectedBox.rect.y / height) * 100}%`,
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  props.onRemoveManual(selectedBox.id);
                  setSelected(null);
                }}
              >
                ×
              </button>
            </>
          )}
          {draft && <div className="box draft" style={style(draft)} />}
        </div>
      </div>
    </section>
  );
}
