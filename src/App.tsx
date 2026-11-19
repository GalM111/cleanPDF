import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { exportPdf, verifyPdf, type DrawBox } from './core/export';
import { buildReplacements, isHebrew, MODES, widestIndex, type OutputMode } from './core/replace';
import {
  canvasMeasure,
  extractPage,
  openPdf,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from './core/pdf';
import { scanPage } from './core/scan';
import type { DetailField, Details, Finding, ManualBox, PageText, Rect } from './core/types';
import { PageView } from './PageView';

const FIELDS: { field: DetailField; label: string; hint: string }[] = [
  { field: 'name', label: 'Names', hint: 'Dana Levi; דנה לוי' },
  { field: 'id', label: 'ID numbers', hint: '123456782' },
  { field: 'phone', label: 'Phone numbers', hint: '052-1234567' },
  { field: 'account', label: 'Bank accounts', hint: '12-345-678901' },
  { field: 'email', label: 'Emails', hint: 'dana@example.com' },
  { field: 'address', label: 'Addresses', hint: '12 Herzl St, Tel Aviv' },
  { field: 'other', label: 'Anything else', hint: 'employer, employee number…' },
];

const EMPTY: Record<DetailField, string> = {
  name: '',
  id: '',
  phone: '',
  account: '',
  email: '',
  address: '',
  other: '',
};

// Which "My details" field a suggestion goes into when the user adopts it.
const KIND_FIELD: Record<string, DetailField> = {
  Name: 'name',
  'ID number': 'id',
  Phone: 'phone',
  Email: 'email',
  Address: 'address',
  'Bank account': 'account',
  IBAN: 'account',
};

interface Loaded {
  doc: PDFDocumentProxy;
  name: string;
  pages: PageText[];
  proxies: PDFPageProxy[];
}

interface Group {
  key: string;
  kind: string;
  text: string;
  note?: string;
  items: Finding[];
}

type Result = (
  | { ok: true; url: string; name: string; size: number }
  | { ok: false; leaks: string[] }
) & {
  /** The state the file was built from; the result is stale once any of it changes. */
  inputs: unknown[];
};

const pageList = (pages: number[]) =>
  pages.length === 1 ? `Page ${pages[0]}` : `Pages ${pages.join(', ')}`;

const splitValues = (raw: string) =>
  raw
    .split(/[\n;]+/)
    .map((v) => v.trim())
    .filter(Boolean);

function groupBy(findings: Finding[]): Group[] {
  const map = new Map<string, Group>();
  for (const f of findings) {
    const g = map.get(f.key);
    if (g) g.items.push(f);
    else map.set(f.key, { key: f.key, kind: f.kind, text: f.text, note: f.note, items: [f] });
  }
  return [...map.values()];
}

export function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [raw, setRaw] = useState(EMPTY);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [manual, setManual] = useState<ManualBox[]>([]);
  const [mode, setMode] = useState<OutputMode>('black');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [dragging, setDragging] = useState(false);

  const details = useMemo(() => {
    const d = {} as Details;
    for (const { field } of FIELDS) d[field] = splitValues(raw[field]);
    return d;
  }, [raw]);

  const findings = useMemo(() => {
    if (!loaded) return [];
    const ignore = new Set(ignored);
    return loaded.pages.flatMap((p, i) => scanPage(i, p, details, ignore, canvasMeasure));
  }, [loaded, details, ignored]);

  const isHidden = (f: Finding) => overrides[f.id] ?? f.source === 'details';
  const mine = useMemo(() => groupBy(findings.filter((f) => f.source === 'details')), [findings]);
  const others = useMemo(() => groupBy(findings.filter((f) => f.source === 'found')), [findings]);
  const undecided = findings.filter((f) => f.source === 'found' && !(f.id in overrides)).length;
  // 1-based numbers of pages with no text layer: nothing on them can be detected.
  const textless = loaded ? loaded.pages.flatMap((p, i) => (p.items.length ? [] : [i + 1])) : [];
  const hiddenCount = findings.filter(isHidden).length + manual.length;
  const replacements = useMemo(
    () => buildReplacements(findings.filter(isHidden), mode),
    // isHidden depends only on overrides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [findings, overrides, mode],
  );

  // A built file is only shown while the inputs it was built from are unchanged.
  const inputs: unknown[] = [findings, overrides, manual, mode];
  const current = result?.inputs.every((v, i) => v === inputs[i]) ? result : null;

  // Release the previous file's memory when it is replaced or cleared.
  useEffect(
    () => () => {
      if (result?.ok) URL.revokeObjectURL(result.url);
    },
    [result],
  );

  async function load(bytes: Uint8Array, name: string) {
    setError('');
    setBusy('Reading document…');
    try {
      const doc = await openPdf(bytes);
      const proxies: PDFPageProxy[] = [];
      const pages: PageText[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        proxies.push(page);
        pages.push(await extractPage(page));
      }
      await loaded?.doc.destroy();
      setOverrides({});
      setManual([]);
      setResult(null);
      setIgnored([]);
      setLoaded({ doc, name, pages, proxies });
    } catch (e) {
      const isPassword = (e as Error)?.name === 'PasswordException';
      setError(
        isPassword
          ? 'This PDF is password-protected. Remove the password and try again.'
          : 'Could not read this file. Please choose a PDF.',
      );
    } finally {
      setBusy('');
    }
  }

  async function loadFile(file: File | undefined) {
    if (file) await load(new Uint8Array(await file.arrayBuffer()), file.name);
  }

  async function loadSample() {
    const res = await fetch(`${import.meta.env.BASE_URL}sample.pdf`);
    await load(new Uint8Array(await res.arrayBuffer()), 'sample.pdf');
  }

  function clearAll() {
    void loaded?.doc.destroy();
    setLoaded(null);
    setRaw(EMPTY);
    setIgnored([]);
    setOverrides({});
    setManual([]);
    setResult(null);
    setError('');
  }

  function toggleGroup(g: Group) {
    const hide = !g.items.every(isHidden);
    setOverrides((o) => ({ ...o, ...Object.fromEntries(g.items.map((f) => [f.id, hide])) }));
  }

  function adopt(g: Group) {
    const field = KIND_FIELD[g.kind] ?? 'other';
    setRaw((r) => ({ ...r, [field]: r[field] ? `${r[field]}\n${g.text}` : g.text }));
  }

  async function runExport() {
    if (!loaded) return;
    const warnings: string[] = [];
    if (undecided > 0)
      warnings.push(`${undecided} suggested item(s) are still undecided and will stay visible.`);
    if (textless.length > 0)
      warnings.push(
        `${pageList(textless)} had no readable text, so nothing on ${textless.length > 1 ? 'them' : 'it'} was found automatically. Only boxes you drew by hand will be hidden there.`,
      );
    if (warnings.length > 0 && !window.confirm(`${warnings.join('\n\n')}\n\nExport anyway?`)) return;

    const boxes: DrawBox[][] = loaded.pages.map(() => []);
    for (const f of findings.filter(isHidden)) {
      const label = replacements.get(f.id) ?? '';
      const main = widestIndex(f.rects);
      // Sample text is written once, in the widest box; labels go in every box.
      f.rects.forEach((rect, i) =>
        boxes[f.page].push({
          rect,
          label: mode === 'sample' && i !== main ? '' : label,
          rtl: isHebrew(label),
        }),
      );
    }
    for (const m of manual)
      boxes[m.page].push({ rect: m.rect, label: mode === 'template' ? '[REDACTED]' : '' });

    const builtFrom = inputs;
    setResult(null);
    try {
      const bytes = await exportPdf(loaded.doc, boxes, mode, (p, n) =>
        setBusy(`Building page ${p} of ${n}…`),
      );
      setBusy('Checking the result…');
      const check = await verifyPdf(bytes, findings.filter(isHidden).map((f) => f.text));
      if (!check.ok) {
        setResult({ ok: false, leaks: check.leaks, inputs: builtFrom });
        return;
      }
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const name = loaded.name.replace(/\.pdf$/i, '') + '-clean.pdf';
      setResult({ ok: true, url, name, size: bytes.length, inputs: builtFrom });
    } catch (e) {
      console.error(e);
      const detail = e instanceof Error && e.message ? ` (${e.message})` : '';
      setError(`Something went wrong while building the file${detail}.`);
    } finally {
      setBusy('');
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void loadFile(e.dataTransfer.files[0]);
  };

  if (!loaded) {
    return (
      <main className="landing">
        <h1>cleanPDF</h1>
        <p className="lead">
          Hide your personal details in a document before you send it. The file is processed on
          this device only and nothing is saved.
        </p>
        <label
          className={`drop ${dragging ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input type="file" accept="application/pdf" onChange={(e) => loadFile(e.target.files?.[0])} />
          <strong>{busy || 'Drop a PDF here or click to choose'}</strong>
        </label>
        <button type="button" className="link" onClick={loadSample}>
          Try it with a sample document
        </button>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  const groupList = (groups: Group[], suggestion: boolean) => (
    <ul className="groups">
      {groups.map((g) => {
        const hiddenN = g.items.filter(isHidden).length;
        return (
          <li key={g.key}>
            <label>
              <input
                type="checkbox"
                checked={hiddenN === g.items.length}
                ref={(el) => {
                  if (el) el.indeterminate = hiddenN > 0 && hiddenN < g.items.length;
                }}
                onChange={() => toggleGroup(g)}
              />
              <span className="kind">{g.kind}</span>
            </label>
            <button
              type="button"
              className="value"
              dir="auto"
              title="Show on page"
              onClick={() =>
                document.getElementById(`page-${g.items[0].page}`)?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              {g.text}
            </button>
            <span className="count">×{g.items.length}</span>
            {g.note && <span className="note">{g.note}</span>}
            {suggestion && (
              <span className="actions">
                <button type="button" onClick={() => adopt(g)} title="Add to My details and hide every form of it">
                  Hide everywhere
                </button>
                <button type="button" onClick={() => setIgnored((i) => [...i, g.key])}>
                  Ignore
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="app">
      <aside>
        <header>
          <h1>cleanPDF</h1>
          <button type="button" className="link" onClick={clearAll}>
            Clear everything
          </button>
        </header>
        <p className="file" title={loaded.name}>
          {loaded.name} · {loaded.pages.length} page(s)
        </p>

        <h2>1. My details</h2>
        <p className="hint">One per line. Kept in memory only, gone when you close this tab.</p>
        {FIELDS.map(({ field, label, hint }) => (
          <label className="field" key={field}>
            <span>{label}</span>
            <textarea
              rows={2}
              dir="auto"
              placeholder={hint}
              value={raw[field]}
              onChange={(e) => setRaw((r) => ({ ...r, [field]: e.target.value }))}
            />
          </label>
        ))}

        <h2>2. Review</h2>
        <h3>Your details in this document</h3>
        {mine.length ? groupList(mine, false) : <p className="hint">Nothing matched yet.</p>}
        <h3>
          Also found {undecided > 0 && <span className="badge">{undecided} undecided</span>}
        </h3>
        {others.length ? (
          groupList(others, true)
        ) : (
          <p className="hint">No other sensitive values detected.</p>
        )}
        <p className="hint">
          Tick a row to hide it. Click a box on the page to switch it, or drag on the page to add
          your own box (signatures, stamps, photos).
          {manual.length > 0 && ` ${manual.length} manual box(es) added.`}
        </p>

        <h2>3. Export</h2>
        <p className="hint">How hidden values look in the new file:</p>
        <div className="modes">
          {MODES.map((m) => (
            <label key={m.mode} className={mode === m.mode ? 'on' : ''} title={m.hint}>
              <input type="radio" name="mode" checked={mode === m.mode} onChange={() => setMode(m.mode)} />
              <span className={`swatch fill-${m.mode}`}>
                {m.mode === 'template' ? '[NAME]' : m.mode === 'sample' ? 'John Doe' : ''}
              </span>
              {m.label}
            </label>
          ))}
        </div>
        {mode === 'sample' && (
          <p className="hint">
            Sample data makes the file look like a real document about someone else. Tell the
            person you send it to that the details are made up.
          </p>
        )}
        {textless.length > 0 && (
          <p className="hint warn">
            {pageList(textless)} {textless.length > 1 ? 'have' : 'has'} no readable text (probably a
            scan), so nothing there was found automatically. Draw boxes by hand over anything
            personal.
          </p>
        )}
        <button type="button" className="primary" disabled={!!busy} onClick={runExport}>
          {busy || `Create clean PDF (${hiddenCount} hidden)`}
        </button>
        {error && <p className="error">{error}</p>}
        {current?.ok && (
          <div className="result ok">
            <p>
              The new file is made of page images only: it has no text, metadata or attachments,
              and the boxed areas are painted over for good.
            </p>
            <p>
              Anything not boxed is still visible. Look through every page before you send it.
            </p>
            <a className="primary" href={current.url} download={current.name}>
              Download {current.name} ({Math.round(current.size / 1024)} KB)
            </a>
          </div>
        )}
        {current && !current.ok && (
          <div className="result bad">
            <p>Export blocked. These values can still be read from the output:</p>
            <p dir="auto">{current.leaks.join(', ')}</p>
          </div>
        )}
      </aside>

      <div className="pages">
        {loaded.proxies.map((page, i) => (
          <PageView
            key={i}
            page={page}
            index={i}
            width={loaded.pages[i].width}
            height={loaded.pages[i].height}
            hasText={loaded.pages[i].items.length > 0}
            findings={findings.filter((f) => f.page === i)}
            isHidden={isHidden}
            mode={mode}
            replacement={(f) => replacements.get(f.id) ?? ''}
            manual={manual.filter((m) => m.page === i)}
            onToggle={(f) => setOverrides((o) => ({ ...o, [f.id]: !isHidden(f) }))}
            onAddManual={(pageIndex: number, rect: Rect) =>
              setManual((m) => [...m, { id: crypto.randomUUID(), page: pageIndex, rect }])
            }
            onRemoveManual={(id) => setManual((m) => m.filter((b) => b.id !== id))}
          />
        ))}
      </div>
    </div>
  );
}
