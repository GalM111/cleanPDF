# cleanPDF architecture

How the app is built and how a document is processed. The diagram sources are
[`architecture.mmd`](architecture.mmd) and [`processing-flow.mmd`](processing-flow.mmd);
GitHub draws the copies below. Update both when the code changes.

## Principles

- **The document never leaves the device.** No server, no upload. A
  Content-Security-Policy (`connect-src 'self'`) makes the browser enforce it.
- **Nothing is saved.** The document and "My details" live in memory. The service
  worker caches the app's own files only (and the OCR engine after first use).
- **Hidden means destroyed.** Every page is redrawn as a picture with the boxes
  painted in; the new PDF is built from those pictures only.
- **Heavy work runs in background workers** (PDF.js, OCR, barcodes) so the screen
  stays responsive on a phone.

## Components

```mermaid
%% cleanPDF architecture as built. Everything that touches the document runs on
%% the user's device; GitHub only serves the app's own files.
flowchart TB
    subgraph Delivery["Delivery: app files only"]
        direction LR
        Repo["GitHub repo<br/>GalM111/cleanPDF"] --> CI["CI on every push<br/>lint · format · unit tests · build<br/>check:build (CSP, outside hosts, size)"]
        CI -- "main only" --> Pages["GitHub Pages<br/>static files"]
        Bot["Dependabot<br/>monthly, minor/patch only"] -.-> Repo
    end

    Pages -- "first visit: app files<br/>(OCR engine on first scan)" --> SW

    subgraph Device["User's device: iPhone or PC"]
        direction TB
        SW["Service worker<br/>precache: app, PDF.js worker + fonts, barcode engine<br/>runtime cache: OCR engine (on first use)<br/>never caches documents or results"]
        CSP["Content-Security-Policy<br/>connect-src 'self': the page cannot send data anywhere"]

        subgraph UI["Page: React, English + Hebrew"]
            direction TB
            Load["Open a PDF, scan or photo<br/>(photo becomes a one-page PDF)"]
            Details["My details form<br/>memory only"]
            Review["Review: page previews + lists<br/>toggle boxes · hide everywhere · ignore<br/>draw, move, resize, remove your own boxes<br/>(phones: Draw a box mode)"]
            Save["Save: download on PC<br/>Save / Share sheet on phones"]
        end

        subgraph Core["src/core: logic, unit-tested"]
            direction TB
            PDF["pdf.ts<br/>text + positions, form fields and comments,<br/>embedded fonts, picture count, canvas cap"]
            Text["text.ts + geometry.ts<br/>normalise (Hebrew, RTL), map text to boxes"]
            Match["matcher.ts<br/>My details: variants, exact / fuzzy"]
            Detect["detectors.ts<br/>ID, IBAN, card, phone, email, bank account,<br/>field labels (EN + HE)"]
            Scan["scan.ts<br/>findings per page + barcode findings"]
            Replace["replace.ts<br/>black, white, page colour, labels, sample data"]
            Export["export.ts + filename.ts<br/>rasterise, paint, new PDF, verify, safe name"]
        end

        subgraph Workers["Background workers"]
            direction LR
            PDFW["PDF.js worker<br/>parse + render"]
            OCRW["OCR worker<br/>Tesseract.js eng + heb"]
            BCW["Barcode worker<br/>zxing-wasm"]
        end
    end

    Load --> PDF
    PDF <--> PDFW
    PDF -- "page without text" --> OCRW
    Load -- "every page" --> BCW
    PDF --> Text --> Scan
    OCRW --> Text
    BCW --> Scan
    Details --> Match
    Match --> Scan
    Detect --> Scan
    Scan --> Review
    Review -- "approved boxes" --> Replace --> Export --> Save

    Planned["Planned: name model in running text,<br/>document metadata detector"]:::planned -.-> Scan

    classDef planned stroke-dasharray: 4 3,color:#777
```

## Processing one document

```mermaid
%% Processing flow for one document, from opening it to a safe file, as built.
flowchart TD
    A([User opens a PDF, scan or photo]) --> B{Photo?}
    B -- "JPG / PNG" --> B2[Wrap it in a one-page PDF]
    B -- PDF --> C
    B2 --> C[Open with PDF.js, in memory only<br/>password-protected: ask to remove it]

    C --> D[For each page: text + positions<br/>form-field values and text comments<br/>count pictures, signatures, stamps<br/>load the embedded fonts]
    D --> E{Enough text<br/>on the page?}
    E -- yes --> G
    E -- "no (scan, photo)" --> F[OCR in the background<br/>Tesseract.js, English + Hebrew<br/>clean up, straighten, map words to boxes]
    F --> G[Normalise text<br/>Hebrew letters, right-to-left order, digits-only stream]
    D --> BC[Barcode check in the background, page by page<br/>quick search on PDF pages, thorough on scans]

    P0[My details typed by the user<br/>memory only] --> L1
    G --> L1[My details: every written form<br/>exact on text, loose on scans]
    G --> L2[Also found: patterns with check digits,<br/>bank accounts, field labels]
    BC --> L3[Barcodes / QR codes<br/>holds my details: hidden<br/>otherwise: suggestion]

    L1 --> H[Findings with boxes<br/>measured with the document's own font]
    L2 --> H
    L3 --> H

    H --> I[Review screen<br/>Your details: hidden by default<br/>Also found: waiting for a decision<br/>warnings: pictures, form fields, no text]
    I --> J{User action}
    J -- "tick / untick, click a box" --> I
    J -- "hide everywhere, ignore" --> I
    J -- "draw, move, resize, remove own box" --> I
    J -- export --> W{Undecided items<br/>or pages with no text?}
    W -- "yes: ask in the page" --> J
    W -- "no, or export anyway" --> K[Choose look: black, white,<br/>page colour, labels, sample data]

    K --> N[Draw each page as a picture<br/>paint the boxes into the pixels]
    N --> O[Build a new PDF from the pictures only<br/>no text, form data, metadata, attachments or dates]
    O --> Q[Verify: no hidden value can be read]
    Q -- "leak found" --> I
    Q -- clean --> S[Safe file name<br/>personal-looking name becomes document-clean.pdf]
    S --> R{Device}
    R -- PC --> R1([Download])
    R -- phone --> R2([Share sheet: Save to Files, Mail, WhatsApp])
    R1 --> Z([Tab closed: document and details are gone])
    R2 --> Z
```

## Where things live

| Part                 | Files                                                                        |
| -------------------- | ---------------------------------------------------------------------------- |
| Screens              | `src/App.tsx`, `src/PageView.tsx`, `src/SaveButton.tsx`, `src/i18n.ts`       |
| Reading PDFs         | `src/core/pdf.ts` (PDF.js), `src/core/ocr.ts` + `ocrItems.ts` (Tesseract.js) |
| Barcodes             | `src/core/barcodes.ts`, `src/core/barcodeWorker.ts` (zxing-wasm)             |
| Finding data         | `src/core/text.ts`, `geometry.ts`, `matcher.ts`, `detectors.ts`, `scan.ts`   |
| Output               | `src/core/replace.ts`, `export.ts`, `filename.ts`, `src/save.ts`             |
| Offline and security | `vite.config.ts` (service worker, CSP), `scripts/check-build.mjs`            |
| Delivery             | `.github/workflows/ci.yml`, `pages.yml`, `.github/dependabot.yml`            |
