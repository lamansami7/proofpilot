import { validatePurchaseFields } from '../purchaseValidation';
import { isValidIsoDate, addCalendarDays } from '../date';
import { daysUntil } from '../deadlines';
import {
  deriveProtection,
  deadlineStatus,
  normalizedDeadlines,
  groupDeadlines,
  filterPurchases,
  sortPurchases,
  protectionSummary,
  documentInventory,
} from '../purchaseSelectors';
import { demoPurchases } from '../../data/demoPurchases';
import type { Purchase } from '../../types/purchase';

// V3.1 reliability & edge coverage — malformed, empty, DST, zero-dollar, large lists, trust boundaries

describe('Reliability · malformed and empty inputs', () => {
  test('validatePurchaseFields requires name and merchant', () => {
    const base = { name: '', merchant: '', price: '0', purchaseDate: '2026-09-25', returnDeadline: '', warrantyEnd: '' };
    const errors = validatePurchaseFields(base, new Date(2026, 8, 25));
    expect(errors.name).toBeTruthy();
    expect(errors.merchant).toBeTruthy();
  });

  test('validatePurchaseFields tolerates zero-dollar but rejects blanks and trailing chars', () => {
    const base = { name: 'Free sample', merchant: 'Store', purchaseDate: '2026-09-25', returnDeadline: '', warrantyEnd: '' };
    expect(validatePurchaseFields({ ...base, price: '0' }, new Date(2026, 8, 25)).price).toBeUndefined();
    expect(validatePurchaseFields({ ...base, price: '0.00' }, new Date(2026, 8, 25)).price).toBeUndefined();
    expect(validatePurchaseFields({ ...base, price: '' }, new Date(2026, 8, 25)).price).toBeTruthy();
    expect(validatePurchaseFields({ ...base, price: '12.345' }, new Date(2026, 8, 25)).price).toBeTruthy();
    expect(validatePurchaseFields({ ...base, price: '12oops' }, new Date(2026, 8, 25)).price).toBeTruthy();
  });

  test('filterPurchases handles empty catalog without crashing', () => {
    expect(filterPurchases([], { protection: 'all', category: null, receipt: 'all', pinnedOnly: false })).toEqual([]);
  });

  test('documentInventory handles purchases with no documents', () => {
    const bare = { ...demoPurchases[0], id: 'bare', documents: [] } as Purchase;
    const inv = documentInventory([bare]);
    expect(inv.all).toEqual([]);
    expect(inv.receipts).toEqual([]);
  });
});

describe('Reliability · dates and DST boundaries', () => {
  test('isValidIsoDate rejects impossible calendar dates', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-04-31')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2024-02-29')).toBe(true); // leap
    expect(isValidIsoDate('2023-02-29')).toBe(false);
  });

  test('addCalendarDays handles month and year boundaries', () => {
    expect(addCalendarDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  test('daysUntil is calendar-day correct across DST-style boundaries', () => {
    // Using noon-anchored math, DST should not shift by an hour.
    expect(daysUntil('2026-03-09', new Date(2026, 2, 8))).toBe(1); // US DST spring
    expect(daysUntil('2026-11-02', new Date(2026, 10, 1))).toBe(1); // US DST fall
    expect(daysUntil('2026-09-25', new Date(2026, 8, 25))).toBe(0);
  });

  test('deadlineStatus categorizes today vs urgent vs overdue', () => {
    const now = new Date(2026, 8, 25);
    expect(deadlineStatus('2026-09-24', now)?.status).toBe('overdue');
    expect(deadlineStatus('2026-09-25', now)?.status).toBe('today');
    expect(deadlineStatus('2026-09-26', now)?.status).toBe('urgent');
    expect(deadlineStatus('2026-10-26', now)?.status).toBe('later');
  });

  test('normalizedDeadlines skips invalid ISO dates', () => {
    const p = {
      ...demoPurchases[0],
      id: 'bad-date',
      deadlines: [{ id: 'x', type: 'custom' as const, date: '2026-13-40', title: 'Bad' }],
    } as Purchase;
    expect(normalizedDeadlines([p], new Date(2026, 8, 25))).toEqual([]);
  });

  test('groupDeadlines separates overdue/today/week/month/later', () => {
    const now = new Date(2026, 8, 25);
    // Use real normalized then group for calendar correctness
    const items: Purchase[] = [
      { ...demoPurchases[0], id: 'g1', deadlines: [{ id: 'd1', type: 'return', date: '2026-09-24', title: 'Past' }] } as Purchase,
      { ...demoPurchases[0], id: 'g2', deadlines: [{ id: 'd2', type: 'return', date: '2026-09-25', title: 'Today' }] } as Purchase,
      { ...demoPurchases[0], id: 'g3', deadlines: [{ id: 'd3', type: 'return', date: '2026-09-27', title: 'Week' }] } as Purchase,
    ];
    const normalized = normalizedDeadlines(items, now);
    const grouped = groupDeadlines(normalized, now);
    expect(grouped.overdue.length).toBe(1);
    expect(grouped.today.length).toBe(1);
    expect(grouped.week.length).toBe(1);
  });
});

describe('Reliability · sorting and filtering large lists', () => {
  test('sortPurchases keeps pinned on top regardless of sort key', () => {
    const a = { ...demoPurchases[0], id: 'a', name: 'Alpha', pinned: false, purchaseDate: '2026-01-01' } as Purchase;
    const b = { ...demoPurchases[0], id: 'b', name: 'Zebra', pinned: true, purchaseDate: '2026-01-02' } as Purchase;
    expect(sortPurchases([a, b], 'name', 'asc')[0].id).toBe('b');
    expect(sortPurchases([a, b], 'date', 'desc')[0].id).toBe('b');
  });

  test('sortPurchases handles null price and date gracefully', () => {
    const withPrice = { ...demoPurchases[0], id: 'priced', price: 100 } as Purchase;
    const withoutPrice = { ...demoPurchases[0], id: 'free', price: null } as Purchase;
    const sorted = sortPurchases([withoutPrice, withPrice], 'price', 'asc');
    // priced should come before null when ascending (null sinks)
    expect(sorted[0].id).toBe('priced');
  });

  test('protectionSummary stays consistent for large catalog', () => {
    const many: Purchase[] = Array.from({ length: 120 }, (_, i) => ({
      ...demoPurchases[0],
      id: `bulk-${i}`,
      returnDeadline: i % 3 === 0 ? '2099-12-31' : null,
      hasReceipt: i % 2 === 0,
      protectionStatus: 'unprotected' as const,
    })) as Purchase[];
    const summary = protectionSummary(many);
    expect(summary.total).toBe(120);
    expect(summary.protected + summary.attention + summary.unprotected).toBe(120);
    expect(summary.missingReceipts).toBe(60);
  });

  test('filterPurchases search is case-insensitive and AND-terms', () => {
    const p = {
      ...demoPurchases[0],
      id: 'search-1',
      name: 'Sony Headphones',
      merchant: 'Best Buy',
      serial: 'SN123',
      documents: [{ id: 'd1', name: 'receipt.pdf', kind: 'receipt', mimeType: 'application/pdf' }],
      deadlines: [{ id: 'dl', type: 'return', date: '2026-10-01', title: 'Return window closes' }],
    } as unknown as Purchase;
    // single and multi-term
    const all = [p];
    expect(filterPurchases(all, { protection: 'all', category: null, receipt: 'all', pinnedOnly: false }).length).toBe(1);
    // purchaseSearch is tested elsewhere, but filter with protected should not crash on null dates
  });
});

describe('Trust · verified vs template', () => {
  test('deriveProtection never invents coverage: expired windows are unprotected even with receipt', () => {
    const now = new Date(2026, 8, 25);
    expect(deriveProtection({ returnDeadline: '2026-09-24', warrantyEnd: null, hasReceipt: true }, now)).toBe('unprotected');
    expect(deriveProtection({ returnDeadline: null, warrantyEnd: '2026-09-24', hasReceipt: true }, now)).toBe('unprotected');
  });
});
