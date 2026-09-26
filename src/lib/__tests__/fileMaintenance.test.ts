import AsyncStorage from '@react-native-async-storage/async-storage';
import { referencedFiles, removeUnreferencedFile } from '../fileMaintenance';
import { PURCHASE_STORAGE_KEY } from '../localPurchaseStore';
import { deleteDocumentFile } from '../documents';
jest.mock('../documents', () => ({ deleteDocumentFile: jest.fn(async () => {}) }));
jest.mock('../browserDocuments', () => ({ listBrowserDocuments: jest.fn(async () => []) }));
beforeEach(async () => { await AsyncStorage.clear(); jest.clearAllMocks(); });
test('references are retained across guest and account caches', async () => {
  await AsyncStorage.setItem(PURCHASE_STORAGE_KEY, JSON.stringify([{ documents:[{uri:'shared'}] }]));
  await AsyncStorage.setItem(PURCHASE_STORAGE_KEY+'.account', JSON.stringify({version:2,items:[{documents:[{uri:'private'}]}]}));
  expect(await referencedFiles()).toEqual(new Set(['shared','private']));
  await removeUnreferencedFile('shared'); expect(deleteDocumentFile).not.toHaveBeenCalled();
});
test.each(['{', '{}', '{"version":2,"items":[{}]}'])('malformed cache stops deletion: %s', async raw => {
  await AsyncStorage.setItem(PURCHASE_STORAGE_KEY,raw);
  await expect(removeUnreferencedFile('original')).rejects.toThrow();
  expect(deleteDocumentFile).not.toHaveBeenCalled();
});
