# Document anonymiser: plan

Working name: undecided (candidates: Inkout, Maskly, Blankit, Anonydoc, Cloakdoc; availability not checked).

Diagrams: [architecture.mmd](architecture.mmd), [processing-flow.mmd](processing-flow.mmd).

## 1. The idea

A user wants to send a personal document (job contract, electricity bill, payslip, rental contract) to someone without exposing their name, ID number, bank account and similar details.

The app works in two layers:

1. **My details.** The user tells the app what their personal data is (names, ID, phone, address, bank account). The app finds and hides every occurrence of it.
2. **Also found.** The app scans for other data that looks sensitive, shows it to the user, and lets them decide what to do with each item.

Output is a new PDF that is safe to share, either with black boxes (anonymous) or with labelled placeholders (template).

## 2. Principles

- **The document never leaves the device.** No backend, no upload, no account.
- **Nothing is saved.** The app cleans a file and releases a new PDF. The user's details and the document live in memory only and are gone when the tab closes.
- **The user always reviews before export.** Detection is never perfect, so the app proposes and the user approves.
- **Hidden means destroyed.** Hidden content is removed from the file, not covered.
- **Hebrew and English are both first-class.** Hebrew quality is the main differentiator against existing tools.

## 3. User flow

1. **Drop a document** (PDF, JPG or PNG).
2. **Enter "My details"** for this session (optional but recommended). Each field can hold several values, for example the name in Hebrew and in English, a maiden name, two phone numbers. Because nothing is saved, this is typed per session, so the form must be quick and the detectors must do most of the work.
3. **Automatic scan.** The app reads the text (or OCRs it), matches "My details", and runs the "Also found" detectors, including the name model. The user can promote any suggestion to "hide everywhere" with one click instead of typing it.
4. **Review screen.** Page preview with boxes, and a side list in two groups:
   - *Your details*: hidden by default.
   - *Also found*: shown as suggestions, not hidden until the user decides.
5. **Act on findings** (see section 6), and draw manual boxes for anything missed.
6. **Choose output mode**: anonymous or template.
7. **Export.** The app builds the new PDF, verifies it, and offers the download.

## 4. Layer 1: hiding the user's own details

Plain exact-match search is not enough. The same value appears in many written forms, and PDF text is messy. The matcher has three parts.

### 4.1 Generate variants of each value

| Field | Variants generated |
|---|---|
| Name | Each part alone (first, last), both orders, Hebrew and English spellings as entered by the user, with and without Hebrew one-letter prefixes (ל, ב, ו, מ, ה, ש, כ), without niqqud, any letter case |
| ID number | With and without leading zeros (Israeli IDs are often written with 8 digits), with separators (dash, space) |
| Phone | 05X-XXXXXXX, 05XXXXXXXX, +972-5X..., with spaces or dashes |
| Bank account | Account alone, branch-account, bank-branch-account, as part of an IL IBAN |
| Address | Street, house number and city as separate tokens that must appear near each other; common abbreviations |
| Email | Case-insensitive, whole address |
| Free text | Anything else the user wants hidden (employer name, employee number, customer number) |

### 4.2 Normalise the document text

- Build one continuous text stream per page with a map from every character back to its box on the page.
- Fix right-to-left order, strip niqqud, unify final letters and punctuation, collapse whitespace.
- For number fields, also build a digits-only stream so "123-456 789" matches "123456789".
- Allow a match to span a line break or several text fragments.

### 4.3 Match with controlled fuzziness

- **Text pages:** exact match on normalised text.
- **OCR pages:** allow small errors (one wrong character in longer values, common confusions such as 0/O and 1/l), and mark these as lower confidence.
- **Whole-word matching for names.** Short names that are also ordinary words (for example גל, "wave") would otherwise produce false matches. These are shown for review rather than hidden silently.
- **Partial numbers.** Option to also hide the last 4 digits of an account or card when they appear alone.

Every match is tagged with the field it came from, so template mode knows which placeholder to use.

## 5. Layer 2: finding other sensitive data

Things the user did not enter but probably cares about, such as a spouse's name on a contract, a landlord's ID, or a customer number on a bill.

| Detector | Finds | Needs a model? |
|---|---|---|
| Patterns + checksums | Israeli ID (check digit), IL IBAN, card numbers, phones, emails, dates of birth, licence plates | No |
| Field labels | The value next to a known label ("Name:", "ID:", "Address:", "Account no." and Hebrew equivalents such as שם, ת.ז., כתובת, מספר חשבון) | No |
| Barcodes and QR codes | Codes on bills often encode the account or customer number | No |
| Document metadata | Author, title, creation tool, embedded files | No |
| Name detection model | Names, addresses and organisations in free-running text, Hebrew and English | Yes |
| Manual box | Signatures, stamps, photos, handwriting | No |

The name model is part of v1. Since details are not saved, the model is what makes the app fast to use: the user confirms suggestions instead of typing every value each time. Consequences:

- A Hebrew-capable model must be chosen, converted to run in the browser and measured in milestone 0. This is unverified today and is the main technical risk.
- The model is a large one-time download (likely 100 MB or more), cached by the browser as an app asset. The scan must show progress, and the pattern and label detectors should return results first while the model loads.
- If no Hebrew model runs acceptably in the browser, the fallback is patterns + labels + typed details for Hebrew, with the model for English only.

## 6. Actions on a finding

- **Hide** or **Keep**, for one occurrence or for all occurrences of the same value.
- **Replace with placeholder** and choose the label.
- **Hide everywhere**: add the value to this session's "My details" so every occurrence, with its variants, is hidden in this document and any other document cleaned in the same session.
- **Ignore**: stop flagging this value for the rest of the session (for example a public company phone number).
- **Adjust box**: resize or move when the box does not cover the text fully.
- **Add manual box** anywhere on the page.

The review list shows counts per group and warns when "Also found" items are still undecided at export time.

## 7. Output

- **Anonymous mode:** solid black boxes.
- **Template mode:** a box with a label such as `[FULL NAME]` or `[שם מלא]`. The same value gets the same label everywhere, and different people get numbered labels (`[NAME 1]`, `[NAME 2]`).
- **How content is destroyed:** each page is rendered to an image with the boxes painted in, and a new PDF is built from those images. Nothing from the original file structure is carried over: no hidden text, metadata, attachments, form data or edit history.
- **Trade-off:** the output text is not selectable and the file is larger. A searchable version (text layer rebuilt from non-hidden words only) can be added later.
- **Verification before download:** the app extracts text from the output and searches it for every hidden value. Export is blocked if anything is found.

## 8. No storage

Decision: the app saves nothing about the user.

- "My details", the ignore list and the document exist only in memory for the current tab.
- Closing or reloading the tab erases them. A "clear now" button does the same on demand.
- Several documents can be cleaned in one session without retyping.
- The only things kept on the device are the app's own files (code, OCR data, name model) and the interface language choice.
- Cost of this decision: details are retyped in each new session. The name model and one-click "hide everywhere" are there to keep that short.

## 9. Tech stack

| Need | Choice |
|---|---|
| App | React + TypeScript + Vite, installable PWA, works offline |
| PDF rendering and text extraction | PDF.js |
| Building the output PDF | pdf-lib |
| OCR | Tesseract.js with `eng` + `heb` data |
| Barcode / QR detection | zxing-wasm (browser BarcodeDetector where available) |
| Name detection | transformers.js with an ONNX model, WebGPU with WASM fallback (Hebrew model to be chosen and tested) |
| Heavy work | Web Workers |
| User data storage | None (in memory only) |
| UI languages | English and Hebrew, with right-to-left layout |
| Hosting | Static host (Cloudflare Pages or Netlify) |
| Trust | Strict Content-Security-Policy blocking outgoing requests; open source |

## 10. Market position

Browser-based, no-upload redactors already exist (RemoveMyID, RedactOffline, Selfboot PDF Smart Redact, The Eraser), as do paid mobile apps. From a quick search, none offers:

- strong Hebrew support with Israeli formats,
- matching of the user's own details with variants,
- a template mode with consistent placeholders.

These three are the product's differentiators.

## 11. Milestones

| # | Milestone | Done when |
|---|---|---|
| 0 | Hebrew feasibility prototype | Measured on sample text PDFs, scans and photos: usable Hebrew extraction, OCR accuracy, matcher hit rate, and a Hebrew name model running in the browser with its accuracy, size and speed |
| 1 | Core on text PDFs | "My details" entry, variant matcher, review screen, flattened export, verification |
| 2 | "Also found" | Name model, patterns, field labels, metadata, full action set, session ignore list |
| 3 | Scans and images | OCR path with fuzzy matching and confidence marking |
| 4 | Template mode and polish | Placeholders, Hebrew UI, offline PWA |
| 5 | Extras | Barcode/QR detection, searchable output, DOCX input |

v1 is milestones 1 to 4.

## 12. Risks and open questions

- **Hebrew text extraction** from PDFs may be unreliable for some generators. Fallback: OCR the page.
- **Hebrew OCR on phone photos** may be too weak for fuzzy matching to rescue. Milestone 0 measures this.
- **Missed occurrences** are the worst failure. Mitigations: variants, the review step, the verification step, and clear wording that the user is responsible for the final check.
- **False sense of safety:** a document can identify a person through context (job title, unusual salary, employer) even with all listed fields hidden. The app should say so.
- **Hebrew name model in the browser** is unproven: availability of a convertible model, download size, and speed on ordinary laptops and phones. Milestone 0 measures this.
- **Open:** app name; free versus paid; whether to open source from day one.
