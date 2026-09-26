import { LocalPurchaseStore, mergeCloud, readSnapshot, snapshotFor } from '../localPurchaseStore';
import { validatePurchaseFields } from '../purchaseValidation';
import { actionNeeded, nextDeadlineFor, protectedValue, protectionSummary, upcomingDeadlines, urgentDeadlines } from '../purchaseSelectors';
import { migratePurchases } from '../purchaseMigration';
import { claimTemplate, contextFor } from '../../services/ai/purchaseContext';
import { demoPurchases } from '../../data/demoPurchases';
import type { Purchase } from '../../types/purchase';

const now = new Date(2026, 8, 25);
const form = { name: 'Camera', merchant: 'Shop', price: '0', purchaseDate: '2026-09-25', returnDeadline: '', warrantyEnd: '' };
const item: Purchase = { ...demoPurchases[0], id: 'test', returnDeadline: '2026-09-30', warrantyEnd: null, warrantyProvider: null, deadlines: [{ id: 'date', type: 'return', title: 'Return', date: '2026-09-30' }] };

describe('strict purchase validation', () => {
  test('allows free purchases without optional coverage', () => expect(validatePurchaseFields(form, now)).toEqual({}));
  test.each(['-1', '12oops', '1e3', 'Infinity', '1.123', '', '1.2.3', '10000000000'])('rejects price %s without silently rewriting it', price => expect(validatePurchaseFields({ ...form, price }, now).price).toBeTruthy());
  test('rejects impossible and future purchase dates', () => {
    expect(validatePurchaseFields({ ...form, purchaseDate: '2026-02-30' }, now).purchaseDate).toBeTruthy();
    expect(validatePurchaseFields({ ...form, purchaseDate: '2026-09-26' }, now).purchaseDate).toBeTruthy();
  });
  test.each(['returnDeadline', 'warrantyEnd'] as const)('checks %s chronology', key => {
    expect(validatePurchaseFields({ ...form, [key]: '2026-09-24' }, now)[key]).toBeTruthy();
    expect(validatePurchaseFields({ ...form, [key]: '2026-09-25' }, now)[key]).toBeUndefined();
    expect(validatePurchaseFields({ ...form, [key]: '2026-13-01' }, now)[key]).toBeTruthy();
  });
});

describe('completion and live protection', () => {
  test('completed dates stay in storage but disappear from action lists', () => {
    const completed = { ...item, deadlines: item.deadlines.map(d => ({ ...d, completed: true })) };
    expect(upcomingDeadlines([completed], now)).toEqual([]);
    expect(urgentDeadlines([completed], now)).toEqual([]);
    expect(actionNeeded([completed], now)).toEqual([]);
    expect(nextDeadlineFor(completed, now)).toBeNull();
    expect(migratePurchases([completed])[0].deadlines[0].completed).toBe(true);
    expect(urgentDeadlines([{ ...completed, deadlines: item.deadlines }], now)).toHaveLength(1);
  });
  test('never counts expired or missing-proof records as protected value', () => {
    const expired = { ...item, returnDeadline: '2000-01-01', protectionStatus: 'protected' as const };
    const missing = { ...item, returnDeadline: '2099-01-01', hasReceipt: false };
    expect(protectedValue([expired, missing])).toBe(0);
    expect(protectionSummary([expired, missing])).toMatchObject({ protected: 0, attention: 1, unprotected: 1 });
  });
});

describe('durable storage and recovery', () => {
  test('serializes concurrent changes against the latest committed state', async () => {
    const writes: string[] = [];
    const store = new LocalPurchaseStore(async s => { writes.push(JSON.stringify(s)); });
    await Promise.all([store.mutate(s => ({ ...s, items: [...s.items, item] })), store.mutate(s => ({ ...s, items: [...s.items, { ...item, id: 'second' }] }))]);
    expect(store.snapshot.items.map(p => p.id)).toEqual(['test', 'second']);
    expect(readSnapshot(writes[1]).items).toHaveLength(2);
  });
  test('failed writes do not publish changes, and the next attempt can recover', async () => {
    const write = jest.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined);
    const store = new LocalPurchaseStore(write);
    await expect(store.mutate(s => ({ ...s, items: [item] }))).rejects.toThrow('quota');
    expect(store.snapshot.items).toEqual([]);
    await store.mutate(s => ({ ...s, items: [item] }));
    expect(store.snapshot.items).toEqual([item]);
  });
  test('outbox and deletion tombstones survive restart', () => {
    const snapshot = { ...snapshotFor([item]), pending: [item.id], deleted: ['removed'] };
    expect(readSnapshot(JSON.stringify(snapshot))).toMatchObject({ pending: [item.id], deleted: ['removed'] });
  });
  test('malformed storage is not silently replaced by samples', () => {
    expect(() => readSnapshot('{broken')).toThrow();
    expect(() => readSnapshot('{"version":99}')).toThrow();
    expect(readSnapshot('[]').items).toEqual([]);
  });
  test('cloud fetch preserves unsynced edits, deletions, and device file locations', () => {
    const withFile = { ...item, documents: [{ ...item.documents[0], uri: 'proofpilot-file:abc' }] };
    const local = { ...snapshotFor([withFile]), pending: [item.id], deleted: ['gone'] };
    const cloud = [{ ...item, name: 'Stale cloud name' }, { ...item, id: 'gone' }];
    expect(mergeCloud(local, cloud).items).toEqual([withFile]);
    const merged = mergeCloud(snapshotFor([withFile]), [item]);
    expect(merged.items[0].documents[0].uri).toBe('proofpilot-file:abc');
  });
});

describe('honest offline claim drafts', () => {
  test('uses zero price and explicit placeholders rather than invented details', () => {
    const draft = claimTemplate({ ...item, price: 0, purchaseDate: null, warrantyProvider: null, serial: null }, 'warranty', '');
    expect(draft).toContain('USD 0.00');
    expect(draft).toContain('[warranty provider]');
    expect(draft).toContain('[add date]');
    expect(draft).toContain('Nothing has been submitted');
  });
  test('does not feed generated claims or file contents back as factual evidence', () => {
    const context = contextFor({ ...item, documents: [{ id: 'draft', kind: 'claim', name: 'Invented policy', content: 'Guaranteed refund', mimeType: 'text/plain' }] });
    expect(context.documents).toEqual([]);
    expect(JSON.stringify(context)).not.toContain('Guaranteed refund');
  });
});
