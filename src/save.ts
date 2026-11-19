// Saving the finished PDF.
//
// On a computer a normal download link is used. On a phone or tablet (iPhone
// in particular) a download link either does nothing or opens a full-screen
// preview with no way back when the app runs from the Home Screen, so there
// the system share sheet is used instead: "Save to Files", Mail, WhatsApp,
// AirDrop, Print.

/**
 * True when this device should save through the share sheet.
 *
 * Desktop Chrome and Edge on Windows also support sharing files, so support
 * alone is not enough: the share sheet is used only on touch-first devices,
 * which keeps the computer version a plain download.
 */
export function savesViaShareSheet(file: File): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  const touchFirst = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (!touchFirst) return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export type ShareOutcome = 'shared' | 'cancelled' | 'failed';

/**
 * Opens the share sheet with the file. Must be called directly from a tap:
 * iOS refuses to open it without a fresh user gesture.
 */
export async function shareFile(file: File): Promise<ShareOutcome> {
  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}
