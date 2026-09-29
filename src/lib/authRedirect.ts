/** Only PKCE authorization codes on the app's exact callback are accepted. */
export const NATIVE_AUTH_REDIRECT = 'proofpilot://auth/callback';

const BLOCKED_HOSTNAMES = ['localhost', '127.0.0.1', '::1'];

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[(.*)\]$/, '$1');
}

function isValidProductionRedirect(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    if (url.search || url.hash) return false;
    const hostname = normalizeHostname(url.hostname);
    if (BLOCKED_HOSTNAMES.includes(hostname)) return false;
    if (/\.(invalid|test|localhost)$/.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the correct authentication redirect URL for the current platform and environment.
 * - Native: always uses the PKCE callback scheme
 * - Web production: uses EXPO_PUBLIC_AUTH_REDIRECT_URL when it is a valid HTTPS public URL
 * - Web development: falls back to window.location.origin when EXPO_PUBLIC_AUTH_REDIRECT_URL is not set or invalid
 */
export function getAuthRedirectUrl(): string {
  if (typeof window === 'undefined') {
    return NATIVE_AUTH_REDIRECT;
  }
  const productionRedirect = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL ?? '';
  if (productionRedirect && isValidProductionRedirect(productionRedirect)) {
    return productionRedirect;
  }
  return window.location.origin;
}

export function nativeRecoveryCode(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'proofpilot:' || url.hostname !== 'auth' || url.pathname !== '/callback' || url.username || url.password || url.hash) return null;
    const code = url.searchParams.get('code');
    return code && /^[A-Za-z0-9_-]{10,256}$/.test(code) ? code : null;
  } catch { return null; }
}