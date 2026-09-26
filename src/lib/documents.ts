import { deleteBrowserDocument, isBrowserDocument, readBrowserDocument, saveBrowserDocument } from './browserDocuments';
import { Linking, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import type { PurchaseDocument } from '../types/purchase';

/** Copies picker/cache files into app-owned storage on native platforms. Web files are copied into IndexedDB, never temporary blob URLs. */
export async function persistDocumentUri(uri: string, name: string): Promise<string> {
  if (Platform.OS === 'web') return saveBrowserDocument(uri);
  if (!FileSystem.documentDirectory) throw new Error('Document storage unavailable.');
  const extension = name.includes('.') ? `.${name.split('.').pop()!.replace(/[^a-zA-Z0-9]/g, '')}` : '';
  const directory = `${FileSystem.documentDirectory}proofpilot-documents/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  return destination;
}

export async function deleteDocumentFile(document: PurchaseDocument): Promise<void> {
  if (Platform.OS === 'web' && document.uri && isBrowserDocument(document.uri)) { await deleteBrowserDocument(document.uri); return; }
  if (Platform.OS === 'web' || !document.uri || !FileSystem.documentDirectory || !document.uri.startsWith(FileSystem.documentDirectory)) return;
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
      if (!/^(blob:|data:(application\/pdf|image\/)|https:\/\/)/.test(document.uri)) return false;
      const opened = window.open(document.uri, '_blank');
      if (opened) opened.opener = null;
      return Boolean(opened);
    }
    const supported = await Linking.canOpenURL(document.uri);
    if (!supported) return false;
    await Linking.openURL(document.uri);
    return true;
  } catch {
    return false;
  }
}
