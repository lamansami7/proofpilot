import type { DeadlineType, DocumentKind, FeatherIconName, Purchase, PurchaseDeadline, PurchaseDocument } from '../types/purchase';
import { deriveProtection, isValidIsoDate } from './purchaseSelectors';

const kinds: DocumentKind[] = ['receipt', 'warranty', 'manual', 'claim', 'other'];
const deadlineTypes: DeadlineType[] = ['return', 'warranty', 'rebate', 'custom'];
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const nullableText = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;
const validDate = (value: unknown) => typeof value === 'string' && isValidIsoDate(value) ? value : null;

function migrateDocument(value: unknown, index: number): PurchaseDocument | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const kind = kinds.includes(row.kind as DocumentKind) ? row.kind as DocumentKind : 'other';
  return { id: text(row.id, `document-${index}`), name: text(row.name, 'Untitled document'), kind, mimeType: nullableText(row.mimeType), uri: nullableText(row.uri), content: nullableText(row.content), addedAt: validDate(row.addedAt) };
}
function migrateDeadline(value: unknown, index: number): PurchaseDeadline | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const date = validDate(row.date);
  if (!date) return null;
  const type = deadlineTypes.includes(row.type as DeadlineType) ? row.type as DeadlineType : 'custom';
  return { id: text(row.id, `deadline-${index}`), type, date, completed: row.completed === true, title: text(row.title, type === 'rebate' ? 'Rebate deadline' : 'Custom deadline') };
}

/** Defensive migration for persisted records from earlier app versions. */
export function migratePurchase(value: unknown, index = 0): Purchase | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const name = text(row.name).trim();
  if (!name) return null;
  const rawDocuments = Array.isArray(row.documents) ? row.documents : [];
  const documents = rawDocuments.map(migrateDocument).filter((item): item is PurchaseDocument => Boolean(item));
  const returnDeadline = validDate(row.returnDeadline);
  const warrantyEnd = validDate(row.warrantyEnd);
  const hasReceipt = documents.some((document) => document.kind === 'receipt');
  const deadlines = (Array.isArray(row.deadlines) ? row.deadlines : []).map(migrateDeadline).filter((item): item is PurchaseDeadline => Boolean(item));
  return {
    id: typeof row.id === 'string' || typeof row.id === 'number' ? row.id : `migrated-${index}`,
    name,
    merchant: text(row.merchant, 'Merchant not added'),
    price: typeof row.price === 'number' && Number.isFinite(row.price) ? row.price : null,
    purchaseDate: validDate(row.purchaseDate), category: text(row.category, 'Other'),
    icon: text(row.icon, 'package') as FeatherIconName, tint: text(row.tint, '#E7EDFF'),
    protectionStatus: deriveProtection({ returnDeadline, warrantyEnd, hasReceipt }),
    warrantyEnd, warrantyProvider: nullableText(row.warrantyProvider), returnDeadline,
    pinned: row.pinned === true,
    serial: nullableText(row.serial), model: nullableText(row.model), hasReceipt,
    hasWarrantyInfo: Boolean(warrantyEnd || nullableText(row.warrantyProvider)), notes: nullableText(row.notes), documents,
    deadlines,
  };
}
export function migratePurchases(value: unknown): Purchase[] {
  return Array.isArray(value) ? value.map(migratePurchase).filter((item): item is Purchase => Boolean(item)) : [];
}
