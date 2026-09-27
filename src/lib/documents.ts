import { DOCUMENT_MIME_TYPES, isAllowedDocumentUrl, isOwnedDocumentUri, validateDocumentName, validateDocumentSize } from './documentValidation';
import { deleteBrowserDocument, isBrowserDocument, readBrowserDocument, saveBrowserDocument } from './browserDocuments';
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import type { PurchaseDocument } from '../types/purchase';

/** Copies picker/cache files into app-owned storage on native platforms. Web files are copied into IndexedDB, never temporary blob URLs. */
export async function persistDocumentUri(uri: string, name: string): Promise<string> {
  validateDocumentName(name);
  if (Platform.OS === 'web') return saveBrowserDocument(uri);
  if (!FileSystem.documentDirectory) throw new Error('Document storage unavailable.');
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory) throw new Error('The selected file is no longer available.');
  validateDocumentSize(info.size);
  const extension = name.includes('.') ? `.${name.split('.').pop()!.replace(/[^a-zA-Z0-9]/g, '')}` : '';
  const directory = `${FileSystem.documentDirectory}proofpilot-documents/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  return destination;
}

export async function deleteDocumentFile(document: PurchaseDocument): Promise<void> {
  if (Platform.OS === 'web' && document.uri && isBrowserDocument(document.uri)) { await deleteBrowserDocument(document.uri); return; }
  if (Platform.OS === 'web' || !document.uri || !FileSystem.documentDirectory || !isOwnedDocumentUri(document.uri, FileSystem.documentDirectory)) return;
  await FileSystem.deleteAsync(document.uri, { idempotent: true });
}

/**
 * Opens a locally-captured document file where the platform allows it.
 * Returns false when there is nothing openable (metadata-only record).
 */
export async function openDocumentFile(document: PurchaseDocument): Promise<boolean> {
  if (document.content) return false; // handled by the in-app text viewer
  if (!document.uri) return false;
  try {
    if (Platform.OS === 'web') {
      if (isBrowserDocument(document.uri)) {
        const blob = await readBrowserDocument(document.uri);
        const url = URL.createObjectURL(blob);
        const anchor = window.document.createElement('a');
        anchor.href = url; anchor.download = document.name; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return true;
      }
      if (!isAllowedDocumentUrl(document.uri)) return false;
      if (/^(blob:|data:)/i.test(document.uri)) {
        const response = await fetch(document.uri);
        if (!response.ok) return false;
        const blob = await response.blob();
        validateDocumentSize(blob.size);
        if (!DOCUMENT_MIME_TYPES.includes(blob.type)) return false;
        // Download legacy files, rather than navigating the app origin to a Blob.
        const url = URL.createObjectURL(blob);
        const anchor = window.document.createElement('a');
        anchor.href = url; anchor.download = document.name; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return true;
      }
      const opened = window.open(document.uri, '_blank');
      if (opened) opened.opener = null;
      return Boolean(opened);
    }
    if (!isOwnedDocumentUri(document.uri, FileSystem.documentDirectory)) return false;
    if (!(await FileSystem.getInfoAsync(document.uri)).exists || !await Sharing.isAvailableAsync()) return false;
    await Sharing.shareAsync(document.uri, { mimeType: document.mimeType ?? undefined, dialogTitle: document.name });
    return true;
  } catch {
    return false;
  }
}
