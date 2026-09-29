/**
 * Turns a failed document pick/attach into one honest sentence for the user.
 *
 * The storage validators already throw messages that are safe to show. This
 * module keeps exactly those, and replaces anything unrecognised with a
 * friendly fallback. An allowlist is used deliberately: a raw exception string
 * can carry device paths, vendor codes or internals, so an unknown message is
 * never echoed to the screen. Nothing here guesses a cause we cannot confirm.
 */

export type DocumentAction = 'pick' | 'camera' | 'permission';

/** Messages thrown by the document/storage layer that are written for humans. */
const SAFE_MESSAGES = new Set([
  'Choose a non-empty document no larger than 20 MB.',
  'Choose a PDF, JPEG, PNG, WebP, or GIF file.',
  'Document storage unavailable.',
  'The selected file is no longer available.',
  'File could not be read.',
  'Unsupported file type. Choose a PDF or supported image.',
  'Document storage is blocked. Close other ProofPilot tabs.',
  'Document storage failed.',
  'File is missing or unreadable on this device. Reattach it from the purchase.',
  'Unsupported stored file type. Reattach the original PDF or image.',
]);

export function documentFailureMessage(error: unknown, action: DocumentAction): string {
  if (action === 'permission') return 'Camera access is turned off. Turn it on in your device settings, or upload a receipt file instead.';
  const message = error instanceof Error ? error.message : '';
  if (SAFE_MESSAGES.has(message)) return message;
  if (action === 'camera') return 'That photo could not be saved. Try again, or upload a receipt file instead.';
  return 'That file could not be attached. Try a PDF or image under 20 MB, or continue without it.';
}

/** Short status line shown under the affected action while it is failing. */
export function documentFailureHint(action: DocumentAction): string {
  return action === 'camera'
    ? 'Your details are safe — you can attach a file instead.'
    : 'Your details are safe — continue without attaching a file.';
}
