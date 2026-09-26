import { filterPurchases, sortPurchases, type PurchaseFilters } from '../purchaseSelectors';
import { migratePurchase } from '../purchaseMigration';
import type { Purchase } from '../../types/purchase';

const now = new Date(2026, 8, 25);
const item = (id: string, overrides: Partial<Purchase> = {}): Purchase => ({
  id, name: id.toUpperCase(), merchant: 'Shop', price: null, purchaseDate: null, category: 'Other',
  icon: 'package', tint: '#fff', protectionStatus: 'unprotected', warrantyEnd: null, warrantyProvider: null,
  returnDeadline: null, serial: null, model: null, hasReceipt: false, hasWarrantyInfo: false, notes: null,
  documents: [], deadlines: [], ...overrides,
});

const base: Purchase[] = [
  item('a', { name: 'Alpha', price: 50, purchaseDate: '2026-01-15', warrantyEnd: '2028-01-01' }),
  item('b', { name: 'Bravo', price: 150, purchaseDate: '2026-06-01', warrantyEnd: '2026-10-05', returnDeadline: '2026-09-28', deadlines: [{ id: 'd1', type: 'return', date: '2026-09-28', title: 'Return' }] }),
  item('c', { name: 'Charlie', price: null, purchaseDate: null, pinned: true }),
  item('d', { name: 'Delta', price: 10, purchaseDate: '2026-08-20' }),
];

describe('purchase sorting', () => {
  test('pinned purchases always float to the top regardless of sort', () => {
    for (const key of ['date', 'name', 'price', 'deadline', 'warranty'] as const) {
      for (const dir of ['asc', 'desc'] as const) {
        expect(sortPurchases(base, key, dir, now)[0].id).toBe('c');
      }
    }
  });

  test('date sorting orders newest first by default and can reverse', () => {
    expect(sortPurchases(base, 'date', 'desc', now).map(i => i.id)).toEqual(['c', 'd', 'b', 'a']);
    expect(sortPurchases(base, 'date', 'asc', now).map(i => i.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  test('missing prices and dates sink to the bottom in both directions', () => {
    expect(sortPurchases(base, 'price', 'desc', now).map(i => i.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(sortPurchases(base, 'price', 'asc', now).map(i => i.id)).toEqual(['c', 'd', 'a', 'b']);
    const withoutPin = base.filter(i => i.id !== 'c');
    expect(sortPurchases(withoutPin, 'price', 'desc', now).map(i => i.id)).toEqual(['b', 'a', 'd']);
    expect(sortPurchases(withoutPin, 'price', 'asc', now).map(i => i.id)).toEqual(['d', 'a', 'b']);
  });

  test('deadline sorting uses the next incomplete deadline, not raw fields', () => {
    const sorted = sortPurchases(base, 'deadline', 'asc', now);
    expect(sorted[0].id).toBe('c'); // pinned first even without deadlines
    expect(sorted[1].id).toBe('b'); // only purchase with a live deadline
    const completed = base.map(i => i.id === 'b'
      ? { ...i, deadlines: i.deadlines.map(d => ({ ...d, completed: true })) }
      : i.id === 'd'
        ? { ...i, deadlines: [{ id: 'd2', type: 'custom' as const, date: '2026-12-15', title: 'Later' }] }
        : i);
    const withDone = sortPurchases(completed, 'deadline', 'asc', now);
    expect(withDone[0].id).toBe('c'); // pinned still first
    expect(withDone.findIndex(i => i.id === 'd')).toBe(1); // live deadline sorts next
    expect(withDone.findIndex(i => i.id === 'b')).toBeGreaterThan(withDone.findIndex(i => i.id === 'd')); // completed-only = treated as no live deadline
  });

  test('warranty sorting orders by coverage end with missing last', () => {
    expect(sortPurchases(base, 'warranty', 'asc', now).map(i => i.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(sortPurchases(base, 'warranty', 'desc', now).map(i => i.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  test('name sorting is case-insensitive', () => {
    expect(sortPurchases(base, 'name', 'asc', now).map(i => i.name)).toEqual(['Charlie', 'Alpha', 'Bravo', 'Delta']); // pinned first
    expect(sortPurchases(base, 'name', 'desc', now).map(i => i.name)).toEqual(['Charlie', 'Delta', 'Bravo', 'Alpha']);
  });

  test('sorting does not mutate the input array', () => {
    const input = [...base];
    sortPurchases(input, 'price', 'asc', now);
    expect(input.map(i => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('purchase filtering', () => {
  const all: PurchaseFilters = { protection: 'all', category: null, receipt: 'all', pinnedOnly: false };

  test('protection filter matches derived status only', () => {
    const items = [
      item('active', { returnDeadline: '2026-10-01', hasReceipt: true }),
      item('active-no-proof', { returnDeadline: '2026-10-01', hasReceipt: false }),
      item('expired', { returnDeadline: '2020-01-01', hasReceipt: true }),
    ];
    expect(filterPurchases(items, { ...all, protection: 'protected' }, now).map(i => i.id)).toEqual(['active']);
    expect(filterPurchases(items, { ...all, protection: 'attention' }, now).map(i => i.id)).toEqual(['active-no-proof']);
    expect(filterPurchases(items, { ...all, protection: 'unprotected' }, now).map(i => i.id)).toEqual(['expired']);
  });

  test('category, receipt, and pinned filters combine with AND semantics', () => {
    const items = [
      item('one', { category: 'Electronics', hasReceipt: true, pinned: true }),
      item('two', { category: 'Electronics', hasReceipt: false }),
      item('three', { category: 'Tools', hasReceipt: true }),
    ];
    expect(filterPurchases(items, { ...all, category: 'Electronics' }, now).map(i => i.id)).toEqual(['one', 'two']);
    expect(filterPurchases(items, { ...all, receipt: 'missing' }, now).map(i => i.id)).toEqual(['two']);
    expect(filterPurchases(items, { ...all, receipt: 'present' }, now).map(i => i.id)).toEqual(['one', 'three']);
    expect(filterPurchases(items, { ...all, pinnedOnly: true }, now).map(i => i.id)).toEqual(['one']);
    expect(filterPurchases(items, { category: 'Electronics', receipt: 'present', pinnedOnly: true, protection: 'all' }, now).map(i => i.id)).toEqual(['one']);
  });

  test('the default filter set keeps everything', () => {
    expect(filterPurchases(base, all, now)).toHaveLength(base.length);
  });
});

describe('pin survives storage migration', () => {
  test('pinned records stay pinned after a reload migration', () => {
    const migrated = migratePurchase({ id: 'x', name: 'Lamp', merchant: 'Shop', pinned: true, documents: [], deadlines: [] });
    expect(migrated?.pinned).toBe(true);
  });
  test('records from older versions default to unpinned instead of crashing', () => {
    const migrated = migratePurchase({ id: 'x', name: 'Lamp', merchant: 'Shop', documents: [], deadlines: [] });
    expect(migrated?.pinned).toBe(false);
    expect(migratePurchase({ id: 'x', name: 'Lamp', pinned: 'yes' })?.pinned).toBe(false);
  });
});
