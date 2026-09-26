/** Only PKCE authorization codes on the app's exact callback are accepted. */
export const NATIVE_AUTH_REDIRECT = 'proofpilot://auth/callback';
export function nativeRecoveryCode(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'proofpilot:' || url.hostname !== 'auth' || url.pathname !== '/callback' || url.username || url.password || url.hash) return null;
    const code = url.searchParams.get('code');
    return code && /^[A-Za-z0-9_-]{10,256}$/.test(code) ? code : null;
  } catch { return null; }
}
