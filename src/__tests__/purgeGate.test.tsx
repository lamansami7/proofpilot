// App.tsx opens the local-data gate only when no unconfirmed account-purge ledger exists:
//   usePurchaseStore(session.user?.id, purgeChecked && !purgeError)
// While a deletion is unconfirmed (for example after a lost final response) the app must not hydrate,
// display, edit or sync the possibly-deleted account's local records. These tests pin that contract at
// the hook: enabled=false reads nothing, hydrates nothing, reaches no cloud client and rejects every write.
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePurchaseStore } from '../hooks/usePurchaseStore';
import { demoPurchases } from '../data/demoPurchases';
import { storageKeyFor } from '../lib/localPurchaseStore';
import { clientForAccount } from '../lib/supabase';

jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => jest.fn()) }));
jest.mock('../lib/supabase', () => ({ clientForAccount: jest.fn(async () => { throw new Error('the cloud must not be reached in this test'); }) }));

let current: ReturnType<typeof usePurchaseStore>;
let renderer: ReactTestRenderer;
function Harness({ enabled }: { enabled: boolean }) { current = usePurchaseStore('owner', enabled); return null; }
const key = storageKeyFor('owner');

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  await AsyncStorage.setItem(key, JSON.stringify({ version: 2, items: [demoPurchases[0]], pending: [], deleted: [] }));
  (AsyncStorage.getItem as jest.Mock).mockClear();
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

test('a closed gate never reads, hydrates or syncs the account\'s local records', async () => {
  await act(async () => { renderer = create(<Harness enabled={false} />); });
  expect(current.hydrated).toBe(false);
  expect(current.items).toEqual([]);
  expect((AsyncStorage.getItem as jest.Mock).mock.calls.some(([requested]) => requested === key)).toBe(false);
  expect(clientForAccount).not.toHaveBeenCalled();
});

test('a closed gate rejects every write and leaves the stored records untouched', async () => {
  await act(async () => { renderer = create(<Harness enabled={false} />); });
  await act(async () => { await expect(current.upsert(demoPurchases[1])).rejects.toThrow('storage is not ready'); });
  await act(async () => { await expect(current.remove(demoPurchases[0].id)).rejects.toThrow('storage is not ready'); });
  await act(async () => { await expect(current.replaceAll([])).rejects.toThrow('storage is not ready'); });
  const raw = JSON.parse((await AsyncStorage.getItem(key))!);
  expect(raw.items).toHaveLength(1);
  expect(raw.items[0].id).toBe(demoPurchases[0].id);
  expect(raw.deleted).toEqual([]);
});

test('the gate opens only when explicitly enabled and closes again, clearing what was shown', async () => {
  await act(async () => { renderer = create(<Harness enabled={false} />); });
  expect(current.items).toEqual([]);
  await act(async () => { renderer.update(<Harness enabled />); });
  expect(current.hydrated).toBe(true);
  expect(current.items.map(item => item.id)).toEqual([demoPurchases[0].id]);
  await act(async () => { renderer.update(<Harness enabled={false} />); });
  expect(current.hydrated).toBe(false);
  expect(current.items).toEqual([]);
});
