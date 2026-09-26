import { LocalPurchaseStore, removeItem, replaceItems, snapshotFor, storageKeyFor, upsertItem } from '../localPurchaseStore';
import type { Purchase } from '../../types/purchase';

const item = (id: string, overrides: Partial<Purchase> = {}): Purchase => ({
  id, name: `Item ${id}`, merchant: 'Shop', price: 10, purchaseDate: '2026-09-01', category: 'Other',
  icon: 'package', tint: '#fff', protectionStatus: 'unprotected', warrantyEnd: null, warrantyProvider: null,
  returnDeadline: null, serial: null, model: null, hasReceipt: false, hasWarrantyInfo: false, notes: null,
  documents: [], deadlines: [], ...overrides,
});

describe('per-account storage isolation', () => {
  test('each signed-in user gets a distinct storage slot', () => {
    expect(storageKeyFor('user-a')).not.toBe(storageKeyFor('user-b'));
    expect(storageKeyFor('user-a')).toContain('user-a');
    expect(storageKeyFor(null)).toBe(storageKeyFor(undefined));
    expect(storageKeyFor('user-a')).not.toBe(storageKeyFor(null));
  });
  test('the anonymous slot never collides with an account slot', () => {
    expect(storageKeyFor(null)).toBe('proofpilot.v1.purchases');
    expect(storageKeyFor('x').startsWith(`${storageKeyFor(null)}.`)).toBe(true);
  });
});

describe('duplicate-safe record mutations', () => {
  test('repeated saves of the same record never duplicate it', () => {
    const first = upsertItem(snapshotFor(), item('a'), false);
    const second = upsertItem(first, { ...item('a'), name: 'Renamed' }, false);
    const third = upsertItem(second, item('a'), false);
    expect(third.items).toHaveLength(1);
    expect(second.items[0].name).toBe('Renamed');
  });
  test('upsert while signed in queues one pending entry even after repeats', () => {
    let state = upsertItem(snapshotFor(), item('a'), true);
    state = upsertItem(state, item('a'), true);
    state = upsertItem(state, { ...item('a'), price: 20 }, true);
    expect(state.pending).toEqual(['a']);
  });
  test('signed-out upserts never create cloud outbox entries', () => {
    const state = upsertItem(snapshotFor(), item('a'), false);
    expect(state.pending).toEqual([]);
  });
  test('upserting revives a previously tombstoned record', () => {
    const removed = removeItem(snapshotFor([item('a')]), 'a', true);
    expect(removed.deleted).toEqual(['a']);
    const revived = upsertItem(removed, item('a'), true);
    expect(revived.deleted).toEqual([]);
    expect(revived.items).toHaveLength(1);
  });
  test('removing an unsynced record leaves no tombstone behind', () => {
    const state = removeItem(snapshotFor([item('a')]), 'a', false);
    expect(state.deleted).toEqual([]);
    expect(state.items).toEqual([]);
  });
  test('removing an unknown id signed in does not invent a tombstone', () => {
    const state = removeItem(snapshotFor([item('a')]), 'ghost', true);
    expect(state.deleted).toEqual([]);
  });
});

describe('bulk replace (clear / restore samples)', () => {
  test('clearing while signed in tombstones every removed record', () => {
    const state = replaceItems(snapshotFor([item('a'), item('b')]), [], true);
    expect(state.items).toEqual([]);
    expect([...state.deleted].sort()).toEqual(['a', 'b']);
    expect(state.pending).toEqual([]);
  });
  test('clearing while signed out is purely local', () => {
    const state = replaceItems(snapshotFor([item('a')]), [], false);
    expect(state).toMatchObject({ items: [], pending: [], deleted: [] });
  });
  test('kept records are queued for upload and drop their tombstones', () => {
    const base = snapshotFor([item('a'), item('b')]);
    const state = replaceItems({ ...base, deleted: ['a'] }, [item('a')], true);
    expect(state.items.map(i => i.id)).toEqual(['a']);
    expect(state.deleted).toEqual(['b']); // removed record queued for cloud delete…
    expect(state.pending).toEqual(['a']);  // …while the kept record is queued for re-upload
    expect(state.deleted).not.toContain('a'); // kept record's stale tombstone is dropped
  });
});

describe('serialized write queue', () => {
  test('interleaved mutations evaluate against the latest committed snapshot', async () => {
    const writes: string[] = [];
    const store = new LocalPurchaseStore(async s => { writes.push(JSON.stringify(s.items.length)); });
    await Promise.all([
      store.mutate(s => upsertItem(s, item('a'), false)),
      store.mutate(s => upsertItem(s, item('b'), false)),
      store.mutate(s => upsertItem(s, item('c'), false)),
    ]);
    expect(store.snapshot.items).toHaveLength(3);
    expect(writes).toEqual(['1', '2', '3']);
  });
  test('a failed write never advances committed state', async () => {
    const store = new LocalPurchaseStore(async () => { throw new Error('disk full'); });
    await expect(store.mutate(s => upsertItem(s, item('a'), false))).rejects.toThrow('disk full');
    expect(store.snapshot.items).toEqual([]);
  });
});
