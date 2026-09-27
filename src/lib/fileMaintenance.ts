import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { listBrowserDocuments } from './browserDocuments';
import { deleteDocumentFile } from './documents';
import { eligibleOrphans } from './documentCleanup';
import { PURCHASE_STORAGE_KEY } from './localPurchaseStore';

/** Read EVERY cache before deleting shared/legacy files. Corrupt caches fail closed. */
export async function referencedFiles(excludingKey?: string): Promise<Set<string>> {
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(PURCHASE_STORAGE_KEY) && key !== excludingKey);
  const refs = new Set<string>();
  for (const [, raw] of await AsyncStorage.multiGet(keys)) {
    if (!raw) continue;
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : parsed?.version === 2 ? parsed.items : null;
    if (!Array.isArray(items)) throw new Error('Unreadable purchase cache; file cleanup stopped.');
    for (const item of items) {
      if (!item || !Array.isArray(item.documents)) throw new Error('Unreadable document references; file cleanup stopped.');
      for (const document of item.documents) {
        if (!document || typeof document !== 'object' || (document.uri != null && typeof document.uri !== 'string')) throw new Error('Unreadable file reference; cleanup stopped.');
        if (typeof document.uri === 'string') refs.add(document.uri);
      }
    }
  }
  return refs;
}
export async function removeUnreferencedFile(uri: string): Promise<void> {
  if ((await referencedFiles()).has(uri)) return;
  await deleteDocumentFile({ id: 'cleanup', name: 'Unused document', kind: 'other', mimeType: null, uri });
}
export async function findUnusedFiles(): Promise<string[]> {
  const refs = await referencedFiles();
  let files: Array<{ uri: string; createdAt: number }> = [];
  if (Platform.OS === 'web') files = await listBrowserDocuments();
  else if (FileSystem.documentDirectory) {
    const directory = `${FileSystem.documentDirectory}proofpilot-documents/`;
    if (!(await FileSystem.getInfoAsync(directory)).exists) return [];
    files = (await FileSystem.readDirectoryAsync(directory)).map(name => ({ uri: directory + name, createdAt: Number(name.split('-')[0]) }));
  }
  return eligibleOrphans(files, refs).map(file => file.uri);
}
export async function deleteUnusedFiles(uris: string[]) {
  // Re-scan at confirmation time; never trust a stale UI inventory.
  const stillUnused = new Set(await findUnusedFiles());
  for (const uri of uris) if (stillUnused.has(uri)) await removeUnreferencedFile(uri);
}
