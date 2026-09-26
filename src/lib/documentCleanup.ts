import type { Purchase } from '../types/purchase';
import type { Snapshot } from './localPurchaseStore';
export const documentUris = (items: Purchase[]) => new Set(items.flatMap(p => p.documents.map(d => d.uri).filter((uri): uri is string => Boolean(uri))));
/** Save cleanup intent in the SAME write as removing the record reference. */
export function queueRemovedFiles(before: Snapshot, after: Snapshot): Snapshot {
  const kept = documentUris(after.items);
  const removed = [...documentUris(before.items)].filter(uri => !kept.has(uri));
  const cleanup = [...new Set([...(after.cleanup ?? []), ...removed])].filter(uri => !kept.has(uri));
  return cleanup.length || before.cleanup ? { ...after, cleanup } : after;
}
/** Unknown timestamps are not automatically eligible; keep the original safe. */
export function eligibleOrphans(files: Array<{ uri: string; createdAt: number }>, referenced: Set<string>, now = Date.now()) {
  return files.filter(file => Number.isFinite(file.createdAt) && file.createdAt > 0 && file.createdAt < now - 86400000 && !referenced.has(file.uri));
}
