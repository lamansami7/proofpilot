import { daysUntil } from './deadlines';
import { attentionPriority, deadlineStatus, deadlineTypeLabel, deriveProtection, formatDate, isValidIsoDate } from './purchaseSelectors';
import type { ActionNeeded, Purchase, PurchaseDeadline } from '../types/purchase';
import type { IndexedDocument, NormalizedDeadline, ProtectionSummary } from './purchaseSelectors';

/**
 * One pass over the purchase list produces every number the home screen shows.
 *
 * The dashboard previously called protectionSummary(), actionNeeded(),
 * upcomingDeadlines(), documentInventory(), expiringWarranties(),
 * missingProofCount(), completedDeadlineCount() and recentPurchases()
 * independently. Each re-derived protection status and re-parsed every deadline,
 * so one render of a 2,000-item library performed ~86,000 date computations.
 * Here each purchase is normalized exactly once and every consumer reads from
 * that result. Values are identical to the individual selectors — the
 * equivalence is asserted in the tests.
 */

export type DashboardModel = {
  summary: ProtectionSummary;
  /** Incomplete deadlines from today onward, soonest first. */
  upcoming: NormalizedDeadline[];
  /** Urgent/overdue/missing-proof work, already ordered by attentionPriority. */
  actions: ActionNeeded[];
  /** Every live deadline for every purchase, soonest first. */
  deadlines: NormalizedDeadline[];
  documents: { all: IndexedDocument[]; receipts: IndexedDocument[]; warranty: IndexedDocument[]; product: IndexedDocument[]; claims: IndexedDocument[] };
  recent: Purchase[];
  expiringWarranties: Purchase[];
  completedCount: number;
  /** Purchases with neither a receipt nor any document. */
  noFiles: number;
  /** Incomplete deadlines inside 30 days. */
  upcomingWithin30: number;
};

const EMPTY_DOCUMENTS: DashboardModel['documents'] = { all: [], receipts: [], warranty: [], product: [], claims: [] };

/** Returns null for a missing or corrupt stored date, so it is never displayed as a real one. */
function normalizeDeadline(deadline: PurchaseDeadline, purchase: Purchase, now: Date): NormalizedDeadline | null {
  if (!isValidIsoDate(deadline.date)) return null;
  const status = deadlineStatus(deadline.date, now);
  return status ? { ...deadline, purchase, days: status.days, status: status.status } : null;
}

export function buildDashboardModel(items: Purchase[], now = new Date()): DashboardModel {
  const summary: ProtectionSummary = { total: items.length, protected: 0, attention: 0, unprotected: 0, missingReceipts: 0, missingWarrantyInfo: 0, valueProtected: 0 };
  const deadlines: NormalizedDeadline[] = [];
  const upcoming: NormalizedDeadline[] = [];
  const actions: ActionNeeded[] = [];
  const expiringWarranties: Purchase[] = [];
  const all: IndexedDocument[] = [];
  let completedCount = 0;
  let noFiles = 0;

  for (const purchase of items) {
    // Protection is derived once and reused by the summary, the value total and
    // the "needs attention" list.
    const status = deriveProtection(purchase, now);
    if (status === 'protected') { summary.protected++; summary.valueProtected += purchase.price ?? 0; }
    else if (status === 'attention') summary.attention++;
    else summary.unprotected++;
    if (!purchase.hasReceipt) summary.missingReceipts++;
    if (!purchase.hasWarrantyInfo) summary.missingWarrantyInfo++;
    if (!purchase.hasReceipt && purchase.documents.length === 0) noFiles++;

    for (const deadline of purchase.deadlines) {
      if (deadline.completed) { completedCount++; continue; }
      // An unparseable stored date is skipped rather than shown as a real one.
      const parsed = normalizeDeadline(deadline, purchase, now);
      if (!parsed) continue;
      deadlines.push(parsed);
      if (parsed.days < 0 || parsed.status === 'today' || parsed.status === 'urgent') {
        actions.push({ id: parsed.id, kind: 'deadline', purchase, title: deadlineTypeLabel(parsed.type), description: `${purchase.merchant} · ${formatDate(parsed.date)}`, actionLabel: 'Review', date: parsed.date, deadlineType: parsed.type, days: parsed.days });
      }
      if (parsed.days >= 0) upcoming.push(parsed);
    }

    if (purchase.warrantyEnd) {
      const days = daysUntil(purchase.warrantyEnd, now);
      if (days >= 0 && days <= 30) expiringWarranties.push(purchase);
    }
    if (!purchase.hasReceipt) {
      actions.push({ id: `receipt-${purchase.id}`, kind: 'missing_receipt', purchase, title: 'Receipt missing', description: `${purchase.merchant} · Add proof of purchase`, actionLabel: 'Add receipt' });
    }
    // An unknown warranty is not inherently a problem: many purchases have none.
    // Only surface missing warranty detail when the record already indicates coverage.
    if (purchase.warrantyProvider && !purchase.warrantyEnd) {
      actions.push({ id: `warranty-${purchase.id}`, kind: 'missing_warranty', purchase, title: 'Warranty expiration missing', description: `${purchase.merchant} · Add the coverage end date`, actionLabel: 'Add details' });
    }
    for (const document of purchase.documents) all.push({ ...document, purchase });
  }

  const byDate = (a: NormalizedDeadline, b: NormalizedDeadline) => a.days - b.days || a.purchase.name.localeCompare(b.purchase.name);
  deadlines.sort(byDate);
  upcoming.sort(byDate);
    actions.sort((a, b) => attentionPriority(a) - attentionPriority(b) || a.purchase.name.localeCompare(b.purchase.name));

  const by = (kind: IndexedDocument['kind'][]) => all.filter((document) => kind.includes(document.kind));
  return {
    summary,
    upcoming,
    actions,
    deadlines,
    documents: all.length
      ? { all, receipts: by(['receipt']), warranty: by(['warranty']), product: by(['manual', 'other']), claims: by(['claim']) }
      : EMPTY_DOCUMENTS,
    recent: [...items].sort((a, b) => (b.purchaseDate ?? '').localeCompare(a.purchaseDate ?? '')),
    expiringWarranties,
    completedCount,
    noFiles,
    upcomingWithin30: upcoming.filter((deadline) => deadline.days <= 30).length,
  };
}

// Re-exported so the dashboard and its tests share one ordering rule with the
// rest of the app rather than keeping a second copy that can drift.
export { attentionPriority as priority, attentionPriority };
