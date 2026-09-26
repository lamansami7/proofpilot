import type { Purchase, PurchaseDeadline, PurchaseDocument } from '../types/purchase';
import { deriveProtection } from './purchaseSelectors';
import { migratePurchase } from './purchaseMigration';
import { supabase } from './supabase';

export function cloudAvailable() { return Boolean(supabase); }
// Explicit pagination avoids silently dropping records at Supabase's default row limit.
export async function listDeletedPurchases(client = supabase): Promise<string[]> {
  if (!client) throw new Error('Supabase is not configured.');
  const ids: string[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('purchase_tombstones').select('record_id').order('record_id').range(offset, offset + 499);
    if (error) throw error;
    ids.push(...(data ?? []).map(row => row.record_id as string));
    if (!data || data.length < 500) return ids;
  }
}
export async function listPurchases(client = supabase): Promise<Purchase[]> {
  if (!client) throw new Error('Supabase is not configured.');
  const records: Purchase[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('purchases').select('*, documents(*), warranties(*), return_windows(*), deadlines(*)').order('id').range(offset, offset + 499);
    if (error) throw error;
    records.push(...(data ?? []).map(row => mapPurchase(row as Record<string, unknown>)));
    if (!data || data.length < 500) return records;
  }
}
/** One RPC / transaction; deterministic server IDs make retries idempotent. */
export async function savePurchase(purchase: Purchase, client = supabase): Promise<Purchase> {
  if (!client) throw new Error('Supabase is not configured.');
  const record = { ...purchase, documents: purchase.documents.map(({ uri, ...document }) => document) };
  const { error } = await client.rpc('save_purchase_record', { record });
  if (error) throw error;
  return purchase;
}
export async function deletePurchase(id: Purchase['id'], client = supabase) {
  if (!client) throw new Error('Supabase is not configured.');
  const { error } = await client.rpc('delete_purchase_record', { record_id: String(id) });
  if (error) throw error;
}
/** Uploads to the private bucket. Consumers must use short-lived signed URLs, never public URLs. */
export async function uploadPrivateDocument(userId: string, purchaseId: string, name: string, body: ArrayBuffer, mimeType: string) { if (!supabase) throw new Error('Supabase is not configured.'); const path = `${userId}/${purchaseId}/${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '-')}`; const { error } = await supabase.storage.from('purchase-documents').upload(path, body, { contentType: mimeType, upsert: false }); if (error) throw error; return path; }

function mapPurchase(row: Record<string, unknown>): Purchase {
  const snapshot = migratePurchase(row.record_data);
  if (snapshot) return snapshot;
  const docs = Array.isArray(row.documents) ? row.documents as Array<Record<string, unknown>> : [];
  const warranty = Array.isArray(row.warranties) ? row.warranties[0] as Record<string, unknown> | undefined : undefined;
  const returns = Array.isArray(row.return_windows) ? row.return_windows[0] as Record<string, unknown> | undefined : undefined;
  const rawDeadlines = Array.isArray(row.deadlines) ? row.deadlines as Array<Record<string, unknown>> : [];
  const documents: PurchaseDocument[] = docs.map((d) => ({ id: String(d.id), name: String(d.name), kind: d.kind === 'warranty' ? 'warranty' : d.kind === 'receipt' ? 'receipt' : 'other', mimeType: typeof d.mime_type === 'string' ? d.mime_type : null }));
  const returnDeadline = typeof returns?.end_date === 'string' ? returns.end_date : null;
  const warrantyEnd = typeof warranty?.end_date === 'string' ? warranty.end_date : null;
  const deadlines: PurchaseDeadline[] = rawDeadlines.map((d) => ({ id: String(d.id), completed: d.status === 'completed' || d.status === 'dismissed', type: d.type === 'warranty' || d.type === 'rebate' || d.type === 'custom' ? d.type : 'return', date: String(d.deadline_date), title: String(d.title) }));
  const hasReceipt = documents.some((document) => document.kind === 'receipt');
  return { id: String(row.id), name: String(row.product_name), merchant: typeof row.merchant === 'string' ? row.merchant : 'Merchant not added', price: typeof row.purchase_price === 'number' ? row.purchase_price : row.purchase_price ? Number(row.purchase_price) : null, purchaseDate: typeof row.purchase_date === 'string' ? row.purchase_date : null, category: typeof row.category === 'string' ? row.category : 'Other', icon: 'package', tint: '#E7EDFF', protectionStatus: deriveProtection({ returnDeadline, warrantyEnd, hasReceipt }), warrantyEnd, warrantyProvider: typeof warranty?.provider === 'string' ? warranty.provider : null, returnDeadline, serial: typeof row.serial_number === 'string' ? row.serial_number : null, model: typeof row.model_number === 'string' ? row.model_number : null, hasReceipt, hasWarrantyInfo: Boolean(warrantyEnd || warranty?.provider), notes: typeof row.notes === 'string' ? row.notes : null, documents, deadlines };
}
