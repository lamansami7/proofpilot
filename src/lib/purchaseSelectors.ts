import { daysUntil } from './deadlines';
import { addCalendarDays, isValidIsoDate, isoDate } from './date';
import type { ActionNeeded, DeadlineStatus, DeadlineType, DocumentKind, Purchase, PurchaseDeadline, ProtectionStatus } from '../types/purchase';

export type NormalizedDeadline = PurchaseDeadline & { purchase: Purchase; days: number; status: DeadlineStatus };
export type DeadlineGroup = 'overdue' | 'today' | 'week' | 'month' | 'later';
export const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const formatMoney = (value: number | null) => value === null ? 'Price not added' : currency.format(value);
export const formatDate = (date: string | null) => date ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T12:00:00`)) : 'Not added';
export const formatDateShort = (date: string | null) => date ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`)) : '—';
export const protectionLabel = (status: ProtectionStatus) => status === 'protected' ? 'Protected' : status === 'attention' ? 'Needs attention' : 'Protection incomplete';
export const deadlineTypeLabel = (type: DeadlineType) => ({ return: 'Return deadline', warranty: 'Warranty expiration', rebate: 'Rebate deadline', custom: 'Custom deadline' })[type];
export const documentKindLabel = (kind: DocumentKind) => ({ receipt: 'Receipt', warranty: 'Warranty document', manual: 'Product document', claim: 'Claim draft', other: 'Document' })[kind];

export type CoverageState = 'unknown' | 'active' | 'expired';
export type ProtectionDetails = { returnState: CoverageState; warrantyState: CoverageState; hasEvidence: boolean };

export function protectionDetails(input: { returnDeadline: string | null; warrantyEnd: string | null; hasReceipt: boolean }, now = new Date()): ProtectionDetails {
  const stateFor = (date: string | null): CoverageState => !date ? 'unknown' : daysUntil(date, now) < 0 ? 'expired' : 'active';
  return { returnState: stateFor(input.returnDeadline), warrantyState: stateFor(input.warrantyEnd), hasEvidence: input.hasReceipt };
}

/** Protection means an active recorded window with proof of purchase. Expired/unknown coverage is not presented as active protection. */
export function deriveProtection(input: { returnDeadline: string | null; warrantyEnd: string | null; hasReceipt: boolean }, now = new Date()): ProtectionStatus {
  const details = protectionDetails(input, now);
  const active = details.returnState === 'active' || details.warrantyState === 'active';
  if (!active) return 'unprotected';
  return input.hasReceipt ? 'protected' : 'attention';
}

export function deadlineStatus(date: string | null, now = new Date()): { days: number; status: DeadlineStatus } | null { if (!date) return null; const days = daysUntil(date, now); return { days, status: days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'urgent' : days <= 31 ? 'upcoming' : 'later' }; }
export function normalizedDeadlines(items: Purchase[], now = new Date()): NormalizedDeadline[] { return items.flatMap((purchase) => purchase.deadlines.map((deadline) => { const status = deadlineStatus(deadline.date, now); return { ...deadline, purchase, days: status!.days, status: status!.status }; })).sort((a, b) => a.days - b.days || a.purchase.name.localeCompare(b.purchase.name)); }
export function deadlineGroup(deadline: NormalizedDeadline, now = new Date()): DeadlineGroup {
  if (deadline.status === 'overdue') return 'overdue';
  if (deadline.status === 'today') return 'today';
  if (deadline.days <= 7) return 'week';
  const target = new Date(`${deadline.date}T12:00:00`);
  return target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth() ? 'month' : 'later';
}
export function groupDeadlines(items: NormalizedDeadline[], now = new Date()): Record<DeadlineGroup, NormalizedDeadline[]> { return items.reduce<Record<DeadlineGroup, NormalizedDeadline[]>>((groups, item) => { groups[deadlineGroup(item, now)].push(item); return groups; }, { overdue: [], today: [], week: [], month: [], later: [] }); }
export function protectedPurchaseCount(items: Purchase[]) { return items.filter((item) => item.protectionStatus !== 'unprotected').length; }
export function protectedValue(items: Purchase[]) { return items.filter((item) => item.protectionStatus !== 'unprotected').reduce((total, item) => total + (item.price ?? 0), 0); }
export function upcomingDeadlines(items: Purchase[], now = new Date()) { return normalizedDeadlines(items, now).filter((deadline) => deadline.days >= 0); }
export function urgentDeadlines(items: Purchase[], now = new Date()) { return normalizedDeadlines(items, now).filter((deadline) => deadline.status === 'today' || deadline.status === 'urgent'); }
export function recentPurchases(items: Purchase[]) { return [...items].sort((a, b) => (b.purchaseDate ?? '').localeCompare(a.purchaseDate ?? '')); }
export function nextDeadlineFor(purchase: Purchase, now = new Date()): NormalizedDeadline | null {
  const live = purchase.deadlines.map((deadline) => { const status = deadlineStatus(deadline.date, now); return status ? { ...deadline, purchase, days: status.days, status: status.status } : null; }).filter((deadline): deadline is NormalizedDeadline => Boolean(deadline));
  return live.sort((a, b) => a.days - b.days)[0] ?? null;
}

export type ProtectionSummary = { total: number; protected: number; attention: number; unprotected: number; missingReceipts: number; missingWarrantyInfo: number; valueProtected: number };
export function protectionSummary(items: Purchase[]): ProtectionSummary {
  return {
    total: items.length,
    protected: items.filter((item) => item.protectionStatus === 'protected').length,
    attention: items.filter((item) => item.protectionStatus === 'attention').length,
    unprotected: items.filter((item) => item.protectionStatus === 'unprotected').length,
    missingReceipts: items.filter((item) => !item.hasReceipt).length,
    missingWarrantyInfo: items.filter((item) => !item.hasWarrantyInfo).length,
    valueProtected: protectedValue(items),
  };
}

export type IndexedDocument = Purchase['documents'][number] & { purchase: Purchase };
export type DocumentInventory = { all: IndexedDocument[]; receipts: IndexedDocument[]; warranty: IndexedDocument[]; product: IndexedDocument[]; claims: IndexedDocument[] };
export function documentInventory(items: Purchase[]): DocumentInventory {
  const all: IndexedDocument[] = items.flatMap((purchase) => purchase.documents.map((document) => ({ ...document, purchase })));
  const by = (kind: DocumentKind[]) => all.filter((document) => kind.includes(document.kind));
  return { all, receipts: by(['receipt']), warranty: by(['warranty']), product: by(['manual', 'other']), claims: by(['claim']) };
}

export function actionNeeded(items: Purchase[], now = new Date()): ActionNeeded[] {
  const deadlines = normalizedDeadlines(items, now).filter((deadline) => deadline.status === 'overdue' || deadline.status === 'today' || deadline.status === 'urgent').map((deadline) => ({ id: deadline.id, kind: 'deadline' as const, purchase: deadline.purchase, title: deadlineTypeLabel(deadline.type), description: `${deadline.purchase.merchant} · ${formatDate(deadline.date)}`, actionLabel: 'Review', date: deadline.date }));
  const missing: ActionNeeded[] = [];
  items.forEach((purchase) => {
    if (!purchase.hasReceipt) missing.push({ id: `receipt-${purchase.id}`, kind: 'missing_receipt', purchase, title: 'Receipt missing', description: `${purchase.merchant} · Add proof of purchase`, actionLabel: 'Add receipt' });
    // An unknown warranty is not inherently a problem: many purchases have none.
    // Only surface missing warranty detail when the record already indicates warranty coverage.
    if (purchase.warrantyProvider && !purchase.warrantyEnd) missing.push({ id: `warranty-${purchase.id}`, kind: 'missing_warranty', purchase, title: 'Warranty expiration missing', description: `${purchase.merchant} · Add the coverage end date`, actionLabel: 'Add details' });
  });
  return [...deadlines, ...missing];
}

export function greeting(now = new Date()): string { const hour = now.getHours(); return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'; }
export function todayLine(now = new Date()): string { return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(now); }
export function initialsFor(email: string | null | undefined): string {
  if (!email) return 'PP';
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._\-+]/).filter(Boolean);
  const letters = parts.length >= 2 ? parts.slice(0, 2).map((part) => part[0]).join('') : local.slice(0, 2);
  return letters.toUpperCase() || 'PP';
}
export { isValidIsoDate, isoDate };
export function isoDaysFrom(baseIso: string | null, daysToAdd: number, now = new Date()): string { return addCalendarDays(baseIso, daysToAdd, now); }

export function purchaseSearchText(item: Purchase): string {
  return [item.name, item.merchant, item.category, item.notes, item.serial, item.model, item.warrantyProvider,
    item.returnDeadline ? `return return deadline ${item.returnDeadline}` : null,
    item.warrantyEnd ? `warranty warranty expiration ${item.warrantyEnd}` : null,
    ...item.documents.flatMap((document) => [document.name, documentKindLabel(document.kind)]),
    ...item.deadlines.flatMap((deadline) => [deadline.title, deadlineTypeLabel(deadline.type), deadline.date]),
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}
export function matchesPurchaseSearch(item: Purchase, query: string): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const haystack = purchaseSearchText(item);
  return terms.every((term) => haystack.includes(term));
}
