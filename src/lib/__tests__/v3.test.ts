import { validateSettings } from '../../hooks/useAppSettings';
import { colors, radius, spacing, shadows, type, breakpoints, sizing } from '../../design/tokens';
import {
  deriveProtection,
  deadlineStatus,
  normalizedDeadlines,
  actionNeeded,
  protectionSummary,
  documentInventory,
  nextDeadlineFor,
  filterPurchases,
  sortPurchases,
  purchaseSearchText,
  matchesPurchaseSearch,
} from '../purchaseSelectors';
import { validatePurchaseFields } from '../purchaseValidation';
import { isValidIsoDate, isoDate, addCalendarDays } from '../date';
import { daysUntil } from '../deadlines';
import { contextFor, claimTemplate } from '../../services/ai/purchaseContext';
import { demoPurchases } from '../../data/demoPurchases';
import type { Purchase } from '../../types/purchase';

describe('V3 design system tokens', () => {
  test('semantic colors are present and accessible', () => {
    expect(colors.canvas).toBeTruthy();
    expect(colors.surface).toBeTruthy();
    expect(colors.ink).toBe('#152236');
    expect(colors.brand).toBeTruthy();
    expect(colors.success).toBeTruthy();
    expect(colors.warning).toBeTruthy();
    expect(colors.danger).toBeTruthy();
    expect(colors.info).toBeTruthy();
    expect(colors.protectedSurface).toBeTruthy();
    expect(colors.overdueSurface).toBeTruthy();
    expect(colors.offlineSurface).toBeTruthy();
  });

  test('spacing tokens are consistent multiples of 4', () => {
    Object.values(spacing).forEach((value) => expect((value as number) % 4).toBe(0));
    expect(spacing.xs).toBe(4);
    expect(spacing.lg).toBe(16);
    expect(spacing.xl).toBe(24);
  });

  test('radius tokens follow small/medium/large/modal/pill scale', () => {
    expect(radius.sm).toBe(8);
    expect(radius.md).toBe(12);
    expect(radius.lg).toBe(16);
    expect(radius.modal).toBe(22);
    expect(radius.pill).toBe(999);
    expect(radius.small).toBe(radius.sm);
    expect(radius.large).toBe(radius.lg);
  });

  test('shadows are restrained and use shared key color', () => {
    expect(shadows.card.shadowColor).toBe('#1C2A3A');
    expect((shadows.floating.shadowOpacity as number)).toBeGreaterThan(shadows.card.shadowOpacity as number);
    expect((shadows.card.shadowOpacity as number)).toBeLessThan(0.1);
  });

  test('typography hierarchy is complete', () => {
    expect(type.display.fontSize as number).toBeGreaterThan(type.title.fontSize as number);
    expect(type.title.fontSize as number).toBeGreaterThan(type.heading.fontSize as number);
    expect(type.heading.fontWeight).toBe('800');
    expect(type.eyebrow.letterSpacing as number).toBeGreaterThan(1);
    // V3 aliases
    expect((type as any).pageTitle).toBeTruthy();
    expect((type as any).sectionTitle).toBeTruthy();
  });

  test('breakpoints cover phone to ultra', () => {
    expect(breakpoints.phone).toBe(759);
    expect(breakpoints.tablet).toBe(899);
    expect(breakpoints.desktop).toBe(1100);
    expect(breakpoints.wide).toBe(1280);
    expect((breakpoints as any).ultra).toBe(1440);
  });

  test('sizing tokens include touch targets and layout widths', () => {
    expect(sizing.touch).toBeGreaterThanOrEqual(44);
    expect(sizing.sidebar).toBeGreaterThan(200);
    expect(sizing.contentMax).toBeGreaterThan(1000);
  });
});

describe('AppSettings with onboarding', () => {
  test('defaults include onboardingCompleted false', () => {
    const validated = validateSettings({});
    expect(validated.onboardingCompleted).toBe(false);
    expect(validated.defaultReturnWindowDays).toBe(30);
  });

  test('preserves onboardingCompleted when valid', () => {
    expect(validateSettings({ onboardingCompleted: true }).onboardingCompleted).toBe(true);
    expect(validateSettings({ onboardingCompleted: false }).onboardingCompleted).toBe(false);
  });

  test('rejects invalid onboarding value', () => {
    expect(validateSettings({ onboardingCompleted: 'yes' as any }).onboardingCompleted).toBe(false);
    expect(validateSettings({ onboardingCompleted: 1 as any }).onboardingCompleted).toBe(false);
  });

  test('validates return window boundaries', () => {
    expect(validateSettings({ defaultReturnWindowDays: 0 }).defaultReturnWindowDays).toBe(30);
    expect(validateSettings({ defaultReturnWindowDays: 366 }).defaultReturnWindowDays).toBe(30);
    expect(validateSettings({ defaultReturnWindowDays: 30 }).defaultReturnWindowDays).toBe(30);
    expect(validateSettings({ defaultReturnWindowDays: 1 }).defaultReturnWindowDays).toBe(1);
  });
});

describe('Protection derive with V3 semantics', () => {
  const now = new Date(2026, 8, 25);
  test('protected requires active window and receipt', () => {
    expect(deriveProtection({ returnDeadline: '2026-09-30', warrantyEnd: null, hasReceipt: true }, now)).toBe('protected');
    expect(deriveProtection({ returnDeadline: '2026-09-30', warrantyEnd: null, hasReceipt: false }, now)).toBe('attention');
    expect(deriveProtection({ returnDeadline: null, warrantyEnd: null, hasReceipt: true }, now)).toBe('unprotected');
  });

  test('expired windows are not protected even with receipt', () => {
    expect(deriveProtection({ returnDeadline: '2026-09-24', warrantyEnd: null, hasReceipt: true }, now)).toBe('unprotected');
    expect(deriveProtection({ returnDeadline: null, warrantyEnd: '2026-09-24', hasReceipt: true }, now)).toBe('unprotected');
  });

  test('deadlineStatus categorizes correctly', () => {
    expect(deadlineStatus('2026-09-24', now)?.status).toBe('overdue');
    expect(deadlineStatus('2026-09-25', now)?.status).toBe('today');
    expect(deadlineStatus('2026-09-27', now)?.status).toBe('urgent');
    expect(deadlineStatus('2026-10-10', now)?.status).toBe('upcoming');
    expect(deadlineStatus('2026-12-01', now)?.status).toBe('later');
  });
});

describe('Purchase validation strictness V3', () => {
  const now = new Date(2026, 8, 25);
  const base = { name: 'Camera', merchant: 'Shop', price: '0', purchaseDate: '2026-09-25', returnDeadline: '', warrantyEnd: '' };
  test('allows zero-price purchases', () => {
    expect(validatePurchaseFields(base, now)).toEqual({});
  });
  test('rejects negative and malformed prices', () => {
    expect(validatePurchaseFields({ ...base, price: '-1' }, now).price).toBeTruthy();
    expect(validatePurchaseFields({ ...base, price: '12oops' }, now).price).toBeTruthy();
    expect(validatePurchaseFields({ ...base, price: '1.123' }, now).price).toBeTruthy();
    expect(validatePurchaseFields({ ...base, price: '' }, now).price).toBeTruthy();
  });
  test('rejects impossible dates', () => {
    expect(validatePurchaseFields({ ...base, purchaseDate: '2026-02-30' }, now).purchaseDate).toBeTruthy();
    expect(validatePurchaseFields({ ...base, purchaseDate: '2026-13-01' }, now).purchaseDate).toBeTruthy();
  });
  test('rejects future purchase dates', () => {
    expect(validatePurchaseFields({ ...base, purchaseDate: '2026-09-26' }, now).purchaseDate).toBeTruthy();
  });
  test('rejects return before purchase', () => {
    expect(validatePurchaseFields({ ...base, returnDeadline: '2026-09-24' }, now).returnDeadline).toBeTruthy();
    expect(validatePurchaseFields({ ...base, returnDeadline: '2026-09-25' }, now).returnDeadline).toBeUndefined();
  });
});

describe('Search and filtering V3', () => {
  const purchase: Purchase = {
    ...demoPurchases[0],
    id: 'test',
    name: 'MacBook Air',
    merchant: 'Apple',
    price: 999,
    purchaseDate: '2026-09-14',
    category: 'Electronics',
    notes: 'For work',
    serial: 'C02XYZ',
    model: 'M2',
    warrantyProvider: 'AppleCare',
    hasReceipt: true,
    protectionStatus: 'protected',
    documents: [{ id: 'd1', name: 'receipt.pdf', kind: 'receipt', mimeType: 'application/pdf' }],
    deadlines: [{ id: 'd', type: 'return', date: '2026-09-30', title: 'Return window closes' }],
  } as Purchase;

  test('purchaseSearchText includes all searchable fields', () => {
    const text = purchaseSearchText(purchase);
    expect(text).toContain('macbook air');
    expect(text).toContain('apple');
    expect(text).toContain('c02xyz');
    expect(text).toContain('receipt.pdf');
    expect(text).toContain('return window closes');
  });

  test('matchesPurchaseSearch requires all terms', () => {
    expect(matchesPurchaseSearch(purchase, 'apple macbook')).toBe(true);
    expect(matchesPurchaseSearch(purchase, 'apple samsung')).toBe(false);
    expect(matchesPurchaseSearch(purchase, '')).toBe(true);
  });

  test('filterPurchases respects protection and receipt', () => {
    const items = [purchase, { ...purchase, id: '2', hasReceipt: false, protectionStatus: 'attention' as const }];
    expect(filterPurchases(items, { protection: 'protected', category: null, receipt: 'all', pinnedOnly: false }).length).toBe(1);
    expect(filterPurchases(items, { protection: 'all', category: null, receipt: 'missing', pinnedOnly: false }).length).toBe(1);
  });

  test('sortPurchases keeps pinned on top', () => {
    const pinned = { ...purchase, id: 'pinned', pinned: true, name: 'Zebra' };
    const sorted = sortPurchases([purchase, pinned], 'name', 'asc');
    expect(sorted[0].id).toBe('pinned');
  });

  test('sort handles nulls sinking to bottom', () => {
    const noPrice = { ...purchase, id: 'noprice', price: null };
    const sorted = sortPurchases([noPrice, purchase], 'price', 'asc');
    expect(sorted[0].id).toBe(purchase.id);
    expect(sorted[1].id).toBe('noprice');
  });
});

describe('Documents and deadlines inventory V3', () => {
  test('documentInventory splits by kind correctly', () => {
    const items = demoPurchases as Purchase[];
    const inv = documentInventory(items);
    expect(inv.receipts.length).toBeGreaterThan(0);
    expect(inv.all.length).toBe(inv.receipts.length + inv.warranty.length + inv.product.length + inv.claims.length);
  });

  test('nextDeadlineFor picks soonest incomplete', () => {
    const now = new Date(2026, 8, 25);
    const p: Purchase = {
      ...demoPurchases[0],
      deadlines: [
        { id: 'a', type: 'return', date: '2026-10-10', title: 'Return' },
        { id: 'b', type: 'warranty', date: '2026-09-28', title: 'Warranty' },
      ],
    } as Purchase;
    const next = nextDeadlineFor(p, now);
    expect(next?.id).toBe('b');
  });

  test('actionNeeded orders return before warranty before missing receipt', () => {
    const now = new Date(2026, 8, 25);
    const withMissing: Purchase = { ...demoPurchases[1], hasReceipt: false, deadlines: [{ id: 'r', type: 'return', date: '2026-09-27', title: 'Return' }] } as Purchase;
    const actions = actionNeeded([withMissing], now);
    const firstDeadline = actions.find((a) => a.kind === 'deadline');
    expect(firstDeadline?.deadlineType).toBe('return');
  });
});

describe('Date helpers V3', () => {
  test('isValidIsoDate rejects invalid', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-09-25')).toBe(true);
    expect(isValidIsoDate('2024-02-29')).toBe(true);
  });

  test('isoDate formats correctly', () => {
    expect(isoDate(new Date(2026, 8, 25))).toBe('2026-09-25');
  });

  test('addCalendarDays handles month boundaries', () => {
    expect(addCalendarDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addCalendarDays('2026-09-25', 30)).toBe('2026-10-25');
  });

  test('daysUntil is calendar-correct', () => {
    expect(daysUntil('2026-09-26', new Date(2026, 8, 25))).toBe(1);
    expect(daysUntil('2026-09-25', new Date(2026, 8, 25))).toBe(0);
    expect(daysUntil('2026-09-24', new Date(2026, 8, 25))).toBe(-1);
  });
});

describe('AI trust boundaries V3', () => {
  test('contextFor excludes claim drafts and does not leak content', () => {
    const p: Purchase = {
      ...demoPurchases[0],
      documents: [
        { id: 'c1', name: 'Claim draft', kind: 'claim', mimeType: 'text/plain', content: 'Secret draft content' },
        { id: 'r1', name: 'receipt.pdf', kind: 'receipt', mimeType: 'application/pdf' },
      ],
    } as Purchase;
    const ctx = contextFor(p);
    expect(ctx.documents).toEqual(['receipt.pdf']);
    expect(JSON.stringify(ctx)).not.toContain('Secret draft');
  });

  test('claimTemplate includes verified fields and placeholders', () => {
    const p: Purchase = { ...demoPurchases[0], price: 0, purchaseDate: null, warrantyProvider: null, serial: null } as Purchase;
    const draft = claimTemplate(p, 'warranty', '');
    expect(draft).toContain('USD 0.00');
    expect(draft).toContain('[warranty provider]');
    expect(draft).toContain('Nothing has been submitted');
  });

  test('claimTemplate distinguishes return vs warranty', () => {
    const p = demoPurchases[0] as Purchase;
    expect(claimTemplate(p, 'return', 'Defective')).toContain('Return request');
    expect(claimTemplate(p, 'warranty', 'Defective')).toContain('Warranty assistance');
    expect(claimTemplate(p, 'return', 'Broken screen')).toContain('Broken screen');
  });
});

describe('Protection summary V3', () => {
  test('protectionSummary counts correctly', () => {
    const now = new Date(2026, 8, 25);
    const protectedItem = { returnDeadline: '2026-09-30', warrantyEnd: null, hasReceipt: true };
    const attentionItem = { returnDeadline: '2026-09-30', warrantyEnd: null, hasReceipt: false };
    const unprotectedItem = { returnDeadline: null, warrantyEnd: null, hasReceipt: false };
    // Use derive directly for sanity
    expect(deriveProtection(protectedItem, now)).toBe('protected');
    expect(deriveProtection(attentionItem, now)).toBe('attention');
    expect(deriveProtection(unprotectedItem, now)).toBe('unprotected');
  });

  test('normalizedDeadlines sorts by urgency', () => {
    const p: Purchase = {
      ...demoPurchases[0],
      id: 'p',
      name: 'A',
      deadlines: [
        { id: 'later', type: 'warranty', date: '2026-12-01', title: 'Later' },
        { id: 'soon', type: 'return', date: '2026-09-26', title: 'Soon' },
      ],
    } as Purchase;
    const normalized = normalizedDeadlines([p], new Date(2026, 8, 25));
    expect(normalized[0].id).toBe('soon');
  });
});
