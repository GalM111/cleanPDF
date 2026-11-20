export type Lang = 'en' | 'he';

const en = {
  dir: 'ltr' as 'ltr' | 'rtl',
  switchTo: 'עברית',
  lead: 'Hide your personal details in a document before you send it. The file is processed on this device only and nothing is saved.',
  drop: 'Drop a PDF, scan or photo here, or click to choose',
  trySample: 'Try it with a sample document',
  readingDocument: 'Reading document…',
  readingImage: 'Reading image…',
  errPassword: 'This PDF is password-protected. Remove the password and try again.',
  errFile: 'Could not read this file. Please choose a PDF or an image.',
  errImage: 'Could not read this image. Try a JPEG or PNG file.',
  errBuild: 'Something went wrong while building the file.',
  clear: 'Clear everything',
  pages: (n: number) => `${n} page(s)`,
  step1: '1. My details',
  step1Hint: 'One per line. Kept in memory only, gone when you close this tab.',
  fields: {
    name: ['Names', 'Dana Levi; דנה לוי'],
    id: ['ID numbers', '123456782'],
    phone: ['Phone numbers', '052-1234567'],
    account: ['Bank accounts', '12-345-678901'],
    email: ['Emails', 'dana@example.com'],
    address: ['Addresses', '12 Herzl St, Tel Aviv'],
    other: ['Anything else', 'employer, employee number…'],
  },
  step2: '2. Review',
  yours: 'Your details in this document',
  noneYet: 'Nothing matched yet.',
  alsoFound: 'Also found',
  undecided: (n: number) => `${n} undecided`,
  noneFound: 'No other sensitive values detected.',
  reviewHint:
    'Tick a row to hide it. Click a box on the page to switch it, or drag on the page to add your own box (signatures, stamps, photos).',
  manualCount: (n: number) => `${n} manual box(es) added.`,
  showOnPage: 'Show on page',
  hideEverywhere: 'Hide everywhere',
  hideEverywhereTitle: 'Add to My details and hide every form of it',
  ignore: 'Ignore',
  step3: '3. Export',
  exportHint: 'How hidden values look in the new file:',
  modes: {
    black: ['Black', 'Solid black box'],
    white: ['White', 'Solid white box'],
    page: ['Page colour', 'Blends into the page background'],
    template: ['Labels', 'A label such as [NAME]'],
    sample: ['Sample data', 'Made-up values such as John Doe'],
  },
  swatchLabel: '[NAME]',
  swatchSample: 'John Doe',
  sampleWarning:
    'Sample data makes the file look like a real document about someone else. Tell the person you send it to that the details are made up.',
  create: (n: number) => `Create clean PDF (${n} hidden)`,
  readingScans: (n: number) => `Reading ${n} scanned page(s)…`,
  building: (p: number, n: number) => `Building page ${p} of ${n}…`,
  checking: 'Checking the result…',
  warnUndecided: (n: number) => `${n} suggested item(s) are still undecided and will stay visible.`,
  warnTextless: (pages: number[]) =>
    pages.length === 1
      ? `Page ${pages[0]} had no readable text, so nothing on it was found automatically. Only boxes you drew by hand will be hidden there.`
      : `Pages ${pages.join(', ')} had no readable text, so nothing on them was found automatically. Only boxes you drew by hand will be hidden there.`,
  exportAnywayQ: 'Export anyway?',
  exportAnyway: 'Export anyway',
  cancel: 'Cancel',
  saveDeclined: 'The file was not saved. Press the button to try again.',
  outputImages:
    'The new file is made of page images only: it has no text, form data, metadata or attachments, and the boxed areas are painted over for good.',
  reviewPages: 'Anything not boxed is still visible. Look through every page before you send it.',
  barcodeHint:
    'Barcodes and QR codes are found automatically. Check that each one is boxed, and draw a box over any that was missed.',
  findingBarcodes: (page: number, total: number) =>
    `Looking for barcodes… (page ${page} of ${total})`,
  saveShare: (name: string, size: string) => `Save / Share ${name} (${size})`,
  saveHint: 'Choose “Save to Files” to keep it on your phone, or pick an app to send it.',
  shareFailed: 'Sharing did not open. Use the download link instead.',
  download: (name: string, kb: number) => `Download ${name} (${kb} KB)`,
  blocked: 'Export blocked. These values can still be read from the output:',
  page: (n: number) => `Page ${n}`,
  scanRead: 'scanned page, read automatically. Check that every box is in place.',
  scanEmpty: 'no text could be read on this scan. Draw boxes by hand.',
  reread: 'Text not found? Read page as a scan',
  rereadTitle:
    'Use this when details on the page are not found: the page is read from its picture instead',
  imagesWarn:
    'has pictures. Text inside pictures (ID copies, signatures, photos) is not found automatically: draw boxes over it, or read the page as a scan.',
  marksWarn: 'has form fields, signatures or stamps. Check that each one is covered.',
  scanFailed: 'could not read this scan. Draw boxes by hand, or',
  tryAgain: 'try again',
  scanWaiting: 'scanned page, waiting to be read…',
  scanReading: (pct: number) => `reading scanned page… ${pct}%`,
  boxTitle: (kind: string, text: string, hidden: boolean) =>
    `${kind}: ${text} — click to ${hidden ? 'keep' : 'hide'}`,
  manualTitle: 'Your box — click to select, then drag to move or use the corners to resize',
  removeBox: 'Remove this box',
  drawBox: 'Draw a box',
  doneDrawing: 'Done drawing',
  drawHintTouch:
    'To hide something that was not found, tap “Draw a box” and drag over it. Tap a box you drew to move, resize or remove it.',
  redacted: 'REDACTED',
  kinds: {
    Name: 'Name',
    'ID number': 'ID number',
    Phone: 'Phone',
    'Bank account': 'Bank account',
    Email: 'Email',
    Address: 'Address',
    Custom: 'Custom',
    IBAN: 'IBAN',
    'Card number': 'Card number',
    Barcode: 'Barcode / QR code',
    Other: 'Other',
  } as Record<string, string>,
  notes: {
    short: 'Short word, may be an ordinary word. Tick to hide',
    fuzzy: 'Close match in a scan, please check',
    barcodeMine: 'Holds your details',
    barcodeData: 'May hold personal data',
  },
};

export type Strings = typeof en;

const he: Strings = {
  dir: 'rtl',
  switchTo: 'English',
  lead: 'הסתירו את הפרטים האישיים במסמך לפני שאתם שולחים אותו. הקובץ מעובד במכשיר הזה בלבד ושום דבר לא נשמר.',
  drop: 'גררו לכאן PDF, סריקה או תמונה, או לחצו לבחירה',
  trySample: 'נסו עם מסמך לדוגמה',
  readingDocument: 'קורא את המסמך…',
  readingImage: 'קורא את התמונה…',
  errPassword: 'קובץ ה-PDF מוגן בסיסמה. הסירו את הסיסמה ונסו שוב.',
  errFile: 'לא ניתן לקרוא את הקובץ. בחרו קובץ PDF או תמונה.',
  errImage: 'לא ניתן לקרוא את התמונה. נסו קובץ JPEG או PNG.',
  errBuild: 'משהו השתבש בזמן יצירת הקובץ.',
  clear: 'נקה הכול',
  pages: (n) => (n === 1 ? 'עמוד אחד' : `${n} עמודים`),
  step1: '1. הפרטים שלי',
  step1Hint: 'פרט אחד בכל שורה. נשמר בזיכרון בלבד ונמחק כשסוגרים את הלשונית.',
  fields: {
    name: ['שמות', 'דנה לוי; Dana Levi'],
    id: ['מספרי זהות', '123456782'],
    phone: ['מספרי טלפון', '052-1234567'],
    account: ['חשבונות בנק', '12-345-678901'],
    email: ['כתובות דוא"ל', 'dana@example.com'],
    address: ['כתובות', 'רחוב הרצל 12, תל אביב'],
    other: ['כל דבר אחר', 'מעסיק, מספר עובד…'],
  },
  step2: '2. בדיקה',
  yours: 'הפרטים שלכם במסמך',
  noneYet: 'עדיין לא נמצאו התאמות.',
  alsoFound: 'נמצאו גם',
  undecided: (n) => `${n} ממתינים להחלטה`,
  noneFound: 'לא זוהו ערכים רגישים נוספים.',
  reviewHint:
    'סמנו שורה כדי להסתיר אותה. לחצו על תיבה בעמוד כדי להחליף את מצבה, או גררו על העמוד כדי להוסיף תיבה משלכם (חתימות, חותמות, תמונות).',
  manualCount: (n) => `נוספו ${n} תיבות ידניות.`,
  showOnPage: 'הצג בעמוד',
  hideEverywhere: 'הסתר בכל מקום',
  hideEverywhereTitle: 'הוספה ל"הפרטים שלי" והסתרת כל צורות הכתיבה',
  ignore: 'התעלם',
  step3: '3. ייצוא',
  exportHint: 'כך ייראו הערכים המוסתרים בקובץ החדש:',
  modes: {
    black: ['שחור', 'תיבה שחורה'],
    white: ['לבן', 'תיבה לבנה'],
    page: ['צבע העמוד', 'משתלב ברקע העמוד'],
    template: ['תוויות', 'תווית כגון [שם]'],
    sample: ['נתוני דוגמה', 'ערכים בדויים כגון ישראל ישראלי'],
  },
  swatchLabel: '[שם]',
  swatchSample: 'ישראל ישראלי',
  sampleWarning:
    'נתוני דוגמה גורמים לקובץ להיראות כמו מסמך אמיתי על אדם אחר. ספרו למי שמקבל את הקובץ שהפרטים בדויים.',
  create: (n) => `צור PDF נקי (${n} מוסתרים)`,
  readingScans: (n) => `קורא ${n} עמודים סרוקים…`,
  building: (p, n) => `בונה עמוד ${p} מתוך ${n}…`,
  checking: 'בודק את התוצאה…',
  warnUndecided: (n) => `${n} פריטים מוצעים עדיין ממתינים להחלטה ויישארו גלויים.`,
  warnTextless: (pages) =>
    pages.length === 1
      ? `בעמוד ${pages[0]} לא נמצא טקסט קריא, ולכן שום דבר בו לא זוהה אוטומטית. רק תיבות שציירתם ידנית יוסתרו שם.`
      : `בעמודים ${pages.join(', ')} לא נמצא טקסט קריא, ולכן שום דבר בהם לא זוהה אוטומטית. רק תיבות שציירתם ידנית יוסתרו שם.`,
  exportAnywayQ: 'לייצא בכל זאת?',
  exportAnyway: 'לייצא בכל זאת',
  cancel: 'ביטול',
  saveDeclined: 'הקובץ לא נשמר. לחצו על הכפתור כדי לנסות שוב.',
  outputImages:
    'הקובץ החדש מורכב מתמונות של העמודים בלבד: אין בו טקסט, נתוני טפסים, מטא-דאטה או קבצים מצורפים, והאזורים שסומנו בתיבות נצבעו לצמיתות.',
  reviewPages: 'כל מה שלא סומן בתיבה עדיין גלוי. עברו על כל העמודים לפני השליחה.',
  barcodeHint:
    'ברקודים וקודי QR מזוהים אוטומטית. ודאו שכל אחד מהם מסומן בתיבה, וציירו תיבה על כל קוד שפוספס.',
  findingBarcodes: (page, total) => `מחפש ברקודים… (עמוד ${page} מתוך ${total})`,
  saveShare: (name, size) => `שמירה / שיתוף של ${name} (${size})`,
  saveHint: 'בחרו "שמירה בקבצים" כדי לשמור בטלפון, או בחרו אפליקציה לשליחה.',
  shareFailed: 'השיתוף לא נפתח. השתמשו בקישור ההורדה.',
  download: (name, kb) => `הורדת ${name} (${kb} ק"ב)`,
  blocked: 'הייצוא נחסם. עדיין אפשר לקרוא את הערכים האלה בקובץ:',
  page: (n) => `עמוד ${n}`,
  scanRead: 'עמוד סרוק, נקרא אוטומטית. ודאו שכל התיבות במקומן.',
  scanEmpty: 'לא נמצא טקסט קריא בסריקה. ציירו תיבות ידנית.',
  reread: 'הטקסט לא נמצא? קרא את העמוד כסריקה',
  rereadTitle: 'כשפרטים בעמוד לא נמצאים: העמוד ייקרא מהתמונה שלו במקום מהטקסט',
  imagesWarn:
    'יש בעמוד תמונות. טקסט בתוך תמונות (צילומי תעודה, חתימות, צילומים) לא מזוהה אוטומטית: ציירו עליו תיבות, או קראו את העמוד כסריקה.',
  marksWarn: 'יש בעמוד שדות טופס, חתימות או חותמות. ודאו שכל אחד מהם מוסתר.',
  scanFailed: 'לא ניתן לקרוא את הסריקה. ציירו תיבות ידנית, או',
  tryAgain: 'נסו שוב',
  scanWaiting: 'עמוד סרוק, ממתין לקריאה…',
  scanReading: (pct) => `קורא עמוד סרוק… ${pct}%`,
  boxTitle: (kind, text, hidden) =>
    `${kind}: ${text} — לחצו כדי ${hidden ? 'להשאיר גלוי' : 'להסתיר'}`,
  manualTitle: 'תיבה שציירתם — לחצו כדי לבחור, ואז גררו כדי להזיז או משכו בפינות כדי לשנות גודל',
  removeBox: 'הסרת התיבה',
  drawBox: 'ציור תיבה',
  doneDrawing: 'סיום ציור',
  drawHintTouch:
    'כדי להסתיר משהו שלא נמצא, הקישו על "ציור תיבה" וגררו מעליו. הקישו על תיבה שציירתם כדי להזיז, לשנות גודל או להסיר אותה.',
  redacted: 'הוסתר',
  kinds: {
    Name: 'שם',
    'ID number': 'מספר זהות',
    Phone: 'טלפון',
    'Bank account': 'חשבון בנק',
    Email: 'דוא"ל',
    Address: 'כתובת',
    Custom: 'אחר',
    IBAN: 'IBAN',
    'Card number': 'מספר כרטיס',
    Barcode: 'ברקוד / קוד QR',
    Other: 'אחר',
  },
  notes: {
    short: 'מילה קצרה, ייתכן שזו מילה רגילה. סמנו כדי להסתיר',
    fuzzy: 'התאמה קרובה בסריקה, כדאי לבדוק',
    barcodeMine: 'מכיל את הפרטים שלכם',
    barcodeData: 'ייתכן שמכיל מידע אישי',
  },
};

export const STRINGS: Record<Lang, Strings> = { en, he };

const KEY = 'cleanpdf.lang';

/** The saved interface language, or Hebrew when the browser is set to Hebrew. */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'he') return saved;
  } catch {
    // Storage can be blocked (private windows); the choice is then not kept.
  }
  return /^(he|iw)\b/i.test(navigator.language) ? 'he' : 'en';
}

/** The interface language is the only thing the app keeps on the device. */
export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // See above.
  }
}
