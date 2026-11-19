# cleanPDF

Hide your personal details in a PDF before you send it to someone.

You tell cleanPDF what your details are (names, ID number, phone, bank account, email, address). It finds every place they appear, in Hebrew and English and in their common written forms, and also suggests other values that look sensitive. You review the result, add your own boxes for signatures or stamps, and download a new PDF that is safe to share.

## Privacy

- **The document never leaves your device.** There is no server, no upload and no account. A Content-Security-Policy stops the page from sending requests anywhere.
- **Nothing is saved.** Your details and the document stay in memory and are gone when you close the tab.
- **Hidden means destroyed.** Each page is rebuilt as an image with the boxes painted in. The new file has no text, metadata, attachments or form data from the original.

The app finds a lot, but not everything. Always look through every page of the output before you send it. Pages without a text layer (scans, photos) are not read automatically yet, so draw boxes on them by hand.

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

The production build is a static site; host `dist/` anywhere. CI runs lint, format check, tests, build and `check:build` on every push.

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
docs/
  PLAN.md          product plan and milestones
```

See [TODO.md](TODO.md) for what is planned next.
