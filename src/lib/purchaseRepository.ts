import type { Purchase, PurchaseDeadline, PurchaseDocument } from '../types/purchase';
import { deriveProtection } from './purchaseSelectors';
import { supabase } from './supabase';

export function cloudAvailable() { return Boolean(supabase); }
export async function listPurchases(): Promise<Purchase[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('purchases').select('*, documents(*), warranties(*), return_windows(*), deadlines(*)').order('purchase_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapPurchase(row as Record<string, unknown>));
}
export async function savePurchase(purchase: Purchase): Promise<Purchase> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sign in to sync purchases.');
  const values = { user_id: auth.user.id, product_name: purchase.name, merchant: purchase.merchant, category: purchase.category, purchase_date: purchase.purchaseDate, purchase_price: purchase.price, serial_number: purchase.serial, model_number: purchase.model, notes: purchase.notes };
  const cloudId = typeof purchase.id === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(purchase.id) ? purchase.id : null;
  const request = cloudId ? supabase.from('purchases').update(values).eq('id', cloudId).select().single() : supabase.from('purchases').insert(values).select().single();
  const { data, error } = await request; if (error) throw error;
  const id = String(data.id);
  const tables = ['warranties', 'return_windows', 'deadlines'] as const;
  for (const table of tables) { const result = await supabase.from(table).delete().eq('purchase_id', id); if (result.error) throw result.error; }
  if (purchase.warrantyEnd || purchase.warrantyProvider) { const result = await supabase.from('warranties').insert({ purchase_id: id, provider: purchase.warrantyProvider, end_date: purchase.warrantyEnd }); if (result.error) throw result.error; }
  if (purchase.returnDeadline) { const result = await supabase.from('return_windows').insert({ purchase_id: id, merchant: purchase.merchant, end_date: purchase.returnDeadline }); if (result.error) throw result.error; }
  if (purchase.deadlines.length) { const result = await supabase.from('deadlines').insert(purchase.deadlines.map((deadline) => ({ purchase_id: id, user_id: auth.user!.id, type: deadline.type, title: deadline.title, deadline_date: deadline.date }))); if (result.error) throw result.error; }
  return { ...purchase, id };
}
export async function deletePurchase(id: Purchase['id']) { if (!supabase || typeof id !== 'string') return; if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) return; const { error } = await supabase.from('purchases').delete().eq('id', id); if (error) throw error; }
/** Uploads to the private bucket. Consumers must use short-lived signed URLs, never public URLs. */
export async function uploadPrivateDocument(userId: string, purchaseId: string, name: string, body: ArrayBuffer, mimeType: string) { if (!supabase) throw new Error('Supabase is not configured.'); const path = `${userId}/${purchaseId}/${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '-')}`; const { error } = await supabase.storage.from('purchase-documents').upload(path, body, { contentType: mimeType, upsert: false }); if (error) throw error; return path; }

function mapPurchase(row: Record<string, unknown>): Purchase {
  const docs = Array.isArray(row.documents) ? row.documents as Array<Record<string, unknown>> : [];
  const warranty = Array.isArray(row.warranties) ? row.warranties[0] as Record<string, unknown> | undefined : undefined;
  const returns = Array.isArray(row.return_windows) ? row.return_windows[0] as Record<string, unknown> | undefined : undefined;
  const rawDeadlines = Array.isArray(row.deadlines) ? row.deadlines as Array<Record<string, unknown>> : [];
  const documents: PurchaseDocument[] = docs.map((d) => ({ id: String(d.id), name: String(d.name), kind: d.kind === 'warranty' ? 'warranty' : d.kind === 'receipt' ? 'receipt' : 'other', mimeType: typeof d.mime_type === 'string' ? d.mime_type : null }));
  const returnDeadline = typeof returns?.end_date === 'string' ? returns.end_date : null;
  const warrantyEnd = typeof warranty?.end_date === 'string' ? warranty.end_date : null;
  const deadlines: PurchaseDeadline[] = rawDeadlines.filter((d) => d.status === 'active').map((d) => ({ id: String(d.id), type: d.type === 'warranty' || d.type === 'rebate' || d.type === 'custom' ? d.type : 'return', date: String(d.deadline_date), title: String(d.title) }));
  const hasReceipt = documents.some((document) => document.kind === 'receipt');
  return { id: String(row.id), name: String(row.product_name), merchant: typeof row.merchant === 'string' ? row.merchant : 'Merchant not added', price: typeof row.purchase_price === 'number' ? row.purchase_price : row.purchase_price ? Number(row.purchase_price) : null, purchaseDate: typeof row.purchase_date === 'string' ? row.purchase_date : null, category: typeof row.category === 'string' ? row.category : 'Other', icon: 'package', tint: '#E7EDFF', protectionStatus: deriveProtection({ returnDeadline, warrantyEnd, hasReceipt }), warrantyEnd, warrantyProvider: typeof warranty?.provider === 'string' ? warranty.provider : null, returnDeadline, serial: typeof row.serial_number === 'string' ? row.serial_number : null, model: typeof row.model_number === 'string' ? row.model_number : null, hasReceipt, hasWarrantyInfo: Boolean(warrantyEnd || warranty?.provider), notes: typeof row.notes === 'string' ? row.notes : null, documents, deadlines };
}
