import type { Purchase, PurchaseDocument } from '../types/purchase';
import { supabase } from './supabase';

export type DataMode = 'demo' | 'cloud';
export function cloudAvailable() { return Boolean(supabase); }
export async function listPurchases(): Promise<Purchase[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('purchases').select('*, documents(*), warranties(*), return_windows(*), deadlines(*)').order('purchase_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapPurchase(row));
}
export async function savePurchase(purchase: Purchase): Promise<Purchase> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: session } = await supabase.auth.getUser();
  if (!session.user) throw new Error('Sign in to save purchases to the cloud.');
  const values = { user_id: session.user.id, product_name: purchase.name, merchant: purchase.merchant, category: purchase.category, purchase_date: purchase.purchaseDate, purchase_price: purchase.price, serial_number: purchase.serial, model_number: purchase.model, notes: purchase.notes };
  const id = typeof purchase.id === 'string' ? purchase.id : undefined;
  const request = id ? supabase.from('purchases').update(values).eq('id', id).select().single() : supabase.from('purchases').insert(values).select().single();
  const { data, error } = await request; if (error) throw error;
  return mapPurchase({ ...data, documents: purchase.documents, warranties: purchase.warrantyEnd ? [{ provider: purchase.warrantyProvider, end_date: purchase.warrantyEnd }] : [], return_windows: purchase.returnDeadline ? [{ end_date: purchase.returnDeadline }] : [], deadlines: purchase.deadlines });
}
export async function deletePurchase(id: Purchase['id']) { if (!supabase || typeof id !== 'string') throw new Error('This purchase is stored locally.'); const { error } = await supabase.from('purchases').delete().eq('id', id); if (error) throw error; }
/** Storage remains private. Callers must create signed URLs; never use public URLs. */
export async function uploadPrivateDocument(userId: string, purchaseId: string, name: string, body: ArrayBuffer, mimeType: string) { if (!supabase) throw new Error('Supabase is not configured.'); const path = `${userId}/${purchaseId}/${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '-')}`; const { error } = await supabase.storage.from('purchase-documents').upload(path, body, { contentType: mimeType, upsert: false }); if (error) throw error; return path; }
function mapPurchase(row: Record<string, unknown>): Purchase { const docs = Array.isArray(row.documents) ? row.documents as Array<Record<string, unknown>> : []; const warranty = Array.isArray(row.warranties) ? row.warranties[0] as Record<string, unknown> | undefined : undefined; const returns = Array.isArray(row.return_windows) ? row.return_windows[0] as Record<string, unknown> | undefined : undefined; const deadlines = Array.isArray(row.deadlines) ? row.deadlines as Array<Record<string, unknown>> : []; const documents: PurchaseDocument[] = docs.map((d) => ({ id: String(d.id), name: String(d.name), kind: d.kind === 'warranty' ? 'warranty' : d.kind === 'receipt' ? 'receipt' : 'other', mimeType: typeof d.mime_type === 'string' ? d.mime_type : null })); const returnDeadline = typeof returns?.end_date === 'string' ? returns.end_date : null; const warrantyEnd = typeof warranty?.end_date === 'string' ? warranty.end_date : null; return { id: String(row.id), name: String(row.product_name), merchant: typeof row.merchant === 'string' ? row.merchant : 'Merchant not added', price: typeof row.purchase_price === 'number' ? row.purchase_price : null, purchaseDate: typeof row.purchase_date === 'string' ? row.purchase_date : null, category: typeof row.category === 'string' ? row.category : 'Other', icon: 'package', tint: '#E7EDFF', protectionStatus: returnDeadline || warrantyEnd ? documents.some((d) => d.kind === 'receipt') ? 'protected' : 'attention' : 'unprotected', warrantyEnd, warrantyProvider: typeof warranty?.provider === 'string' ? warranty.provider : null, returnDeadline, serial: typeof row.serial_number === 'string' ? row.serial_number : null, model: typeof row.model_number === 'string' ? row.model_number : null, hasReceipt: documents.some((d) => d.kind === 'receipt'), hasWarrantyInfo: Boolean(warrantyEnd), notes: typeof row.notes === 'string' ? row.notes : null, documents, deadlines: deadlines.filter((d) => d.status === 'active').map((d) => ({ id: String(d.id), type: d.type === 'warranty' || d.type === 'rebate' || d.type === 'custom' ? d.type : 'return', date: String(d.deadline_date), title: String(d.title) })) }; }
