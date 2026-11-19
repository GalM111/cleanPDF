# cleanPDF

Hide your personal details in a PDF before you send it to someone.

You tell cleanPDF what your details are (names, ID number, phone, bank account, email, address). It finds every place they appear, in Hebrew and English and in their common written forms, and also suggests other values that look sensitive. You review the result, add your own boxes for signatures or stamps, and download a new PDF that is safe to share.

Scanned PDFs and photos (JPG, PNG) are read on the device with OCR, and filled-in PDF form fields are checked too. The interface is in English and Hebrew.

App: https://galm111.github.io/cleanPDF/

## Use it on iPhone

1. Open the link above in **Safari**.
2. Tap **Share** → **Add to Home Screen**.
3. Open cleanPDF from the new icon. After the first visit it also works offline.
4. When the clean PDF is ready, tap **Save / Share** and choose **Save to Files** (or send it straight to Mail, WhatsApp, etc.).

On a computer the app works the same, with a normal download button. Chrome and Edge also offer "Install app" in the address bar.

## Privacy

- **The document never leaves your device.** There is no server, no upload and no account. A Content-Security-Policy stops the page from sending requests anywhere.
- **Nothing is saved.** Your details and the document stay in memory and are gone when you close the tab. For offline use the app caches its own files only, never your documents.
- **Hidden means destroyed.** Each page is rebuilt as an image with the boxes painted in. The new file has no text, metadata, attachments or form data from the original.

The app finds a lot, but not everything. Always look through every page of the output before you send it. Text inside pictures on an ordinary page, barcodes and QR codes are not found automatically, so draw boxes on them by hand. The OCR engine (about 15 MB) is downloaded the first time a scan is read and then works offline.

## Output styles

| Style       | Looks like                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| Black       | Solid black boxes                                                                                    |
| White       | Solid white boxes                                                                                    |
| Page colour | Boxes in the page's background colour                                                                |
| Labels      | `[NAME]`, `[ID NUMBER]`; numbered (`[NAME 1]`, `[NAME 2]`) when there are several values of one kind |
| Sample data | Made-up values in the original text colour                                                           |

## Development

Needs Node.js 20.19 or later.

```bash
npm install         # also copies PDF.js fonts and character maps into public/pdfjs
npm run dev         # http://localhost:5173
npm test            # unit tests (Vitest)
npm run lint        # ESLint
npm run format      # Prettier
npm run build       # type check + production build in dist/
npm run check:build # CSP in place, no outside addresses, size budget (run after build)
npm run sample      # regenerate public/sample.pdf (needs a font with Hebrew letters)
```

The production build is a static site. CI (`.github/workflows/ci.yml`) runs lint, format check, tests, build and `check:build` on every push. Pushing to `main` also publishes the site to GitHub Pages through `.github/workflows/pages.yml`.

## Project layout

```
src/
  App.tsx          main screen: details form, review lists, export
  PageView.tsx     page preview with clickable boxes and manual boxes
  core/
    pdf.ts         PDF.js wrapper: open, extract text with positions, render
    text.ts        text normalisation (Hebrew final letters, vowel points, bidi)
    geometry.ts    maps matched text back to boxes on the page
    matcher.ts     "My details": variants of each value and matching
    detectors.ts   "Also found": patterns with checksums and field labels
    scan.ts        runs matcher + detectors on one page
    replace.ts     labels and sample values for each output style
    export.ts      flattens pages to images, builds the new PDF, verifies it
    filename.ts    safe name for the cleaned file
    ocr.ts         on-device OCR (Tesseract.js) for scans and photos
    ocrItems.ts    turns OCR words into text items with page boxes
  SaveButton.tsx   download link on computers, Save / Share sheet on phones
  save.ts          share-sheet helpers
  i18n.ts          interface text in English and Hebrew
docs/
  PLAN.md          product plan and milestones
```

See [TODO.md](TODO.md) for what is planned next.
