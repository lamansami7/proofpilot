import { SecureBackendAIService } from '../../services/ai/AIService';
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });
test.each(['http://example.com', 'https://secret@example.com', 'https://example.com?key=secret'])('rejects unsafe AI endpoint %s', url => {
  expect(() => new SecureBackendAIService(url)).toThrow();
});
test('does not send unauthenticated requests', async () => {
  global.fetch = jest.fn();
  await expect(new SecureBackendAIService('https://ai.example.com', async () => null).answerPurchaseQuestion('Help', { productName: 'Item' })).rejects.toMatchObject({ code: 'unavailable' });
  expect(global.fetch).not.toHaveBeenCalled();
});
test('sends user JWT, refuses redirects, validates response', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ answer: 'Verify your terms.', knownFacts: [], missingInformation: [] }) });
  const ai = new SecureBackendAIService('https://ai.example.com', async () => 'test-jwt');
  expect((await ai.answerPurchaseQuestion('Help', { productName: 'Item' })).answer).toContain('Verify');
  expect(global.fetch).toHaveBeenCalledWith('https://ai.example.com/purchase-question', expect.objectContaining({ redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' } }));
});
test('handles rate limits without automatic billable retries', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
  const ai = new SecureBackendAIService('https://ai.example.com', async () => 'test-jwt');
  await expect(ai.answerPurchaseQuestion('Help', { productName: 'Item' })).rejects.toThrow('limit');
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
test('rejects oversized input before network activity', async () => {
  global.fetch = jest.fn();
  await expect(new SecureBackendAIService('https://ai.example.com', async () => 'test-jwt').answerPurchaseQuestion('x'.repeat(17000), { productName: 'Item' })).rejects.toThrow('too long');
  expect(global.fetch).not.toHaveBeenCalled();
});
