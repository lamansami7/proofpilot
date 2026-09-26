import { APP_VERSION } from '../design/tokens';
import type { Purchase } from '../types/purchase';
import { isValidIsoDate, isoDate } from './date';
import { migratePurchase } from './purchaseMigration';

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export function createBackup(purchases: Purchase[]) {
  return {
    schemaVersion: 1, appVersion: APP_VERSION, exportedAt: new Date().toISOString(),
    documentsIncluded: 'metadata-and-inline-claim-text-only',
    purchases: purchases.map(p => ({ ...p, documents: p.documents.map(({ uri: _uri, ...d }) => d) })),
  };
}
function fail(): never { throw new Error('Invalid backup. Nothing was restored. Use a ProofPilot schema version 1 JSON export.'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function text(value: unknown, required = false) {
  if (typeof value !== 'string' || value.length > 100000 || (required && !value.trim())) fail();
}
function date(value: unknown) { if (value !== null && (typeof value !== 'string' || !isValidIsoDate(value))) fail(); }
function uniqueIds(rows: unknown[]) {
  const ids = new Set<string>();
  for (const value of rows) {
    const { id } = object(value);
    if ((typeof id !== 'string' && typeof id !== 'number') || !String(id).trim() || String(id).length > 200 || (typeof id === 'number' && !Number.isSafeInteger(id))) fail();
    if (ids.has(String(id))) fail();
    ids.add(String(id));
  }
}
/** Strict boundary, unlike tolerant legacy-storage migration. Never trust imported URIs. */
export function parseBackup(raw: string): Purchase[] {
  // Hermes versions do not all provide TextEncoder. Count UTF-8 without a native dependency.
  let bytes = 0;
  for (const character of raw) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > MAX_BACKUP_BYTES) fail();
  }
  let input: Record<string, unknown>;
  try { input = object(JSON.parse(raw)); } catch { return fail(); }
  if (input.schemaVersion !== 1 || typeof input.appVersion !== 'string' || typeof input.exportedAt !== 'string' || !Number.isFinite(Date.parse(input.exportedAt)) || !Array.isArray(input.purchases) || input.purchases.length > 5000) fail();
  uniqueIds(input.purchases);
  return input.purchases.map(value => {
    const p = object(value);
    text(p.name, true); text(p.merchant, true); text(p.category, true);
    for (const key of ['notes', 'serial', 'model', 'warrantyProvider']) if (p[key] !== null) text(p[key]);
    if (p.price !== null && (typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price < 0 || p.price > 9999999999.99 || Math.abs(p.price * 100 - Math.round(p.price * 100)) > 0.001)) fail();
    for (const key of ['purchaseDate', 'returnDeadline', 'warrantyEnd']) date(p[key]);
    if (typeof p.purchaseDate === 'string') {
      if (p.purchaseDate > isoDate(new Date())) fail();
      for (const key of ['returnDeadline', 'warrantyEnd']) { const value = p[key]; if (typeof value === 'string' && value < p.purchaseDate) fail(); }
    }
    if (!Array.isArray(p.documents) || !Array.isArray(p.deadlines) || p.documents.length > 1000 || p.deadlines.length > 1000) fail();
    uniqueIds(p.documents); uniqueIds(p.deadlines);
    for (const value of p.documents) {
      const d = object(value); text(d.name, true);
      if (!['receipt', 'warranty', 'manual', 'claim', 'other'].includes(String(d.kind))) fail();
      if (d.mimeType !== null) text(d.mimeType);
      if (d.content != null) text(d.content);
      if (d.addedAt != null) date(d.addedAt);
    }
    for (const value of p.deadlines) {
      const d = object(value); text(d.title, true); date(d.date);
      if (d.date === null || !['return', 'warranty', 'rebate', 'custom'].includes(String(d.type)) || (d.completed !== undefined && typeof d.completed !== 'boolean')) fail();
    }
    const record = migratePurchase({ ...p, documents: p.documents.map(value => ({ ...object(value), uri: null })) });
    if (!record) return fail();
    return record;
  });
}
/** Append-only restoration. New IDs prevent account collisions and tombstone revival. */
export function prepareRestoration(purchases: Purchase[], createId: () => string): Purchase[] {
  return purchases.map(p => ({ ...p, id: createId(), documents: p.documents.map(d => ({ ...d, id: createId(), uri: null })), deadlines: p.deadlines.map(d => ({ ...d, id: createId() })) }));
}
