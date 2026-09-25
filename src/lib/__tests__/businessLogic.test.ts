import { daysUntil } from '../deadlines';
import { isValidIsoDate } from '../date';
import { deadlineStatus, deriveProtection, groupDeadlines, matchesPurchaseSearch, normalizedDeadlines, protectionDetails } from '../purchaseSelectors';
import { migratePurchases } from '../purchaseMigration';
import { AIServiceError, validateClaimDraft, validatePurchaseAnswer } from '../../services/ai/AIService';
import type { Purchase } from '../../types/purchase';

const purchase = (overrides: Partial<Purchase> = {}): Purchase => ({ id: 'p1', name: 'MacBook Pro', merchant: 'Best Buy', price: 999, purchaseDate: '2026-09-01', category: 'Electronics', icon: 'monitor', tint: '#fff', protectionStatus: 'protected', warrantyEnd: '2027-09-01', warrantyProvider: 'AppleCare', returnDeadline: '2026-09-30', serial: 'ABC123', model: 'M4', hasReceipt: true, hasWarrantyInfo: true, notes: 'Work laptop', documents: [{ id: 'd1', name: 'receipt.pdf', kind: 'receipt', mimeType: 'application/pdf' }], deadlines: [{ id: 'return-p1', type: 'return', date: '2026-09-30', title: 'Return window closes' }], ...overrides });

describe('calendar-safe dates and deadlines', () => {
  test('rejects impossible calendar dates', () => { expect(isValidIsoDate('2026-02-29')).toBe(false); expect(isValidIsoDate('2024-02-29')).toBe(true); expect(isValidIsoDate('2026-13-01')).toBe(false); });
  test('calculates whole calendar days across DST boundaries', () => { expect(daysUntil('2026-03-09', new Date(2026, 2, 7, 23, 55))).toBe(2); expect(daysUntil('2026-11-02', new Date(2026, 9, 31, 1))).toBe(2); });
  test('groups deadlines by product urgency', () => {
    const now = new Date(2026, 8, 25, 15);
    const items = [purchase({ deadlines: [
      { id: 'a', type: 'custom', date: '2026-09-24', title: 'Past' }, { id: 'b', type: 'custom', date: '2026-09-25', title: 'Today' },
      { id: 'c', type: 'custom', date: '2026-09-30', title: 'Week' }, { id: 'd', type: 'custom', date: '2026-10-10', title: 'Later' },
    ] })];
    const groups = groupDeadlines(normalizedDeadlines(items, now), now);
    expect([groups.overdue.length, groups.today.length, groups.week.length, groups.month.length, groups.later.length]).toEqual([1, 1, 1, 0, 1]);
    expect(deadlineStatus('2026-09-25', now)?.status).toBe('today');
  });
});

describe('protection and search selectors', () => {
  test('only marks active documented coverage protected', () => {
    const now = new Date(2026, 8, 25);
    expect(deriveProtection({ returnDeadline: '2026-09-30', warrantyEnd: null, hasReceipt: true }, now)).toBe('protected');
    expect(deriveProtection({ returnDeadline: '2026-09-24', warrantyEnd: null, hasReceipt: true }, now)).toBe('unprotected');
    expect(deriveProtection({ returnDeadline: '2026-09-30', warrantyEnd: null, hasReceipt: false }, now)).toBe('attention');
    expect(protectionDetails({ returnDeadline: null, warrantyEnd: null, hasReceipt: false }, now).warrantyState).toBe('unknown');
  });
  test('searches documents, warranty details, deadlines, and identifiers', () => {
    const item = purchase({ deadlines: [...purchase().deadlines, { id: 'r', type: 'rebate', date: '2026-10-10', title: 'Mail manufacturer rebate' }] });
    expect(matchesPurchaseSearch(item, 'receipt.pdf')).toBe(true);
    expect(matchesPurchaseSearch(item, 'applecare abc123')).toBe(true);
    expect(matchesPurchaseSearch(item, 'manufacturer rebate')).toBe(true);
    expect(matchesPurchaseSearch(item, 'unrelated')).toBe(false);
  });
});

describe('stored-record migration', () => {
  test('repairs derived flags and drops malformed dates without losing a record', () => {
    const [item] = migratePurchases([{ id: 4, name: 'Camera', merchant: 'Shop', price: 10, purchaseDate: '2026-02-31', returnDeadline: '2026-10-01', documents: [{ id: 'r', name: 'r.jpg', kind: 'receipt', mimeType: 'image/jpeg' }], deadlines: [{ id: 'bad', type: 'custom', date: 'nope', title: 'Bad' }] }]);
    expect(item.purchaseDate).toBeNull(); expect(item.hasReceipt).toBe(true); expect(item.deadlines).toEqual([]); expect(item.protectionStatus).toBe('protected');
  });
});

describe('AI response trust boundary', () => {
  test('accepts only a non-empty answer and string fact arrays', () => { expect(validatePurchaseAnswer({ answer: 'Review your saved date.', knownFacts: ['Return: Sep 30'], missingInformation: [4, 'Policy terms'] })).toEqual({ answer: 'Review your saved date.', knownFacts: ['Return: Sep 30'], missingInformation: ['Policy terms'] }); });
  test('rejects malformed answers and claim drafts', () => { expect(() => validatePurchaseAnswer({ answer: '' })).toThrow(AIServiceError); expect(() => validateClaimDraft({ draft: 42 })).toThrow(AIServiceError); });
});
