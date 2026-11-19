# cleanPDF to-do list

Ordered by priority. See [docs/PLAN.md](docs/PLAN.md) for the full product plan.

## P0: Safety and correctness

- [x] Reword the success message after export. The output is always image-only, so the text check in `verifyPdf` (`src/core/export.ts`) passes every time; the message must not claim more than that.
- [x] Before export, warn about pages with no text layer (scans, photos): nothing on them was detected, so the user must review them or draw boxes by hand.
- [x] Show the real error instead of hiding it in the empty `catch {}` in `runExport` (`src/App.tsx`).
- [x] Add a Content-Security-Policy so the page cannot send data anywhere.

## P1: Project setup

- [x] Rewrite `README.md` as UTF-8 (it was UTF-16 with only a title): what the app does, the privacy promise, commands, link to the plan.
- [ ] Add a LICENSE (decide first whether the project is open source).
- [x] CI: GitHub Actions workflow running `npm ci`, lint, `npm test`, `npm run build`.
- [x] Pin `vite`, `vitest` and `@vitejs/plugin-react` (they were set to `"latest"`).
- [x] Add ESLint (with the React hooks rules) and Prettier.
- [x] Make `scripts/make-sample.mjs` find a Hebrew-capable font on Windows, macOS and Linux.
- [x] Add `.gitattributes` for consistent line endings and binary files.
- [x] Add `CLAUDE.md` with architecture notes and commands.

## P2: Tests

- [ ] Unit tests for `src/core/export.ts`: colour sampling, box padding, output has no text and no metadata.
- [ ] Detector false-positive tests: dates, amounts and order numbers that look like IDs or card numbers.
- [ ] End-to-end Playwright test: load `sample.pdf`, enter details, export, confirm the hidden values are gone.

## P3: Plan milestones not done yet

- [ ] OCR with Tesseract.js (`eng` + `heb`) for scans and photos, with fuzzy matching and confidence marks (milestone 3).
- [ ] JPG/PNG input: turn the image into a one-page document before scanning.
- [ ] Metadata detector: show the original author, title and attachments in "Also found".
- [ ] "Replace with placeholder" per finding, with a choice of label.
- [ ] Adjust a box: resize or move a box that does not fully cover the text.
- [ ] Hebrew UI with right-to-left layout.
- [ ] Offline PWA: manifest and service worker.
- [ ] Name-detection model (milestones 0 and 2): first check whether a Hebrew model can run in the browser at an acceptable size and speed.
- [ ] Barcode and QR detection.
- [ ] Searchable output: rebuild a text layer from the words that are not hidden.

## P4: Performance and polish

- [ ] Split the bundle: load pdf-lib and the export code only when needed (main chunk is ~1 MB).
- [ ] Move scanning and export into Web Workers.
- [ ] Cap the canvas size for very large pages so export does not run out of memory.
- [ ] Warn that context (job title, salary, employer) can still identify the user.
- [ ] Decide the open questions: app name, free versus paid, when to open-source.
