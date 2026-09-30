import { createDeletionHandler } from '../_shared/deletion.ts';
import { admin, allowedOrigins, authenticate } from '../_shared/runtime.ts';
const bucket = admin.storage.from('purchase-documents');
const receipts = admin.from('account_deletion_receipts');
Deno.serve(createDeletionHandler({
  allowedOrigins, authenticate,
  begin: async userId => { const { error } = await admin.from('account_deletion_requests').upsert({ user_id:userId }); if (error) throw error; },
  // Hash-only receipt rows (service role): pending before destructive work, completed after Auth deletion.
  receiptPending: async (hash,userId) => {
    const { error } = await receipts.upsert({ receipt_hash:hash,user_id:userId },{ onConflict:'receipt_hash',ignoreDuplicates:true });
    if (error) throw error;
  },
  receiptCompleted: async hash => {
    const { data,error } = await receipts.update({ completed_at:new Date().toISOString() }).eq('receipt_hash',hash).select('receipt_hash');
    if (error || data?.length !== 1) throw new Error('receipt completion was not recorded');
  },
  receiptStatus: async hash => {
    const { data,error } = await receipts.select('user_id,completed_at').eq('receipt_hash',hash).maybeSingle();
    if (error) throw error;
    return data ? { userId:data.user_id,completedAt:data.completed_at } : null;
  },
  removeFiles: async userId => {
    let removed = 0;
    const clear = async (prefix: string, depth = 0): Promise<boolean> => {
      if (depth > 8) throw new Error('Storage hierarchy exceeds supported depth');
      // Always take the first page: successful deletion shifts subsequent entries.
      while (removed < 1000) {
        const { data,error } = await bucket.list(prefix,{ limit:100,offset:0,sortBy:{column:'name',order:'asc'} });
        if (error) throw error;
        if (!data?.length) return true;
        const files: string[] = [];
        for (const entry of data) {
          if (!entry.name || entry.name.includes('/') || entry.name === '.' || entry.name === '..') throw new Error('Invalid storage path');
          const path = `${prefix}/${entry.name}`;
          if (entry.id) files.push(path);
          else if (!await clear(path,depth+1)) return false;
        }
        if (files.length) { const { error } = await bucket.remove(files); if (error) throw error; removed += files.length; }
      }
      return false;
    };
    return clear(userId);
  },
  deleteUser: async userId => { const { error } = await admin.auth.admin.deleteUser(userId); if (error) throw error; },
}));
