import { queueRemovedFiles } from './documentCleanup';
import { migratePurchases } from './purchaseMigration';
import type { Purchase } from '../types/purchase';

export type Snapshot = { version: 2; cleanup?: string[]; items: Purchase[]; pending: Array<Purchase['id']>; deleted: Array<Purchase['id']> };
export const PURCHASE_STORAGE_KEY = 'proofpilot.v1.purchases';

/** Signed-in accounts get an isolated storage slot; signed-out devices share the local slot. */
export function storageKeyFor(userId?: string | null): string {
  return userId ? `${PURCHASE_STORAGE_KEY}.account.${userId}` : PURCHASE_STORAGE_KEY;
}

export const snapshotFor = (items: Purchase[] = []): Snapshot => ({ version: 2, items, pending: [], deleted: [] });
export function readSnapshot(raw: string | null): Snapshot {
  if (!raw) return snapshotFor();
  const value = JSON.parse(raw);
  if (Array.isArray(value)) return snapshotFor(migratePurchases(value));
  if (!value || value.version !== 2 || !Array.isArray(value.items) || !Array.isArray(value.pending) || !Array.isArray(value.deleted)) throw new Error('Unrecognized saved record format.');
  const ids = (values: unknown[]) => values.filter((id): id is Purchase['id'] => typeof id === 'string' || typeof id === 'number');
  return { version: 2, items: migratePurchases(value.items), pending: ids(value.pending), deleted: ids(value.deleted), ...(Array.isArray(value.cleanup) ? { cleanup: value.cleanup.filter((uri: unknown): uri is string => typeof uri === 'string') } : {}) };
}

/** Cloud records never replace pending local work, and device files never leave this device. */
export function mergeCloud(snapshot: Snapshot, cloud: Purchase[]): Snapshot {
  const items = new Map(snapshot.items.map(item => [item.id, item]));
  for (const item of cloud) {
    if (snapshot.deleted.includes(item.id) || snapshot.pending.includes(item.id)) continue;
    const local = items.get(item.id);
    items.set(item.id, { ...item, documents: item.documents.map(document => ({ ...document, uri: local?.documents.find(d => d.id === document.id)?.uri ?? null })) });
  }
  return { ...snapshot, items: [...items.values()] };
}

/** Evaluates mutations inside the queue, not against a stale React render. */
export class LocalPurchaseStore {
  snapshot = snapshotFor();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private write: (snapshot: Snapshot) => Promise<void>,
    private read?: () => Promise<Snapshot>,
    private lock: (operation: () => Promise<Snapshot>) => Promise<Snapshot> = operation => operation(),
  ) {}
  async drain(): Promise<void> { await this.queue; }
  mutate(change: (current: Snapshot) => Snapshot): Promise<Snapshot> {
    const operation = this.queue.then(() => this.lock(async () => {
      if (this.read) this.snapshot = await this.read();
      const next = queueRemovedFiles(this.snapshot, change(this.snapshot));
      await this.write(next);
      this.snapshot = next;
      return next;
    }));
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}

/** Insert-or-replace by id. Repeating the same save never duplicates a record. */
export function upsertItem(snapshot: Snapshot, purchase: Purchase, signedIn: boolean): Snapshot {
  const exists = snapshot.items.some((item) => item.id === purchase.id);
  return {
    ...snapshot,
    items: exists ? snapshot.items.map((item) => (item.id === purchase.id ? purchase : item)) : [purchase, ...snapshot.items],
    pending: signedIn ? [...new Set([...snapshot.pending, purchase.id])] : snapshot.pending,
    deleted: snapshot.deleted.filter((id) => id !== purchase.id),
  };
}

/** Removing an unsaved record must not create a cloud tombstone for it. */
export function removeItem(snapshot: Snapshot, id: Purchase['id'], signedIn: boolean): Snapshot {
  const existed = snapshot.items.some((item) => item.id === id);
  return {
    ...snapshot,
    items: snapshot.items.filter((item) => item.id !== id),
    pending: snapshot.pending.filter((value) => value !== id),
    deleted: signedIn && existed ? [...new Set([...snapshot.deleted, id])] : snapshot.deleted.filter((value) => value !== id),
  };
}

/** Bulk replace (clear/restore samples): queue uploads for kept records, tombstone removed ones. */
export function replaceItems(snapshot: Snapshot, next: Purchase[], signedIn: boolean): Snapshot {
  const kept = new Set(next.map((item) => item.id));
  const tombstones = new Set([...(signedIn ? snapshot.deleted : []), ...snapshot.items.filter((item) => !kept.has(item.id)).map((item) => item.id)]);
  kept.forEach((id) => tombstones.delete(id));
  return {
    ...snapshot,
    version: 2,
    items: next,
    pending: signedIn ? next.map((item) => item.id) : [],
    deleted: signedIn ? [...tombstones] : [],
  };
}

/** Permanent server tombstones win over stale device edits, including queued uploads. */
export function applyRemoteDeletions(snapshot: Snapshot, deletedIds: string[]): Snapshot {
  const deleted = new Set(deletedIds);
  return {
    ...snapshot,
    items: snapshot.items.filter(item => !deleted.has(String(item.id))),
    pending: snapshot.pending.filter(id => !deleted.has(String(id))),
    deleted: snapshot.deleted.filter(id => !deleted.has(String(id))),
  };
}
