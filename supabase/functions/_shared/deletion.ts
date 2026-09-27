import { bearer, cors, HttpError, json, readJson, type Identity } from './http.ts';
/** Storage cleanup precedes Auth deletion; failures retain the durable request for retry. */
export function createDeletionHandler(deps: {
  allowedOrigins: string[];
  authenticate: (token: string) => Promise<Identity>;
  begin: (userId: string) => Promise<void>;
  removeFiles: (userId: string) => Promise<boolean>;
  deleteUser: (userId: string) => Promise<void>;
  now?: () => number;
}) {
  return async (request: Request) => {
    let headers: HeadersInit = { 'Cache-Control': 'no-store' };
    try {
      headers = cors(request,deps.allowedOrigins);
      if (request.method === 'OPTIONS') return new Response(null,{ status:204,headers });
      if (request.method !== 'POST') throw new HttpError(405,'method_not_allowed');
      const user = await deps.authenticate(bearer(request));
      const age = (deps.now?.() ?? Date.now()) / 1000 - (user.passwordVerifiedAt ?? 0);
      if (age < 0 || age > 300) throw new HttpError(403,'recent_password_required');
      const body = await readJson(request,1024);
      if (body.confirmation !== 'DELETE' || Object.keys(body).length !== 1) throw new HttpError(400,'confirmation_required');
      await deps.begin(user.id);
      if (!await deps.removeFiles(user.id)) throw new HttpError(409,'cleanup_pending_retry');
      await deps.deleteUser(user.id);
      return json({ deleted: true },200,headers);
    } catch (error) { return json({ error: error instanceof HttpError ? error.code : 'deletion_incomplete_retry' },error instanceof HttpError ? error.status : 503,headers); }
  };
}
