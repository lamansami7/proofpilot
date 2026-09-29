import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MAX_SYNC_ATTEMPTS } from '../lib/syncBackoff';
import { demoPurchases } from '../data/demoPurchases';
import { deletePurchase, listDeletedPurchases, listPurchases, savePurchase } from '../lib/purchaseRepository';
import { usePurchaseStore } from '../hooks/usePurchaseStore';
import type { Purchase } from '../types/purchase';

jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => jest.fn()) }));
jest.mock('../lib/supabase', () => ({ clientForAccount: jest.fn(async () => ({ owner: 'client' })) }));
jest.mock('../lib/purchaseRepository', () => ({
  listPurchases: jest.fn(async () => []),
  listDeletedPurchases: jest.fn(async () => []),
  savePurchase: jest.fn(async (purchase: unknown) => purchase),
  deletePurchase: jest.fn(async () => undefined),
}));

let current: ReturnType<typeof usePurchaseStore>;
let renderer: ReactTestRenderer;
function Harness({ owner }: { owner: string }) { current = usePurchaseStore(owner); return null; }
const mocked = (fn: unknown) => fn as jest.Mock;

/** Drains the microtask queue until the hook reaches a known point. */
async function settle(times = 25) {
  for (let index = 0; index < times; index++) await act(async () => { await Promise.resolve(); });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mocked(listPurchases).mockImplementation(async () => []);
  mocked(listDeletedPurchases).mockImplementation(async () => []);
  mocked(savePurchase).mockImplementation(async purchase => purchase);
  mocked(deletePurchase).mockImplementation(async () => undefined);
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

// A change() that lands mid-pass used to be stranded: the running sync had already
// drained the outbox, and the follow-up retrySync() returned early because a sync
// was in progress. The store now runs a bounded number of extra rounds instead.
test('an edit made while a sync pass is in flight is uploaded without any new external trigger', async () => {
  let release!: (rows: unknown[]) => void;
  mocked(listPurchases).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  await act(async () => { renderer = create(<Harness owner="owner" />); });
  await settle();
  expect(mocked(listPurchases).mock.calls.length).toBeGreaterThan(0);

  const sample: Purchase = { ...demoPurchases[0], id: 'edited-during-sync', name: 'Edited while syncing' };
  await act(async () => { await current.upsert(sample); });
  release([]);

  for (let index = 0; index < 25; index++) {
    if (mocked(savePurchase).mock.calls.some(call => call[0].id === 'edited-during-sync')) break;
    await act(async () => { await Promise.resolve(); });
  }
  expect(mocked(savePurchase).mock.calls.some(call => call[0].id === 'edited-during-sync')).toBe(true);
  expect(current.syncStatus).toBe('synced');
  // The outbox drains; nothing is left claiming an error.
  expect(current.syncError).toBeNull();
});

test('a transient failure retries a bounded number of times, then reports the error', async () => {
  jest.useFakeTimers();
  try {
    mocked(listDeletedPurchases).mockRejectedValue(new Error('TypeError: Failed to fetch'));
    await act(async () => { renderer = create(<Harness owner="owner" />); });
    expect(mocked(listDeletedPurchases).mock.calls.length).toBe(1);
    await act(async () => { await jest.advanceTimersByTimeAsync(120_000); });
    // Bounded: it retried, but it stopped and never loops forever.
    expect(mocked(listDeletedPurchases).mock.calls.length).toBe(MAX_SYNC_ATTEMPTS);
    expect(current.syncStatus).toBe('error');
    expect(current.syncError).toContain('Check your connection');
    // Local data is retained; nothing was silently dropped.
    expect(current.items).toEqual([]);
  } finally { jest.useRealTimers(); }
});

test('an authorization or schema failure is reported immediately without burning retries', async () => {
  mocked(listDeletedPurchases).mockRejectedValue(new Error('new row violates row-level security policy'));
  await act(async () => { renderer = create(<Harness owner="owner" />); });
  await settle();
  expect(mocked(listDeletedPurchases).mock.calls.length).toBe(1);
  expect(current.syncStatus).toBe('error');
  expect(current.syncError).toContain('database migration');
});

test('a successful pass clears the retry budget so ordinary use never accumulates attempts', async () => {
  let fail = true;
  mocked(listDeletedPurchases).mockImplementation(async () => {
    if (fail) { fail = false; throw new Error('TypeError: Failed to fetch'); }
    return [];
  });
  jest.useFakeTimers();
  try {
    await act(async () => { renderer = create(<Harness owner="owner" />); });
    // A transient failure schedules a bounded backoff instead of a dead end.
    expect(current.syncStatus).toBe('syncing');
    await act(async () => { await jest.advanceTimersByTimeAsync(30_000); });
    expect(current.syncStatus).toBe('synced');
    expect(current.syncError).toBeNull();
    // The ladder restarts on the next failure rather than being already spent:
    // an exhausted budget would report 'error' here instead of 'syncing'.
    fail = true;
    await act(async () => { await current.retrySync(); });
    expect(current.syncStatus).toBe('syncing');
    await act(async () => { await jest.advanceTimersByTimeAsync(30_000); });
    expect(current.syncStatus).toBe('synced');
  } finally { jest.useRealTimers(); }
});
