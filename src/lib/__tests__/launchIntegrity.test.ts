import { demoPurchases } from '../../data/demoPurchases';
import { createBackup, parseBackup, prepareRestoration } from '../backup';
import { applyRemoteDeletions, snapshotFor } from '../localPurchaseStore';
import { isOwnedDocumentUri, validateDocumentName, validateDocumentSize } from '../documentValidation';
import { contextFor } from '../../services/ai/purchaseContext';
const item = demoPurchases[0];
const raw = () => JSON.stringify(createBackup([item]));

describe('versioned metadata backup', () => {
  test('round trip preserves saved fields but never exports local paths', () => {
    const purchase = { ...item, documents: [{ id: 'doc', name: 'receipt.pdf', kind: 'receipt' as const, mimeType: 'application/pdf', uri: 'file:///private/receipt.pdf' }] };
    const backup = createBackup([purchase]);
    expect(JSON.stringify(backup)).not.toContain('file:///');
    expect(parseBackup(JSON.stringify(backup))[0].documents[0].uri).toBeNull();
  });
  test('import cannot access existing files using injected device references', () => {
    const backup = createBackup([item]);
    backup.purchases[0].documents = [{ id: 'evil', name: 'file', kind: 'other', mimeType: null, ...{ uri: 'proofpilot-file:private' } }];
    expect(parseBackup(JSON.stringify(backup))[0].documents[0].uri).toBeNull();
  });
  test.each(['{', 'null', '[]', '{"schemaVersion":99}', '"text"'])('rejects malformed envelope %s', value => expect(() => parseBackup(value)).toThrow());
  test.each([
    { price: -1 }, { price: 1.001 }, { price: '12' }, { purchaseDate: '2025-02-29' },
    { warrantyEnd: '1900-01-01' }, { documents: null }, { deadlines: [{ id: 'x', title: 'X', type: 'custom', date: null }] },
  ])('rejects invalid record %p', patch => {
    const backup = JSON.parse(raw()); Object.assign(backup.purchases[0], patch);
    expect(() => parseBackup(JSON.stringify(backup))).toThrow();
  });
  test('rejects duplicate IDs including string/number ambiguity', () => {
    const backup = JSON.parse(raw()); backup.purchases = [{ ...item, id: 1 }, { ...item, id: '1' }];
    expect(() => parseBackup(JSON.stringify(backup))).toThrow();
  });
  test('restores new IDs, not foreign account IDs or tombstoned IDs', () => {
    let id = 0; const restored = prepareRestoration(parseBackup(raw()), () => `new-${id++}`);
    expect(restored[0].id).toBe('new-0');
    expect(restored[0].name).toBe(item.name);
    expect(restored[0].documents.every(d => !d.uri)).toBe(true);
  });
});

describe('deletion wins synchronization', () => {
  test('remote deletion removes stale cached data and pending uploads', () => {
    const state = { ...snapshotFor([item, { ...item, id: 'keep' }]), pending: [item.id, 'keep'], deleted: [item.id] };
    const result = applyRemoteDeletions(state, [String(item.id)]);
    expect(result.items.map(p => p.id)).toEqual(['keep']);
    expect(result.pending).toEqual(['keep']); expect(result.deleted).toEqual([]);
    expect(state.items).toHaveLength(2);
  });
  test('repeat deletion reconciliation is idempotent', () => {
    const first = applyRemoteDeletions(snapshotFor([item]), [String(item.id)]);
    expect(applyRemoteDeletions(first, [String(item.id)])).toEqual(first);
  });
});

describe('document safety', () => {
  test.each([0, -1, NaN, 20 * 1024 * 1024 + 1])('rejects invalid file size %s', size => expect(() => validateDocumentSize(size)).toThrow());
  test('allows 20MB PDF but not active HTML/SVG/executables', () => {
    expect(() => validateDocumentSize(20 * 1024 * 1024)).not.toThrow();
    expect(() => validateDocumentName('receipt.PDF')).not.toThrow();
    for (const name of ['receipt.svg', 'receipt.html', 'receipt.pdf.exe']) expect(() => validateDocumentName(name)).toThrow();
  });
  test('only deletes generated names inside its own directory', () => {
    expect(isOwnedDocumentUri('file:///app/proofpilot-documents/123-abc.pdf', 'file:///app/')).toBe(true);
    for (const uri of ['file:///app/secrets', 'file:///app/proofpilot-documents/../secret', 'file:///app/proofpilot-documents/%2e%2e/secret', 'https://example.com']) expect(isOwnedDocumentUri(uri, 'file:///app/')).toBe(false);
  });
  test('AI context does not automatically disclose serial numbers or private notes', () => {
    expect(JSON.stringify(contextFor({ ...item, serial: 'secret-serial', notes: 'private-note' }))).not.toMatch(/secret-serial|private-note/);
  });
});
