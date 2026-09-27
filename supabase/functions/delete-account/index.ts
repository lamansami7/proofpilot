import { createDeletionHandler } from '../_shared/deletion.ts';
import { admin, allowedOrigins, authenticate } from '../_shared/runtime.ts';
const bucket = admin.storage.from('purchase-documents');
Deno.serve(createDeletionHandler({
  allowedOrigins, authenticate,
  begin: async userId => { const { error } = await admin.from('account_deletion_requests').upsert({ user_id:userId }); if (error) throw error; },
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
