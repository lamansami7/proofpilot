import { createClient } from 'npm:@supabase/supabase-js@2.117.1';
import { HttpError, type Identity } from './http.ts';
const url = Deno.env.get('SUPABASE_URL')!;
// Automatically injected by Supabase, server only. Never imported by the Expo client.
export const admin = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{
  auth: { persistSession:false, autoRefreshToken:false },
  global: { fetch: (input,init) => fetch(input,{ ...init, signal: init?.signal ?? AbortSignal.timeout(15000) }) },
});
export const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(v => v.trim()).filter(Boolean);
export async function authenticate(token: string): Promise<Identity> {
  const { data,error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401,'invalid_session');
  // getUser verified this exact JWT with Auth before reading AMR. Never trust an unverified decoded JWT.
  let passwordVerifiedAt: number | null = null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    for (const item of payload.amr ?? []) if (item.method === 'password' && typeof item.timestamp === 'number') passwordVerifiedAt = Math.max(passwordVerifiedAt ?? 0,item.timestamp);
  } catch { /* No recent password proof: account deletion remains denied. */ }
  return { id:data.user.id,passwordVerifiedAt };
}
