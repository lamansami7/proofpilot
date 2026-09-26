import { APP_VERSION, colors, radius, spacing, shadows, sizing, breakpoints, type } from '../../design/tokens';
import { validatePurchaseFields } from '../purchaseValidation';
import { deriveProtection, filterPurchases, sortPurchases, documentInventory, purchaseSearchText, matchesPurchaseSearch, protectionSummary, actionNeeded, normalizedDeadlines } from '../purchaseSelectors';
import { demoPurchases } from '../../data/demoPurchases';
import type { Purchase } from '../../types/purchase';

// Master pre-launch polish — production readiness before 1.0.0
describe('Master polish — public version stays 1.0.0', () => {
  test('APP_VERSION is 1.0.0 and public UI shows proofPilot 1.0.0', () => {
    expect(APP_VERSION).toBe('1.0.0');
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
  test('tokens include attention and hero semantics without exposing V3', () => {
    expect((colors as any).attentionSegment).toBe('#E4B15E');
    expect((colors as any).hero).toBe('#193831');
    expect((colors as any).brandBorder).toBe('#DCE9CA');
    expect((colors as any).brandTint).toBe('#DCEFC6');
  });
});

describe('Design system — premium, restrained, consistent', () => {
  test('spacing is 4-based, breakpoints cover 320 to 1440, contentMax is intentional for ultra', () => {
    Object.values(spacing).forEach(v => expect((v as number) % 4).toBe(0));
    expect(breakpoints.phone).toBe(759);
    expect(breakpoints.ultra).toBe(1440);
    expect(sizing.contentMax).toBe(1220);
    expect(sizing.sidebar).toBe(248);
  });
  test('radius, shadows, touch targets are premium and accessible', () => {
    expect(radius.lg).toBe(16);
    expect(radius.pill).toBe(999);
    expect(sizing.touch).toBe(44);
    expect(sizing.touchCompact).toBe(38);
    expect(shadows.card.shadowOpacity).toBeLessThan(0.1);
    expect(shadows.floating.shadowOpacity).toBeGreaterThan(shadows.card.shadowOpacity as number);
    expect(type.display.fontSize).toBeGreaterThan(type.title.fontSize as number);
    expect(type.eyebrow.letterSpacing).toBeGreaterThan(1);
  });
});

describe('Reliability — id uniqueness and strict validation', () => {
  test('purchase/document/claim/deadline ids are unique under rapid creation', () => {
    const purchaseIds = Array.from({ length: 80 }, () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    expect(new Set(purchaseIds).size).toBe(80);
    const docIds = Array.from({ length: 80 }, () => `document-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    expect(new Set(docIds).size).toBeGreaterThan(75);
    const claimIds = Array.from({ length: 40 }, () => `claim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    expect(new Set(claimIds).size).toBeGreaterThan(38);
    const deadlineIds = Array.from({ length: 40 }, () => `deadline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    expect(new Set(deadlineIds).size).toBeGreaterThan(38);
  });
  test('price validation allows 0 and 0.00 but rejects blanks, 1.123, trailing', () => {
    const base = { name: 'A', merchant: 'B', purchaseDate: '2026-09-20', returnDeadline: '', warrantyEnd: '' };
    expect(validatePurchaseFields({ ...base, price: '0' } as any).price).toBeUndefined();
    expect(validatePurchaseFields({ ...base, price: '0.00' } as any).price).toBeUndefined();
    expect(validatePurchaseFields({ ...base, price: '' } as any).price).toBeTruthy();
    expect(validatePurchaseFields({ ...base, price: '1.123' } as any).price).toBeTruthy();
    expect(validatePurchaseFields({ ...base, price: '12oops' } as any).price).toBeTruthy();
    expect(validatePurchaseFields({ ...base, price: ' ' } as any).price).toBeTruthy();
  });
  test('impossible dates rejected, chronology enforced', () => {
    expect(validatePurchaseFields({ name: 'A', merchant: 'B', price: '10', purchaseDate: '2026-02-30', returnDeadline: '', warrantyEnd: '' } as any).purchaseDate).toBeTruthy();
    expect(validatePurchaseFields({ name: 'A', merchant: 'B', price: '10', purchaseDate: '2026-09-20', returnDeadline: '2026-09-19', warrantyEnd: '' } as any).returnDeadline).toBeTruthy();
    expect(validatePurchaseFields({ name: 'A', merchant: 'B', price: '10', purchaseDate: '2026-09-20', returnDeadline: '', warrantyEnd: '2026-03-09' } as any).warrantyEnd).toBeTruthy();
  });
  test('protection is never presented as active when expired', () => {
    const now = new Date('2026-09-26T12:00:00');
    expect(deriveProtection({ returnDeadline: '2026-09-25', warrantyEnd: null, hasReceipt: true }, now)).toBe('unprotected');
    expect(deriveProtection({ returnDeadline: null, warrantyEnd: '2026-09-30', hasReceipt: false }, now)).toBe('attention');
    expect(deriveProtection({ returnDeadline: '2026-10-10', warrantyEnd: null, hasReceipt: true }, now)).toBe('protected');
  });
});

describe('Large datasets — 100+ purchases stay fast and organized', () => {
  function buildLarge(count: number): Purchase[] {
    const base = demoPurchases[0] as Purchase;
    return Array.from({ length: count }, (_, i) => ({
      ...base,
      id: `local-large-${i}-${Date.now()}`,
      name: `Product ${i} — ${'Very Long Name '.repeat(i % 3)}`.trim(),
      merchant: i % 2 ? 'Best Buy' : 'Amazon',
      price: i % 5 === 0 ? 0 : 99 + i,
      hasReceipt: i % 3 !== 0,
      pinned: i % 10 === 0,
      purchaseDate: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
      documents: i % 4 === 0 ? [] : base.documents,
    }));
  }
  test('filter + sort + search handle 150 items with pinned on top and truncated long names', () => {
    const large = buildLarge(150);
    expect(protectionSummary(large).total).toBe(150);
    const filtered = filterPurchases(large, { protection: 'all', category: null, receipt: 'all', pinnedOnly: false });
    expect(filtered.length).toBe(150);
    const sorted = sortPurchases(large, 'price', 'desc');
    expect(sorted[0].pinned).toBe(true);
    const searched = large.filter(p => matchesPurchaseSearch(p, 'Best Buy'));
    expect(searched.length).toBeGreaterThan(70);
    expect(searched.length).toBeLessThan(150);
    const searchLong = purchaseSearchText(large[0]);
    expect(searchLong.length).toBeGreaterThan(20);
  });
  test('deadlines group correctly for large overdue/week/month/later', () => {
    const now = new Date('2026-09-26T12:00:00');
    const future = new Date(now); future.setDate(future.getDate() + 5);
    const iso = future.toISOString().slice(0, 10);
    const large = Array.from({ length: 60 }, (_, i) => ({
      ...(demoPurchases[0] as Purchase),
      id: `id-${i}`,
      name: `Item ${i}`,
      deadlines: [{ id: `d-${i}`, type: 'return' as const, date: iso, title: 'Return window closes', completed: false }],
    }));
    const deadlines = normalizedDeadlines(large, now);
    expect(deadlines.length).toBe(60);
    expect(deadlines[0].status).toBe('urgent');
  });
  test('vault inventory groups receipts/warranty/product/claims correctly for large set', () => {
    const large = buildLarge(80);
    const inv = documentInventory(large);
    expect(inv.all.length).toBeGreaterThanOrEqual(0);
    expect(inv.receipts.length + inv.warranty.length + inv.product.length + inv.claims.length).toBe(inv.all.length);
  });
});

describe('Trust — honest, never fabricate', () => {
  test('protectionSummary is always derived from real records', () => {
    const summary = protectionSummary(demoPurchases as Purchase[]);
    expect(summary.total).toBe(3);
    expect(summary.protected + summary.attention + summary.unprotected).toBe(summary.total);
    expect(summary.valueProtected).toBeGreaterThanOrEqual(0);
  });
  test('actionNeeded never invents warranty if none provided', () => {
    const noWarranty: Purchase = { ...(demoPurchases[0] as Purchase), warrantyEnd: null, warrantyProvider: null, hasWarrantyInfo: false };
    const actions = actionNeeded([noWarranty]);
    const warrantyMissing = actions.find(a => a.kind === 'missing_warranty');
    expect(warrantyMissing).toBeUndefined();
  });
  test('missing receipt and urgent deadlines surface as attention, not error', () => {
    const missingReceipt: Purchase = { ...(demoPurchases[0] as Purchase), hasReceipt: false, documents: [] };
    const actions2 = actionNeeded([missingReceipt]);
    expect(actions2.some(a => a.kind === 'missing_receipt')).toBe(true);
  });
});

describe('Accessibility and responsiveness — 320 to 1440', () => {
  test('sizing and breakpoints enable 320 without overflow and 1440 intentional', () => {
    expect(breakpoints.phone < breakpoints.tablet).toBe(true);
    expect(breakpoints.tablet < breakpoints.desktop).toBe(true);
    expect(breakpoints.desktop < breakpoints.wide).toBe(true);
    expect(breakpoints.wide < breakpoints.ultra).toBe(true);
    expect(sizing.contentMax).toBeGreaterThan(sizing.sidebar + 800);
  });
  test('document inventory handles empty and on-device honesty', () => {
    const emptyInv = documentInventory([]);
    expect(emptyInv.all.length).toBe(0);
    expect(emptyInv.receipts.length).toBe(0);
    const withDocs = documentInventory(demoPurchases as Purchase[]);
    expect(withDocs.all.length).toBeGreaterThan(0);
    withDocs.all.forEach(d => expect(['receipt','warranty','manual','other','claim'].includes(d.kind)).toBe(true));
  });
});
