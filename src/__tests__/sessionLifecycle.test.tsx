import React from 'react';
import { Linking } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { useSession } from '../hooks/useSession';
let mockEvent: (event: string, session: unknown) => void;
const mockAuth = {
  onAuthStateChange: jest.fn((callback) => { mockEvent = callback; return { data: { subscription: { unsubscribe: jest.fn() } } }; }),
  getSession: jest.fn(), exchangeCodeForSession: jest.fn(), startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn(), signOut: jest.fn(),
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
  act(()=>jest.advanceTimersByTime(15000));expect(current.error).toContain('timed out');
  await act(async()=>{resolve({data:{session:{user:{id:'owner'}}},error:null});});
  expect(current.user?.id).toBe('owner');expect(current.error).toBeNull();expect(current.loading).toBe(false);
 } finally {jest.useRealTimers();initial.mockRestore();}
});
