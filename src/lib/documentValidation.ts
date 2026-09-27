export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export function validateDocumentSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_DOCUMENT_BYTES) throw new Error('Choose a non-empty document no larger than 20 MB.');
}
export function validateDocumentName(name: string) {
  if (!/\.(pdf|jpe?g|png|webp|gif)$/i.test(name) || name.length > 255 || Array.from(name).some(char => char.charCodeAt(0) < 32)) throw new Error('Choose a PDF, JPEG, PNG, WebP, or GIF file.');
}
export function isOwnedDocumentUri(uri: string, directory: string | null) {
  if (!directory || !uri.startsWith(`${directory}proofpilot-documents/`)) return false;
  const filename = uri.slice(`${directory}proofpilot-documents/`.length);
  // App-owned names are generated locally and have no path components or encoding.
  return /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(filename) && !filename.includes('..');
}

/** Legacy links must not turn a document action into scriptable data navigation. */
export function isAllowedDocumentUrl(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.protocol === 'https:') return !url.username && !url.password;
    if (url.protocol === 'blob:') return true;
    if (url.protocol === 'data:') {
      const mime = uri.slice(5).split(/[;,]/, 1)[0].toLowerCase();
      return DOCUMENT_MIME_TYPES.includes(mime);
    }
  } catch { return false; }
  return false;
}
