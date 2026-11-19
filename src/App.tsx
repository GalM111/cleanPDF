import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ocrPage, stopOcr } from './core/ocr';
import { exportPdf, verifyPdf, type DrawBox } from './core/export';
import { buildReplacements, isHebrew, MODES, widestIndex, type OutputMode } from './core/replace';
import {
  canvasMeasure,
  extractPage,
  imageToPdf,
  needsOcr,
  openPdf,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from './core/pdf';
import { safeOutputName } from './core/filename';
import { scanPage } from './core/scan';
import type { DetailField, Details, Finding, ManualBox, PageText, Rect } from './core/types';
import { initialLang, saveLang, STRINGS, type Lang } from './i18n';
import { PageView } from './PageView';
import { SaveButton } from './SaveButton';

const FIELDS: DetailField[] = ['name', 'id', 'phone', 'account', 'email', 'address', 'other'];

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
  note?: Finding['note'];
  items: Finding[];
}

/** Reading state of a scanned page: waiting, a 0 to 1 progress, or failed. */
export type ScanState = 'wait' | 'failed' | number;

/** Saves a file through the host page, where a plain download link is not allowed. */
type HostSave = (request: { filename: string; data: Blob }) => Promise<unknown>;

// `inputs` records what the file was built from; it is shown only while those
// are unchanged, so an out-of-date file can never be saved by mistake.
type Result =
  | { ok: true; url: string; file: File; inputs: unknown[] }
  | { ok: false; leaks: string[]; inputs: unknown[] };

const splitValues = (raw: string) =>
  raw
    .split(/[\n;]+/)
    .map((v) => v.trim())
    .filter(Boolean);

function groupBy(findings: Finding[]): Group[] {
  const map = new Map<string, Group>();
  for (const f of findings) {
    // Uncertain matches get a row of their own, so they are decided separately.
    const key = f.review ? `${f.key}|review:${f.text}` : f.key;
    const g = map.get(key);
    if (g) g.items.push(f);
    else map.set(key, { key, kind: f.kind, text: f.text, note: f.note, items: [f] });
  }
  return [...map.values()];
}

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const t = STRINGS[lang];
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
  // Warnings shown before export, with the inputs they were raised for.
  const [confirming, setConfirming] = useState<{ warnings: string[]; inputs: unknown[] } | null>(
    null,
  );
  const [hostSave, setHostSave] = useState<HostSave | null>(null);
  const [scans, setScans] = useState<Record<number, ScanState>>({});
  // Goes up when the document changes, so late OCR results are dropped.
  const session = useRef(0);
  const scanning = Object.values(scans).filter((s) => s !== 'failed').length;

  const details = useMemo(() => {
    const d = {} as Details;
    for (const field of FIELDS) d[field] = splitValues(raw[field]);
    return d;
  }, [raw]);

  const findings = useMemo(() => {
    if (!loaded) return [];
    const ignore = new Set(ignored);
    return loaded.pages.flatMap((p, i) => scanPage(i, p, details, ignore, canvasMeasure));
  }, [loaded, details, ignored]);

  const isHidden = (f: Finding) => overrides[f.id] ?? (f.source === 'details' && !f.review);
  const mine = useMemo(() => groupBy(findings.filter((f) => f.source === 'details')), [findings]);
  const others = useMemo(() => groupBy(findings.filter((f) => f.source === 'found')), [findings]);
  const undecided = findings.filter(
    (f) => (f.source === 'found' || f.review) && !(f.id in overrides),
  ).length;
  const hiddenCount = findings.filter(isHidden).length + manual.length;
  // 1-based numbers of pages where no text was found, even by reading the
  // picture: nothing on them was detected automatically.
  const textless = loaded
    ? loaded.pages.flatMap((p, i) => (p.items.some((it) => !it.whole) ? [] : [i + 1]))
    : [];
  const replacements = useMemo(
    () => buildReplacements(findings.filter(isHidden), mode, (kind) => t.kinds[kind] ?? kind),
    // isHidden depends only on overrides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [findings, overrides, mode, t],
  );

  // A built file, or a question about it, is only shown while the inputs it
  // was made from are unchanged.
  const inputs: unknown[] = [findings, overrides, manual, mode, lang];
  const sameInputs = (other: unknown[]) => other.every((v, i) => v === inputs[i]);
  const current = result && sameInputs(result.inputs) ? result : null;
  const asking = confirming && sameInputs(confirming.inputs) ? confirming : null;

  // Release the previous file's memory when it is replaced or cleared.
  useEffect(
    () => () => {
      if (result?.ok) URL.revokeObjectURL(result.url);
    },
    [result],
  );

  // Some hosts that embed the app block download links and offer their own
  // save dialog instead. Without such a host this stays null.
  useEffect(() => {
    const host = (
      window as { claude?: { use?: (name: string) => Promise<{ save: HostSave } | null> } }
    ).claude;
    void host
      ?.use?.('downloads')
      .then((d) => d && setHostSave(() => d.save))
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
  }, [lang, t]);

  const switchLang = () => {
    const next = lang === 'en' ? 'he' : 'en';
    saveLang(next);
    setLang(next);
  };

  async function load(bytes: Uint8Array, name: string) {
    setError('');
    setBusy(t.readingDocument);
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
      session.current++;
      setResult(null);
      setConfirming(null);
      setOverrides({});
      setManual([]);
      setIgnored([]);
      setScans({});
      setLoaded({ doc, name, pages, proxies });
      const scanned = pages.flatMap((p, i) => (needsOcr(p) ? [i] : []));
      void readScans(doc, proxies, scanned);
    } catch (e) {
      const isPassword = (e as Error)?.name === 'PasswordException';
      setError(isPassword ? t.errPassword : t.errFile);
    } finally {
      setBusy('');
    }
  }

  /** Reads pages that are pictures, one after the other, and fills in their text. */
  async function readScans(doc: PDFDocumentProxy, proxies: PDFPageProxy[], indexes: number[]) {
    const mine = session.current;
    const set = (i: number, state: ScanState | null) =>
      setScans((s) => {
        const next = { ...s };
        if (state === null) delete next[i];
        else next[i] = state;
        return next;
      });
    for (const i of indexes) set(i, 'wait');
    await Promise.all(
      indexes.map(async (i) => {
        try {
          const page = await ocrPage(proxies[i], (p) => {
            if (session.current === mine) set(i, p);
          });
          if (session.current !== mine) return;
          // Earlier choices on this page pointed at text that has been replaced.
          setOverrides((o) =>
            Object.fromEntries(Object.entries(o).filter(([id]) => !id.startsWith(`${i}:`))),
          );
          setLoaded((l) =>
            l && l.doc === doc
              ? {
                  ...l,
                  pages: l.pages.map((old, k) =>
                    k === i
                      ? // Keep form-field text and the counts from the page itself.
                        {
                          ...page,
                          items: [...page.items, ...old.items.filter((it) => it.whole)],
                          images: old.images,
                          marks: old.marks,
                        }
                      : old,
                  ),
                }
              : l,
          );
          set(i, null);
        } catch {
          if (session.current === mine) set(i, 'failed');
        }
      }),
    );
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (file.type.startsWith('image/')) {
      setError('');
      setBusy(t.readingImage);
      let bytes: Uint8Array;
      try {
        bytes = await imageToPdf(file);
      } catch {
        setBusy('');
        setError(t.errImage);
        return;
      }
      await load(bytes, file.name.replace(/\.[^.]+$/, '') + '.pdf');
    } else await load(new Uint8Array(await file.arrayBuffer()), file.name);
  }

  async function loadSample() {
    const res = await fetch(`${import.meta.env.BASE_URL}sample.pdf`);
    await load(new Uint8Array(await res.arrayBuffer()), 'sample.pdf');
  }

  function clearAll() {
    session.current++;
    stopOcr();
    void loaded?.doc.destroy();
    setScans({});
    setLoaded(null);
    setRaw(EMPTY);
    setIgnored([]);
    setOverrides({});
    setManual([]);
    setError('');
    setResult(null);
    setConfirming(null);
  }

  function toggleGroup(g: Group) {
    const hide = !g.items.every(isHidden);
    setOverrides((o) => ({ ...o, ...Object.fromEntries(g.items.map((f) => [f.id, hide])) }));
  }

  function adopt(g: Group) {
    const field = KIND_FIELD[g.kind] ?? 'other';
    setRaw((r) => ({ ...r, [field]: r[field] ? `${r[field]}\n${g.text}` : g.text }));
  }

  async function runExport(confirmed = false) {
    if (!loaded) return;
    const warnings: string[] = [];
    if (undecided > 0) warnings.push(t.warnUndecided(undecided));
    if (textless.length > 0) warnings.push(t.warnTextless(textless));
    if (warnings.length > 0 && !confirmed) {
      setConfirming({ warnings, inputs });
      return;
    }
    setConfirming(null);
    setError('');
    const builtFrom = inputs;
    setResult(null);

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
      boxes[m.page].push({
        rect: m.rect,
        label: mode === 'template' ? `[${t.redacted}]` : '',
        rtl: lang === 'he',
      });

    try {
      const bytes = await exportPdf(loaded.doc, boxes, mode, (p, n) => setBusy(t.building(p, n)));
      setBusy(t.checking);
      const check = await verifyPdf(
        bytes,
        findings.filter(isHidden).map((f) => f.text),
      );
      if (!check.ok) {
        setResult({ ok: false, leaks: check.leaks, inputs: builtFrom });
        return;
      }
      const name = safeOutputName(loaded.name, [
        ...findings.filter(isHidden).map((f) => f.text),
        ...Object.values(details).flat(),
      ]);
      const file = new File([bytes as BlobPart], name, { type: 'application/pdf' });
      setResult({ ok: true, url: URL.createObjectURL(file), file, inputs: builtFrom });
    } catch (e) {
      console.error(e);
      const detail = e instanceof Error && e.message ? ` (${e.message})` : '';
      setError(`${t.errBuild.replace(/\.$/, '')}${detail}.`);
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
        <button type="button" className="link lang" onClick={switchLang}>
          {t.switchTo}
        </button>
        <p className="lead">{t.lead}</p>
        <label
          className={`drop ${dragging ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => loadFile(e.target.files?.[0])}
          />
          <strong>{busy || t.drop}</strong>
        </label>
        <button type="button" className="link" onClick={loadSample}>
          {t.trySample}
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
              <span className="kind">{t.kinds[g.kind] ?? g.kind}</span>
            </label>
            <button
              type="button"
              className="value"
              dir="auto"
              title={t.showOnPage}
              onClick={() =>
                document
                  .getElementById(`page-${g.items[0].page}`)
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              {g.text}
            </button>
            <span className="count">×{g.items.length}</span>
            {g.note && <span className="note">{t.notes[g.note]}</span>}
            {suggestion && (
              <span className="actions">
                <button type="button" onClick={() => adopt(g)} title={t.hideEverywhereTitle}>
                  {t.hideEverywhere}
                </button>
                <button type="button" onClick={() => setIgnored((i) => [...i, g.key])}>
                  {t.ignore}
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
          <span className="header-links">
            <button type="button" className="link" onClick={switchLang}>
              {t.switchTo}
            </button>
            <button type="button" className="link" onClick={clearAll}>
              {t.clear}
            </button>
          </span>
        </header>
        <p className="file" title={loaded.name}>
          <bdi>{loaded.name}</bdi> · {t.pages(loaded.pages.length)}
        </p>

        <h2>{t.step1}</h2>
        <p className="hint">{t.step1Hint}</p>
        {FIELDS.map((field) => (
          <label className="field" key={field}>
            <span>{t.fields[field][0]}</span>
            <textarea
              rows={2}
              dir="auto"
              placeholder={t.fields[field][1]}
              value={raw[field]}
              onChange={(e) => setRaw((r) => ({ ...r, [field]: e.target.value }))}
            />
          </label>
        ))}

        <h2>{t.step2}</h2>
        <h3>{t.yours}</h3>
        {mine.length ? groupList(mine, false) : <p className="hint">{t.noneYet}</p>}
        <h3>
          {t.alsoFound} {undecided > 0 && <span className="badge">{t.undecided(undecided)}</span>}
        </h3>
        {others.length ? groupList(others, true) : <p className="hint">{t.noneFound}</p>}
        <p className="hint">
          {t.reviewHint}
          {manual.length > 0 && ` ${t.manualCount(manual.length)}`}
        </p>

        <h2>{t.step3}</h2>
        <p className="hint">{t.exportHint}</p>
        <div className="modes">
          {MODES.map((m) => (
            <label key={m} className={mode === m ? 'on' : ''} title={t.modes[m][1]}>
              <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />
              <span className={`swatch fill-${m}`}>
                {m === 'template' ? t.swatchLabel : m === 'sample' ? t.swatchSample : ''}
              </span>
              {t.modes[m][0]}
            </label>
          ))}
        </div>
        {mode === 'sample' && <p className="hint">{t.sampleWarning}</p>}
        <p className="hint">{t.barcodeHint}</p>
        <button
          type="button"
          className="primary"
          disabled={!!busy || scanning > 0}
          onClick={() => runExport()}
        >
          {busy || (scanning > 0 ? t.readingScans(scanning) : t.create(hiddenCount))}
        </button>
        {asking && (
          <div className="result ask">
            {asking.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            <p>{t.exportAnywayQ}</p>
            <span className="actions">
              <button type="button" onClick={() => runExport(true)}>
                {t.exportAnyway}
              </button>
              <button type="button" onClick={() => setConfirming(null)}>
                {t.cancel}
              </button>
            </span>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {current?.ok && (
          <div className="result ok">
            <p>{t.outputImages}</p>
            <p>{t.reviewPages}</p>
            {hostSave ? (
              <button
                type="button"
                className="primary"
                onClick={() =>
                  hostSave({ filename: current.file.name, data: current.file }).catch(() =>
                    setError(t.saveDeclined),
                  )
                }
              >
                {t.download(current.file.name, Math.round(current.file.size / 1024))}
              </button>
            ) : (
              <SaveButton key={current.url} file={current.file} url={current.url} t={t} />
            )}
          </div>
        )}
        {current && !current.ok && (
          <div className="result bad">
            <p>{t.blocked}</p>
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
            hasText={loaded.pages[i].items.some((it) => !it.whole)}
            images={loaded.pages[i].images ?? 0}
            marks={loaded.pages[i].marks ?? 0}
            ocr={!!loaded.pages[i].ocr}
            scan={scans[i]}
            onReadAsScan={() => void readScans(loaded.doc, loaded.proxies, [i])}
            findings={findings.filter((f) => f.page === i)}
            isHidden={isHidden}
            mode={mode}
            t={t}
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
