import { migratePurchases } from './purchaseMigration';
import type { Purchase } from '../types/purchase';

export type Snapshot = { version: 2; items: Purchase[]; pending: Array<Purchase['id']>; deleted: Array<Purchase['id']> };
export const snapshotFor = (items: Purchase[] = []): Snapshot => ({ version: 2, items, pending: [], deleted: [] });
export function readSnapshot(raw: string | null): Snapshot {
  if (!raw) return snapshotFor();
  const value = JSON.parse(raw);
  if (Array.isArray(value)) return snapshotFor(migratePurchases(value));
  if (!value || value.version !== 2 || !Array.isArray(value.items) || !Array.isArray(value.pending) || !Array.isArray(value.deleted)) throw new Error('Unrecognized saved record format.');
  const ids = (values: unknown[]) => values.filter((id): id is Purchase['id'] => typeof id === 'string' || typeof id === 'number');
  return { version: 2, items: migratePurchases(value.items), pending: ids(value.pending), deleted: ids(value.deleted) };
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
  constructor(private write: (snapshot: Snapshot) => Promise<void>) {}
  mutate(change: (current: Snapshot) => Snapshot): Promise<Snapshot> {
    const operation = this.queue.then(async () => {
      const next = change(this.snapshot);
      await this.write(next);
      this.snapshot = next;
      return next;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}
