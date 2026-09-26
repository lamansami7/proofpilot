import { actionNeeded, attentionPriority, completedDeadlineCount, expiringWarranties, missingProofCount, protectionSummary } from '../purchaseSelectors';
import type { ActionNeeded, Purchase } from '../../types/purchase';

const now = new Date(2026, 8, 25); // 2026-09-25
const purchase = (overrides: Partial<Purchase> = {}): Purchase => ({
  id: 'p', name: 'Widget', merchant: 'Shop', price: 100, purchaseDate: '2026-09-01', category: 'Electronics',
  icon: 'package', tint: '#fff', protectionStatus: 'protected', warrantyEnd: null, warrantyProvider: null,
  returnDeadline: null, serial: null, model: null, hasReceipt: true, hasWarrantyInfo: false, notes: null,
  documents: [], deadlines: [], ...overrides,
});

describe('what-needs-your-attention priority', () => {
  const action = (overrides: Partial<ActionNeeded>): ActionNeeded => ({
    id: 'x', kind: 'deadline', purchase: purchase(), title: 'T', description: 'D', actionLabel: 'Review', ...overrides,
  });

  test('ranks urgent return deadlines first, then warranties, then missing proof, then other deadlines', () => {
    const returnUrgent = action({ deadlineType: 'return', days: 1 });
    const warrantyUrgent = action({ deadlineType: 'warranty', days: 1 });
    const missingReceipt = action({ kind: 'missing_receipt' });
    const missingWarrantyDate = action({ kind: 'missing_warranty' });
    const rebate = action({ deadlineType: 'rebate', days: 0 });
    const priorities = [rebate, missingWarrantyDate, missingReceipt, warrantyUrgent, returnUrgent].map(attentionPriority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a)); // listed highest → lowest priority
    expect(attentionPriority(returnUrgent)).toBeLessThan(attentionPriority(warrantyUrgent));
    expect(attentionPriority(warrantyUrgent)).toBeLessThan(attentionPriority(missingReceipt));
    expect(attentionPriority(missingReceipt)).toBeLessThan(attentionPriority(missingWarrantyDate));
    expect(attentionPriority(missingWarrantyDate)).toBeLessThan(attentionPriority(rebate));
  });

  test('sooner deadlines win inside the same tier', () => {
    expect(attentionPriority(action({ deadlineType: 'return', days: 0 }))).toBeLessThan(attentionPriority(action({ deadlineType: 'return', days: 5 })));
    expect(attentionPriority(action({ deadlineType: 'warranty', days: -2 }))).toBeLessThan(attentionPriority(action({ deadlineType: 'warranty', days: 3 })));
  });

  test('actionNeeded returns items already sorted by that priority', () => {
    const items = [
      purchase({ id: 'rebate-item', hasReceipt: true, deadlines: [{ id: 'r1', type: 'rebate', date: '2026-09-26', title: 'Rebate' }] }),
      purchase({ id: 'no-receipt', hasReceipt: false, returnDeadline: '2026-10-30', deadlines: [{ id: 'r2', type: 'return', date: '2026-10-30', title: 'Return' }] }),
      purchase({ id: 'return-soon', returnDeadline: '2026-09-27', deadlines: [{ id: 'r3', type: 'return', date: '2026-09-27', title: 'Return' }] }),
      purchase({ id: 'warranty-soon', warrantyEnd: '2026-09-29', hasWarrantyInfo: true, deadlines: [{ id: 'w1', type: 'warranty', date: '2026-09-29', title: 'Warranty' }] }),
    ];
    const actions = actionNeeded(items, now);
    expect(actions[0].purchase.id).toBe('return-soon');
    expect(actions[1].purchase.id).toBe('warranty-soon');
    expect(actions[2].purchase.id).toBe('no-receipt'); // missing receipt before the far-away rebate deadline
    expect(actions[actions.length - 1].purchase.id).toBe('rebate-item');
  });

  test('completed and non-urgent deadlines never appear as attention items', () => {
    const items = [
      purchase({ id: 'done', deadlines: [{ id: 'd', type: 'return', date: '2026-09-26', title: 'Return', completed: true }] }),
      purchase({ id: 'far', deadlines: [{ id: 'f', type: 'return', date: '2026-12-01', title: 'Return' }] }),
    ];
    expect(actionNeeded(items, now)).toEqual([]);
  });
});

describe('dashboard health metrics from stored data only', () => {
  test('expiringWarranties counts only active warranties inside the horizon', () => {
    const items = [
      purchase({ id: 'soon', warrantyEnd: '2026-10-10' }),
      purchase({ id: 'today', warrantyEnd: '2026-09-25' }),
      purchase({ id: 'far', warrantyEnd: '2030-01-01' }),
      purchase({ id: 'past', warrantyEnd: '2026-01-01' }),
      purchase({ id: 'none', warrantyEnd: null }),
    ];
    expect(expiringWarranties(items, 30, now).map(i => i.id).sort()).toEqual(['soon', 'today']);
    expect(expiringWarranties(items, 0, now).map(i => i.id)).toEqual(['today']);
  });

  test('completedDeadlineCount counts only explicitly completed deadlines', () => {
    const items = [
      purchase({ id: 'a', deadlines: [{ id: '1', type: 'return', date: '2026-09-01', title: 'x', completed: true }, { id: '2', type: 'warranty', date: '2027-01-01', title: 'y' }] }),
      purchase({ id: 'b', deadlines: [{ id: '3', type: 'custom', date: '2026-10-01', title: 'z', completed: true }] }),
    ];
    expect(completedDeadlineCount(items)).toBe(2);
    expect(completedDeadlineCount([purchase()])).toBe(0);
  });

  test('missingProofCount flags purchases with neither receipt nor documents', () => {
    const items = [
      purchase({ id: 'bare', hasReceipt: false, documents: [] }),
      purchase({ id: 'doc-only', hasReceipt: false, documents: [{ id: 'd', name: 'manual.pdf', kind: 'manual', mimeType: 'application/pdf' }] }),
      purchase({ id: 'receipt', hasReceipt: true, documents: [{ id: 'r', name: 'r.pdf', kind: 'receipt', mimeType: 'application/pdf' }] }),
    ];
    expect(missingProofCount(items)).toBe(1);
    expect(protectionSummary(items).missingReceipts).toBe(2);
  });

  test('metrics stay honest when coverage has expired', () => {
    const items = [purchase({ id: 'old', warrantyEnd: '2020-01-01', returnDeadline: '2020-02-01', hasReceipt: true, protectionStatus: 'protected' })];
    expect(protectionSummary(items).protected).toBe(0);
    expect(expiringWarranties(items, 36500, now)).toEqual([]);
  });
});
