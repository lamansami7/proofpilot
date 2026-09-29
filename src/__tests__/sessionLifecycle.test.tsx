import React from 'react';
import { Linking } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { useSession } from '../hooks/useSession';
import { MAX_SESSION_RESTORE_TIMEOUT_MS, SESSION_RESTORE_TIMEOUT_MS } from '../lib/sessionRestore';
import { getAuthRedirectUrl } from '../lib/authRedirect';
let mockEvent: (event: string, session: unknown) => void;
const mockAuth = {
  onAuthStateChange: jest.fn((callback) => { mockEvent = callback; return { data: { subscription: { unsubscribe: jest.fn() } } }; }),
  getSession: jest.fn(), exchangeCodeForSession: jest.fn(), startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn(), signOut: jest.fn(),
  signInWithPassword: jest.fn(), signUp: jest.fn(), resetPasswordForEmail: jest.fn(), resend: jest.fn(), updateUser: jest.fn(),
};
jest.mock('../lib/supabase', () => ({ supabase: { get auth() { return mockAuth; } } }));
let current: ReturnType<typeof useSession>;
function Harness() { current = useSession(); return null; }
let renderer: ReactTestRenderer;
afterEach(() => { if (renderer) act(() => renderer.unmount()); jest.clearAllMocks(); });
test('restores cached identity without requiring an online getUser call', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'owner' } } }, error: null });
  await act(async () => { renderer = create(<Harness />); });
  expect(current.user?.id).toBe('owner'); expect(current.loading).toBe(false);
});
test('auth events win over delayed session restoration', async () => {
  let resolve!: (value: unknown) => void;
  mockAuth.getSession.mockReturnValue(new Promise(r => { resolve = r; }));
  await act(async () => { renderer = create(<Harness />); });
  await act(async () => { mockEvent('SIGNED_OUT', null); resolve({ data: { session: { user: { id: 'old' } } }, error: null }); });
  expect(current.user).toBeNull();
});
test('restoration failures leave a retryable error rather than an endless spinner', async () => {
  mockAuth.getSession.mockRejectedValue(new Error('Network failure'));
  await act(async () => { renderer = create(<Harness />); });
  expect(current.error).toContain('Retry'); expect(current.loading).toBe(false);
});
test('sign out does not silently swallow provider errors', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mockAuth.signOut.mockResolvedValue({ error: new Error('Network failure') });
  await act(async () => { renderer = create(<Harness />); });
  await expect(current.signOut()).rejects.toThrow('Network failure');
});
test('recovery event activates password change instead of ordinary navigation', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  await act(async () => { renderer = create(<Harness />); });
  act(() => mockEvent('PASSWORD_RECOVERY', { user: { id: 'owner' } }));
  expect(current.recovery).toBe(true);
  act(() => mockEvent('SIGNED_OUT', null)); expect(current.recovery).toBe(false);
});

test('late initial deep link cannot authenticate after the session hook unmounts', async () => {
  let resolve!: (value: string) => void;
  const initial = jest.spyOn(Linking, 'getInitialURL').mockReturnValue(new Promise(r => { resolve = r; }));
  mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  await act(async () => { renderer = create(<Harness />); });
  act(() => renderer.unmount());
  await act(async () => { resolve('proofpilot://auth/callback?code=test-code'); });
  expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  initial.mockRestore();
});

test('successful delayed session restoration clears the earlier timeout error',async()=>{
 const initial=jest.spyOn(Linking,'getInitialURL').mockResolvedValue(null);
 jest.useFakeTimers();
 try {
  let resolve!:(value:unknown)=>void;mockAuth.getSession.mockReturnValue(new Promise(yes=>{resolve=yes;}));
  await act(async()=>{renderer=create(<Harness/>);});
  // The old 15s cut-off is gone: a slow connection must not be failed early.
  act(()=>jest.advanceTimersByTime(15000));expect(current.error).toBeNull();
  act(()=>jest.advanceTimersByTime(SESSION_RESTORE_TIMEOUT_MS));expect(current.error).toContain('timed out');
  await act(async()=>{resolve({data:{session:{user:{id:'owner'}}},error:null});});
  expect(current.user?.id).toBe('owner');expect(current.error).toBeNull();expect(current.loading).toBe(false);
 } finally {jest.useRealTimers();initial.mockRestore();}
});

test('session restoration still cannot hang indefinitely',async()=>{
 const initial=jest.spyOn(Linking,'getInitialURL').mockResolvedValue(null);
 jest.useFakeTimers();
 try {
  mockAuth.getSession.mockReturnValue(new Promise(()=>{}));
  await act(async()=>{renderer=create(<Harness/>);});
  act(()=>jest.advanceTimersByTime(MAX_SESSION_RESTORE_TIMEOUT_MS+1));
  expect(current.error).toContain('timed out');expect(current.loading).toBe(false);
 } finally {jest.useRealTimers();initial.mockRestore();}
});

// --- Password reset end-to-end wiring: request -> Supabase email -> production
// redirect -> recovery session -> password update. Email delivery itself still
// requires a human; this covers the code path the app controls.
describe('password recovery wiring', () => {
  const originalRedirect = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL;
  let initial: jest.SpyInstance;
  beforeEach(() => {
    initial = jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = 'https://get-proofpilot.lovable.app';
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  });
  afterEach(() => {
    initial.mockRestore();
    if (originalRedirect === undefined) delete process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL;
    else process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = originalRedirect;
  });
  test('reset requests the email and returns through the shared production redirect', async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await act(async () => { renderer = create(<Harness />); });
    await act(async () => { await current.resetPassword('person@example.test'); });
    const [email, options] = mockAuth.resetPasswordForEmail.mock.calls[0];
    expect(email).toBe('person@example.test');
    expect(options.redirectTo).toBe(getAuthRedirectUrl());
    expect(options.redirectTo).not.toMatch(/localhost|127\.0\.0\.1|\[::1\]|^http:/);
  });
  test('a refused reset request surfaces the provider error instead of a false success', async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ error: new Error('Rate limit exceeded') });
    await act(async () => { renderer = create(<Harness />); });
    await act(async () => { await expect(current.resetPassword('person@example.test')).rejects.toThrow('Rate limit exceeded'); });
  });
  test('confirmation resend posts a signup type with the same redirect', async () => {
    mockAuth.resend.mockResolvedValue({ error: null });
    await act(async () => { renderer = create(<Harness />); });
    await act(async () => { await current.resendConfirmation('person@example.test'); });
    const [payload] = mockAuth.resend.mock.calls[0];
    expect(payload.type).toBe('signup');
    expect(payload.email).toBe('person@example.test');
    expect(payload.options.emailRedirectTo).toBe(getAuthRedirectUrl());
  });
  test('a recovery session updates the password and leaves recovery mode', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await act(async () => { renderer = create(<Harness />); });
    act(() => mockEvent('PASSWORD_RECOVERY', { user: { id: 'owner' } }));
    expect(current.recovery).toBe(true);
    mockAuth.updateUser.mockResolvedValue({ error: null });
    await act(async () => { await current.updatePassword('a-new-strong-password'); });
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'a-new-strong-password' });
    expect(current.recovery).toBe(false);
  });
  test('a failed password update keeps recovery mode so the user can retry', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await act(async () => { renderer = create(<Harness />); });
    act(() => mockEvent('PASSWORD_RECOVERY', { user: { id: 'owner' } }));
    mockAuth.updateUser.mockResolvedValue({ error: new Error('New password should be different') });
    await act(async () => { await expect(current.updatePassword('a-new-strong-password')).rejects.toThrow('different'); });
    expect(current.recovery).toBe(true);
  });
});
