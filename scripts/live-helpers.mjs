// Small pure helpers shared by the live verification scripts. Kept free of any network or
// environment access so they can be unit-tested offline against the installed supabase-js.
//
// Why these exist (each one fixes a defect found when the merged scripts were first executed):
//  - supabase-js v2 has NO admin.getUserByEmail; users must be found by paging listUsers.
//  - generateLink nests the link under `data.properties`, not on `data`.
//  - a privileged evidence query that fails (for example a missing GRANT on a table the service
//    role does not own) must be a FAILURE, never "zero rows".

/** Marker stored in user_metadata of every account the deletion script creates itself. */
export const DISPOSABLE_MARKER = 'proofpilot_qa_disposable';

/**
 * Finds one Auth user by exact, case-insensitive email using the admin listUsers API.
 * Returns the user object, or null when the address is definitely absent. Any API error, or an
 * exhausted page budget, throws: "could not look" must never read as "does not exist".
 */
export async function findUserByEmail(admin, email, { perPage = 200, maxPages = 200 } = {}) {
  const wanted = String(email).trim().toLowerCase();
  if (!wanted) throw new Error('an email address is required');
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const hit = users.find(user => typeof user.email === 'string' && user.email.trim().toLowerCase() === wanted);
    if (hit) return hit;
    if (users.length < perPage) return null;
  }
  throw new Error('user listing exceeded its page budget; refusing to conclude the address is absent');
}

/** admin.auth.admin.generateLink resolves to { properties: { action_link, ... }, user }. */
export const actionLinkOf = generated => generated?.properties?.action_link;

/**
 * Runs a privileged (service-role) PostgREST query and returns its rows. A failed query throws.
 * A permission error gets a fixed, value-free hint, because the Data API may not have granted the
 * service role access to a table created after Supabase stopped auto-granting new public tables.
 */
export async function evidenceRows(query) {
  const { data, error } = await query;
  if (error) {
    if (error.code === '42501' || /permission denied/i.test(String(error.message ?? ''))) {
      console.error('EVIDENCE BLOCKED: the service-role key was denied access to a table, so this check cannot produce evidence. It is NOT treated as zero rows. See OPERATOR_RUNBOOK.md, "Privileged evidence grants".');
    }
    throw error;
  }
  return data ?? [];
}

/** True only for a user this script created itself (carries the disposable marker). */
export const isMarkedDisposable = user => user?.user_metadata?.[DISPOSABLE_MARKER] === true;

/**
 * Removes every Storage object under `${uid}/` with the service-role client. Used ONLY for residue of the
 * disposable account before it is recreated or removed; never for QA A or B. Bounded on depth, passes and
 * total objects so a misbehaving listing cannot loop forever.
 */
export async function purgeStoragePrefix(bucketApi, uid, { pageSize = 100, maxObjects = 20000, maxDepth = 12 } = {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(uid))) throw new Error('a user id is required for storage residue cleanup');
  let removed = 0;
  const walk = async (prefix, depth) => {
    if (depth > maxDepth) throw new Error('storage hierarchy too deep for residue cleanup');
    for (let pass = 0; pass < 5000; pass++) {
      const { data, error } = await bucketApi.list(prefix, { limit: pageSize, offset: 0, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw error;
      if (!data?.length) return;
      const files = [];
      let folders = 0;
      for (const entry of data) {
        const path = `${prefix}/${entry.name}`;
        if (entry.id) files.push(path);
        else { folders++; await walk(path, depth + 1); }
      }
      if (files.length) {
        const { error: removeError } = await bucketApi.remove(files);
        if (removeError) throw removeError;
        removed += files.length;
        if (removed > maxObjects) throw new Error('residue cleanup exceeded its object budget');
      } else if (folders === data.length && pass > 0) {
        // Only (already emptied) folders remain in the listing: nothing more can be removed here.
        return;
      }
    }
    throw new Error('residue cleanup did not converge');
  };
  await walk(uid, 0);
  return removed;
}
