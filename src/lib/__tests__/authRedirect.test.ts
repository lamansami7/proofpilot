import { NATIVE_AUTH_REDIRECT, getAuthRedirectUrl, nativeRecoveryCode } from '../authRedirect';

describe('nativeRecoveryCode', () => {
  test('accepts PKCE code only on the app callback', () =>
    expect(nativeRecoveryCode('proofpilot://auth/callback?code=abc123456789-xyz')).toBe('abc123456789-xyz'));
  test.each([
    'https://evil.test/auth/callback?code=abc123456789',
    'proofpilot://evil/callback?code=abc123456789',
    'proofpilot://auth/other?code=abc123456789',
    'proofpilot://auth/callback#access_token=secret',
    'proofpilot://auth/callback?code=short',
    'not a URL',
  ])('rejects untrusted or implicit-token callback %s', (url) =>
    expect(nativeRecoveryCode(url)).toBeNull());
});

describe('getAuthRedirectUrl', () => {
  const originalEnv = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL;
  const originalWindow = global.window;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL;
    // @ts-expect-error - mocking global window
    global.window = undefined;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = originalEnv;
    } else {
      delete process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL;
    }
    global.window = originalWindow;
  });

  test('returns native redirect when window is undefined (native platform)', () => {
    expect(getAuthRedirectUrl()).toBe(NATIVE_AUTH_REDIRECT);
  });

  test('returns production redirect when EXPO_PUBLIC_AUTH_REDIRECT_URL is a valid HTTPS URL', () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = 'https://get-proofpilot.lovable.app';
    // @ts-expect-error - mocking window for web
    global.window = { location: { origin: 'http://localhost:8081' } };
    expect(getAuthRedirectUrl()).toBe('https://get-proofpilot.lovable.app');
  });

  test('falls back to window.location.origin when EXPO_PUBLIC_AUTH_REDIRECT_URL is not set (local development)', () => {
    // @ts-expect-error - mocking window for web
    global.window = { location: { origin: 'http://localhost:8081' } };
    expect(getAuthRedirectUrl()).toBe('http://localhost:8081');
  });

  test('production redirect takes precedence over window.location.origin', () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = 'https://get-proofpilot.lovable.app';
    // @ts-expect-error - mocking window for web
    global.window = { location: { origin: 'http://localhost:8081' } };
    expect(getAuthRedirectUrl()).toBe('https://get-proofpilot.lovable.app');
  });

  test('does not contain localhost when production URL is configured', () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = 'https://get-proofpilot.lovable.app';
    // @ts-expect-error - mocking window for web
    global.window = { location: { origin: 'http://localhost:8081' } };
    const redirect = getAuthRedirectUrl();
    expect(redirect).not.toContain('localhost');
    expect(redirect).not.toContain('127.0.0.1');
  });

  test('native redirect is exactly the expected scheme', () => {
    // @ts-expect-error - mocking window for web
    global.window = undefined;
    expect(getAuthRedirectUrl()).toBe('proofpilot://auth/callback');
  });

  test('rejects http URL and falls back to window.location.origin', () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = 'http://get-proofpilot.lovable.app';
    // @ts-expect-error - mocking window for web
    global.window = { location: { origin: 'http://localhost:8081' } };
    expect(getAuthRedirectUrl()).toBe('http://localhost:8081');
  });

  test('rejects localhost and falls back to window.location.origin', () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = 'https://localhost';
    // @ts-expect-error - mocking window for web
    global.window = { location: { origin: 'http://localhost:8081' } };
    expect(getAuthRedirectUrl()).toBe('http://localhost:8081');
  });

  test('rejects wildcard hosts and wildcard paths and falls back to window.location.origin', () => {
    for (const wildcard of ['https://*.lovable.app', 'https://get-proofpilot.lovable.app/*']) {
      process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = wildcard;
      // @ts-expect-error - mocking window for web
      global.window = { location: { origin: 'http://localhost:8081' } };
      expect(getAuthRedirectUrl()).toBe('http://localhost:8081');
    }
  });

  test('rejects 127.0.0.1 and falls back to window.location.origin', () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = 'https://127.0.0.1';
    // @ts-expect-error - mocking window for web
    global.window = { location: { origin: 'http://localhost:8081' } };
    expect(getAuthRedirectUrl()).toBe('http://localhost:8081');
  });

  test('rejects ::1 and falls back to window.location.origin', () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = 'https://[::1]';
    // @ts-expect-error - mocking window for web
    global.window = { location: { origin: 'http://localhost:8081' } };
    expect(getAuthRedirectUrl()).toBe('http://localhost:8081');
  });

  test('rejects URL with credentials and falls back to window.location.origin', () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = 'https://user:pass@example.com';
    // @ts-expect-error - mocking window for web
    global.window = { location: { origin: 'http://localhost:8081' } };
    expect(getAuthRedirectUrl()).toBe('http://localhost:8081');
  });

  test('rejects URL with query string and falls back to window.location.origin', () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = 'https://example.com?foo=bar';
    // @ts-expect-error - mocking window for web
    global.window = { location: { origin: 'http://localhost:8081' } };
    expect(getAuthRedirectUrl()).toBe('http://localhost:8081');
  });

  test('rejects URL with fragment and falls back to window.location.origin', () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = 'https://example.com#fragment';
    // @ts-expect-error - mocking window for web
    global.window = { location: { origin: 'http://localhost:8081' } };
    expect(getAuthRedirectUrl()).toBe('http://localhost:8081');
  });

  test('rejects .invalid TLD and falls back to window.location.origin', () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = 'https://example.invalid';
    // @ts-expect-error - mocking window for web
    global.window = { location: { origin: 'http://localhost:8081' } };
    expect(getAuthRedirectUrl()).toBe('http://localhost:8081');
  });

  test('rejects .test TLD and falls back to window.location.origin', () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = 'https://example.test';
    // @ts-expect-error - mocking window for web
    global.window = { location: { origin: 'http://localhost:8081' } };
    expect(getAuthRedirectUrl()).toBe('http://localhost:8081');
  });

  test('rejects .localhost TLD and falls back to window.location.origin', () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = 'https://example.localhost';
    // @ts-expect-error - mocking window for web
    global.window = { location: { origin: 'http://localhost:8081' } };
    expect(getAuthRedirectUrl()).toBe('http://localhost:8081');
  });
});