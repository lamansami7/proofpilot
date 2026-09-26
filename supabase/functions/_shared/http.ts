export class HttpError extends Error { constructor(public status: number, public code: string) { super(code); } }
export function cors(request: Request, allowedOrigins: string[]) {
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins.includes(origin)) throw new HttpError(403, 'origin_not_allowed');
  return { ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}), 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
}
export async function readJson(request: Request, maxBytes = 16384): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'json_required');
  if (Number(request.headers.get('content-length')) > maxBytes) throw new HttpError(413, 'request_too_large');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'body_required');
  const chunks: Uint8Array[] = []; let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = async () => {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length;
        if (size > maxBytes) throw new HttpError(413, 'request_too_large');
        chunks.push(value);
      }
    };
    await Promise.race([read(), new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel(); reject(new HttpError(408, 'request_timeout')); }, 5000); })]);
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'invalid_json'); }
  finally { clearTimeout(timer); await reader.cancel().catch(() => undefined); }
}
export function bearer(request: Request) {
  const value = request.headers.get('authorization');
  if (!value || !/^Bearer [A-Za-z0-9_.-]+$/.test(value) || value.length > 10000) throw new HttpError(401, 'sign_in_required');
  return value.slice(7);
}
export function json(body: unknown, status: number, headers: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' } });
}
export type Identity = { id: string; passwordVerifiedAt: number | null };
