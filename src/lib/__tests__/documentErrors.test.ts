import { documentFailureHint, documentFailureMessage } from '../documentErrors';

describe('document failure messages are honest and never leak internals', () => {
  test('keeps the specific reason when the storage layer already explains it', () => {
    expect(documentFailureMessage(new Error('Choose a non-empty document no larger than 20 MB.'), 'pick'))
      .toBe('Choose a non-empty document no larger than 20 MB.');
    expect(documentFailureMessage(new Error('Unsupported file type. Choose a PDF or supported image.'), 'pick'))
      .toBe('Unsupported file type. Choose a PDF or supported image.');
    expect(documentFailureMessage(new Error('Document storage is blocked. Close other ProofPilot tabs.'), 'pick'))
      .toBe('Document storage is blocked. Close other ProofPilot tabs.');
  });

  test('explains a denied camera without blaming the file', () => {
    const message = documentFailureMessage(null, 'permission');
    expect(message).toContain('Camera access is turned off');
    expect(message).toContain('upload a receipt file instead');
  });

  test('never echoes an unknown exception to the screen', () => {
    for (const raw of [
      'TypeError: Failed to fetch',
      'DOMException: QuotaExceededError at index 3',
      "ENOENT: no such file or directory, open '/home/user/private/receipt.pdf'",
      'Supabase error: JWT token abc.def.ghi',
      '',
    ]) {
      const message = documentFailureMessage(new Error(raw), 'pick');
      expect(message).toBe('That file could not be attached. Try a PDF or image under 20 MB, or continue without it.');
      expect(message).not.toMatch(/TypeError|DOMException|ENOENT|Supabase|Token|private/);
    }
  });

  test('a camera failure points at the file alternative', () => {
    const message = documentFailureMessage(new Error('something unexpected'), 'camera');
    expect(message).toContain('upload a receipt file instead');
  });

  test('handles non-Error throwables without crashing', () => {
    expect(documentFailureMessage('a string', 'pick')).toContain('could not be attached');
    expect(documentFailureMessage(undefined, 'camera')).toContain('could not be saved');
    expect(documentFailureMessage({ toString: () => 'weird' }, 'pick')).toContain('could not be attached');
  });

  test('the hint reassures that nothing already entered was lost', () => {
    expect(documentFailureHint('pick')).toContain('continue without attaching a file');
    expect(documentFailureHint('camera')).toContain('attach a file instead');
  });
});
