import { patternMatches } from './detectors';
import { normalize, normValue } from './text';

const FALLBACK = 'document';

/**
 * Name for the cleaned file. The original name is kept only when it holds
 * none of the hidden values and nothing that looks like personal data
 * (ID, phone, email, account…): "Dana Levi payslip.pdf" would otherwise
 * share the very name the user just hid.
 */
export function safeOutputName(original: string, hiddenValues: string[]): string {
  const base = original.replace(/\.pdf$/i, '').trim();
  if (!base) return `${FALLBACK}-clean.pdf`;

  // Treat _ - . as spaces so "Dana_Levi" matches "Dana Levi".
  const spaced = base.replace(/[_.\-]+/g, ' ');
  const haystack = normValue(spaced);
  const digits = haystack.replace(/\D/g, '');
  const holdsHidden = hiddenValues.some((value) => {
    const v = normValue(value);
    if (v.length >= 2 && haystack.includes(v)) return true;
    const d = v.replace(/\D/g, '');
    return d.length >= 5 && digits.includes(d);
  });
  const looksPersonal =
    patternMatches(normalize(base).text).length > 0 ||
    patternMatches(normalize(spaced).text).length > 0;

  return `${holdsHidden || looksPersonal ? FALLBACK : base}-clean.pdf`;
}
