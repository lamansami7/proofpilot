import { buildDashboardModel, attentionPriority as modelPriority } from '../dashboardModel';
import { actionNeeded, attentionPriority, completedDeadlineCount, deriveProtection, documentInventory, expiringWarranties, missingProofCount, protectionSummary, upcomingDeadlines, recentPurchases } from '../purchaseSelectors';
import { demoPurchases } from '../../data/demoPurchases';
import type { Purchase } from '../../types/purchase';

const NOW = new Date('2026-06-15T09:00:00');
const iso = (days: number) => {
  const date = new Date(NOW);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const base = demoPurchases[0];
const library: Purchase[] = [
  { ...base, id: 'return-soon', name: 'Monitor', merchant: 'Best Buy', price: 299, purchaseDate: iso(-10), returnDeadline: iso(5), warrantyEnd: null, hasReceipt: true, documents: [{ id: 'r1', kind: 'receipt', name: 'r.png', mimeType: 'image/png', uri: 'file:///a' }], deadlines: [{ id: 'd1', type: 'return', date: iso(5), title: 'Return window closes' }] },
  { ...base, id: 'return-overdue', name: 'Blender', merchant: 'Target', price: 80, purchaseDate: iso(-60), returnDeadline: iso(-3), warrantyEnd: iso(400), hasReceipt: true, documents: [], deadlines: [{ id: 'd2', type: 'return', date: iso(-3), title: 'Return window closes' }] },
  { ...base, id: 'warranty-soon', name: 'Headphones', merchant: 'Amazon', price: 199, purchaseDate: iso(-340), returnDeadline: null, warrantyEnd: iso(20), hasReceipt: false, documents: [], deadlines: [{ id: 'd3', type: 'warranty', date: iso(20), title: 'Warranty expires' }] },
  { ...base, id: 'warranty-expired', name: 'Laptop', merchant: 'Dell', price: 1299, purchaseDate: iso(-900), returnDeadline: null, warrantyEnd: iso(-10), hasReceipt: true, documents: [{ id: 'w4', kind: 'warranty', name: 'w.pdf', mimeType: 'application/pdf', uri: null }], deadlines: [{ id: 'd4', type: 'warranty', date: iso(-10), title: 'Warranty expires' }] },
  { ...base, id: 'completed', name: 'Toaster', merchant: 'Cafe', price: 40, purchaseDate: iso(-30), returnDeadline: iso(-1), warrantyEnd: null, hasReceipt: true, documents: [], deadlines: [{ id: 'd5', type: 'return', date: iso(-1), title: 'Return window closes', completed: true }] },
  { ...base, id: 'rebate', name: 'Phone', merchant: 'Carrier', price: 700, purchaseDate: iso(-15), returnDeadline: null, warrantyEnd: iso(300), warrantyProvider: 'Carrier', hasReceipt: true, documents: [{ id: 'c6', kind: 'claim', name: 'draft.md', mimeType: 'text/markdown', uri: null }], deadlines: [{ id: 'd6', type: 'rebate', date: iso(45), title: 'Submit rebate' }, { id: 'd7', type: 'custom', date: iso(200), title: 'Upgrade reminder' }] },
  // A corrupt stored date must be skipped, never shown, and never throw.
  { ...base, id: 'corrupt', name: 'Legacy import', merchant: 'Unknown', price: null, purchaseDate: null, returnDeadline: null, warrantyEnd: null, hasReceipt: false, documents: [], deadlines: [{ id: 'd8', type: 'custom', date: '2026-13-45', title: 'Broken date' }] },
];

const ids = <T extends { id: unknown }>(values: T[]) => values.map((value) => String(value.id));

describe('dashboard model is equivalent to the individual selectors', () => {
  const model = buildDashboardModel(library, NOW);

  test('protection summary and protected value match exactly', () => {
    expect(model.summary).toEqual(protectionSummary(library, NOW));
    // Protected = active window AND a receipt on record: Monitor (299),
    // Blender (80, return passed but warranty active) and Phone (700).
    expect(model.summary.valueProtected).toBe(299 + 80 + 700);
    // The expired-warranty laptop is never counted as protected value.
    expect(model.summary.valueProtected).not.toBeGreaterThanOrEqual(299 + 1299);
  });

  test('upcoming deadlines match, in the same order', () => {
    expect(ids(model.upcoming)).toEqual(ids(upcomingDeadlines(library, NOW)));
    // Only stored deadline entries count. A warrantyEnd with no matching
    // deadline row is coverage information, not a separate reminder.
    expect(model.upcoming.map((d) => d.days)).toEqual([5, 20, 45, 200]);
  });

  test('actions match exactly, including ordering and the corrupt-date skip', () => {
    expect(model.actions).toEqual(actionNeeded(library, NOW));
  });

  test('the dashboard shares one ordering rule with the rest of the app', () => {
    expect(modelPriority).toBe(attentionPriority);
  });

  test('document inventory matches', () => {
    expect(ids(model.documents.all)).toEqual(ids(documentInventory(library).all));
    expect(ids(model.documents.receipts)).toEqual(ids(documentInventory(library).receipts));
    expect(ids(model.documents.warranty)).toEqual(ids(documentInventory(library).warranty));
    expect(ids(model.documents.claims)).toEqual(ids(documentInventory(library).claims));
  });

  test('recent, expiring, completed and missing-proof counts match', () => {
    expect(ids(model.recent)).toEqual(ids(recentPurchases(library)));
    expect(ids(model.expiringWarranties)).toEqual(ids(expiringWarranties(library, 30, NOW)));
    expect(model.completedCount).toBe(completedDeadlineCount(library));
    expect(model.noFiles).toBe(missingProofCount(library));
    expect(model.upcomingWithin30).toBe(2);
  });

  test('a corrupt stored deadline never becomes a displayed date', () => {
    expect(model.deadlines.some((d) => String(d.purchase.id) === 'corrupt')).toBe(false);
    expect(() => buildDashboardModel(library, NOW)).not.toThrow();
  });

  test('an empty library is safe and does not invent numbers', () => {
    const empty = buildDashboardModel([], NOW);
    expect(empty.summary).toEqual(protectionSummary([], NOW));
    expect(empty.upcoming).toEqual([]);
    expect(empty.actions).toEqual([]);
    expect(empty.documents.all).toEqual([]);
    expect(empty.recent).toEqual([]);
    expect(empty.upcomingWithin30).toBe(0);
  });
});

describe('dashboard model does the date math once per record', () => {
  const big: Purchase[] = Array.from({ length: 2000 }, (_, index) => ({
    ...base,
    id: `p-${index}`,
    name: `Purchase ${index}`,
    documents: [{ id: 'doc', kind: 'receipt' as const, name: 'r.png', mimeType: 'image/png', uri: null }],
    deadlines: [
      { id: 'a', type: 'custom' as const, date: '2099-12-31', title: 'Later' },
      { id: 'b', type: 'return' as const, date: '2099-11-30', title: 'Return' },
    ],
  }));

  const countDateMath = (run: () => void) => {
    const original = Date.UTC;
    let calls = 0;
    (Date as { UTC: typeof Date.UTC }).UTC = ((...args: Parameters<typeof Date.UTC>) => { calls++; return original(...args); }) as typeof Date.UTC;
    try { run(); } finally { (Date as { UTC: typeof Date.UTC }).UTC = original; }
    return calls;
  };

  test('the single-pass model is dramatically cheaper than computing each consumer separately', () => {
    const modelCalls = countDateMath(() => buildDashboardModel(big, NOW));
    const separateCalls = countDateMath(() => {
      protectionSummary(big, NOW);
      actionNeeded(big, NOW);
      upcomingDeadlines(big, NOW);
      documentInventory(big);
      expiringWarranties(big, 30, NOW);
      missingProofCount(big);
      completedDeadlineCount(big);
      recentPurchases(big);
    });
    expect(separateCalls).toBeGreaterThan(50_000);
    // The old path re-derived protection and re-parsed every deadline once per
    // consumer. Assert a real, measured margin rather than a magic number.
    expect(modelCalls * 2).toBeLessThan(separateCalls);
  });
});

describe('protection status is never overstated', () => {
  test('expired or unknown coverage is not presented as active protection', () => {
    const expired: Purchase = { ...base, id: 'x', returnDeadline: '2020-01-01', warrantyEnd: null, hasReceipt: true, documents: [{ id: 'r', kind: 'receipt', name: 'r.png', mimeType: 'image/png', uri: null }] };
    expect(deriveProtection(expired, NOW)).toBe('unprotected');
    expect(buildDashboardModel([expired], NOW).summary.protected).toBe(0);
  });
});
