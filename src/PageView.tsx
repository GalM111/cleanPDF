import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { capScale, startRender, type PDFPageProxy } from './core/pdf';
import { widestIndex, type OutputMode } from './core/replace';
import type { Finding, ManualBox, Rect } from './core/types';

interface Props {
  page: PDFPageProxy;
  index: number;
  width: number;
  height: number;
  hasText: boolean;
  findings: Finding[];
  isHidden: (f: Finding) => boolean;
  mode: OutputMode;
  replacement: (f: Finding) => string;
  manual: ManualBox[];
  onToggle: (f: Finding) => void;
  onAddManual: (page: number, rect: Rect) => void;
  onRemoveManual: (id: string) => void;
}

export function PageView(props: Props) {
  const { page, index, width, height, findings, manual } = props;
  const holder = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

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

  const point = (e: PointerEvent<HTMLDivElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - b.left) / b.width) * width,
      y: ((e.clientY - b.top) / b.height) * height,
    };
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    origin.current = point(e);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!origin.current) return;
    const p = point(e);
    const o = origin.current;
    setDraft({
      x: Math.min(o.x, p.x),
      y: Math.min(o.y, p.y),
      w: Math.abs(p.x - o.x),
      h: Math.abs(p.y - o.y),
    });
  };
  const onUp = () => {
    if (draft && draft.w > 4 && draft.h > 4) props.onAddManual(index, draft);
    origin.current = null;
    setDraft(null);
  };

  return (
    <section className="page" id={`page-${index}`}>
      <div className="page-title">
        Page {index + 1}
        {!props.hasText && (
          <span className="warn"> — no readable text here (probably a scan). Draw boxes by hand.</span>
        )}
      </div>
      <div className="sheet" style={{ aspectRatio: `${width} / ${height}` }}>
        <div className="canvas-holder" ref={holder} />
        <div
          className="overlay"
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
                title={`${f.kind}: ${f.text} — click to ${hidden ? 'keep' : 'hide'}`}
                onClick={() => props.onToggle(f)}
              >
                {text && (props.mode === 'template' || i === main) && <span dir="auto">{text}</span>}
              </button>
            ));
          })}
          {manual.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`box manual hidden fill-${props.mode}`}
              style={style(m.rect)}
              title="Manual box — click to remove"
              onClick={() => props.onRemoveManual(m.id)}
            >
              {props.mode === 'template' && <span>[REDACTED]</span>}
            </button>
          ))}
          {draft && <div className="box draft" style={style(draft)} />}
        </div>
      </div>
    </section>
  );
}
