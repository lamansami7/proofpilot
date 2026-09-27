import { DOCUMENT_MIME_TYPES, validateDocumentSize } from './documentValidation';
/** Files are durable across reloads, but clearing browser site data removes them. */
const PREFIX = 'proofpilot-file:';
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let abandoned = false;
    const request = indexedDB.open('proofpilot-documents', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => {
      const db = request.result;
      if (abandoned) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { abandoned = true; reject(new Error('Document storage is blocked. Close other ProofPilot tabs.')); };
  });
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('files', mode);
      const request = action(tx.objectStore('files'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Document storage failed.'));
    });
  } finally {
    // Also close after synchronous transaction/action failures, not just events.
    db.close();
  }
}
export const isBrowserDocument = (uri: string) => uri.startsWith(PREFIX);
export async function saveBrowserDocument(uri: string): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('File could not be read.');
  const blob = await response.blob();
  validateDocumentSize(blob.size);
  if (!DOCUMENT_MIME_TYPES.includes(blob.type)) throw new Error('Unsupported file type. Choose a PDF or supported image.');
  const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await transaction('readwrite', store => store.put(blob, key));
  return PREFIX + key;
}
export async function readBrowserDocument(uri: string): Promise<Blob> {
  const blob = await transaction<Blob | undefined>('readonly', store => store.get(uri.slice(PREFIX.length)));
  if (!(blob instanceof Blob)) throw new Error('File is missing or unreadable on this device. Reattach it from the purchase.');
  validateDocumentSize(blob.size);
  if (!DOCUMENT_MIME_TYPES.includes(blob.type)) throw new Error('Unsupported stored file type. Reattach the original PDF or image.');
  return blob;
}
export async function deleteBrowserDocument(uri: string) { await transaction('readwrite', store => store.delete(uri.slice(PREFIX.length))); }

export async function listBrowserDocuments(): Promise<Array<{ uri: string; createdAt: number }>> {
  const keys = await transaction('readonly', store => store.getAllKeys());
  return keys.map(key => ({ uri: PREFIX + String(key), createdAt: Number(String(key).split('-')[0]) }));
}
