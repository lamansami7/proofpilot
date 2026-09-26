import { nativeRecoveryCode } from '../authRedirect';
test('accepts PKCE code only on the app callback',()=>expect(nativeRecoveryCode('proofpilot://auth/callback?code=abc123456789-xyz')).toBe('abc123456789-xyz'));
test.each(['https://evil.test/auth/callback?code=abc123456789','proofpilot://evil/callback?code=abc123456789','proofpilot://auth/other?code=abc123456789','proofpilot://auth/callback#access_token=secret','proofpilot://auth/callback?code=short','not a URL'])('rejects untrusted or implicit-token callback %s',url=>expect(nativeRecoveryCode(url)).toBeNull());
