import { bearer, cors, HttpError, json, readJson, type Identity } from './http.ts';
/** Storage cleanup precedes Auth deletion; failures retain the durable request for retry.
 *  Lost-response recovery: the client holds a 256-bit receipt and keeps only its hash
 *  server-side, so it can later prove completion without a session. A failed sign-in is
 *  never evidence of deletion; only an exact receipt match is. */
const RECEIPT = /^[A-Za-z0-9_-]{43}$/;
async function receiptHash(receipt: unknown): Promise<string> {
  if (typeof receipt !== 'string' || !RECEIPT.test(receipt)) throw new HttpError(400,'receipt_required');
  const raw = receipt.replace(/-/g,'+').replace(/_/g,'/');
  let binary: string;
  try { binary = atob(raw + '='.repeat((4 - raw.length % 4) % 4)); }
  catch { throw new HttpError(400,'receipt_required'); }
  if (binary.length !== 32) throw new HttpError(400,'receipt_required');
  const digest = await crypto.subtle.digest('SHA-256',Uint8Array.from(binary,c => c.charCodeAt(0)));
  return Array.from(new Uint8Array(digest),byte => byte.toString(16).padStart(2,'0')).join('');
}
export function createDeletionHandler(deps: {
  allowedOrigins: string[];
  authenticate: (token: string) => Promise<Identity>;
  begin: (userId: string) => Promise<void>;
  removeFiles: (userId: string) => Promise<boolean>;
  deleteUser: (userId: string) => Promise<void>;
  /** Durable receipt state, service-role only. pending BEFORE destructive work, completed AFTER Auth deletion. */
  receiptPending: (hash: string, userId: string) => Promise<void>;
  receiptCompleted: (hash: string) => Promise<void>;
  receiptStatus: (hash: string) => Promise<{ userId: string; completedAt: string | null } | null>;
  now?: () => number;
}) {
  return async (request: Request) => {
    let headers: HeadersInit = { 'Cache-Control': 'no-store' };
    try {
      headers = cors(request,deps.allowedOrigins);
      if (request.method === 'OPTIONS') return new Response(null,{ status:204,headers });
      if (request.method !== 'POST') throw new HttpError(405,'method_not_allowed');
      const body = await readJson(request,1024);
      if (Object.keys(body).length === 1 && 'receipt' in body) {
        // Status probe for a possibly lost deletion response. Deliberately unauthenticated:
        // the account may already be gone. Knowing a receipt proves the holder started
        // this deletion; an unknown receipt reveals nothing and no other input is accepted.
        const row = await deps.receiptStatus(await receiptHash(body.receipt));
        return json(row
          ? { deleted: row.completedAt !== null, state: row.completedAt !== null ? 'completed' : 'pending', userId: row.userId }
          : { deleted: false, state: 'unknown' },200,headers);
      }
      if (body.confirmation !== 'DELETE'
        || Object.keys(body).some(key => key !== 'confirmation' && key !== 'receipt')) throw new HttpError(400,'confirmation_required');
      const hash = 'receipt' in body ? await receiptHash(body.receipt) : null;
      const user = await deps.authenticate(bearer(request));
      const age = (deps.now?.() ?? Date.now()) / 1000 - (user.passwordVerifiedAt ?? 0);
      if (age < 0 || age > 300) throw new HttpError(403,'recent_password_required');
      await deps.begin(user.id);
      // Fail closed before any destructive work if the receipt cannot be recorded.
      if (hash !== null) await deps.receiptPending(hash,user.id);
      if (!await deps.removeFiles(user.id)) throw new HttpError(409,'cleanup_pending_retry');
      await deps.deleteUser(user.id);
      // Last write: only a completed Auth deletion may ever set completed_at.
      if (hash !== null) await deps.receiptCompleted(hash);
      return json({ deleted: true },200,headers);
    } catch (error) { return json({ error: error instanceof HttpError ? error.code : 'deletion_incomplete_retry' },error instanceof HttpError ? error.status : 503,headers); }
  };
}
