import { deadlineStatus } from './purchaseSelectors';

export type CoverageBadge = { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' };

/** A window is "soon" when it closes inside a week — the point a user acts on it. */
const SOON_DAYS = 7;

/**
 * One honest badge per stored window, using only the value the user actually
 * saved. Nothing here infers a period the user did not enter: a missing date is
 * "Not added", never a guess.
 *
 * The label names the window, because a bare "12 days left" on a return and a
 * warranty row reads as the same kind of event.
 */
export function coverageBadge(kind: 'return' | 'warranty', date: string | null, now = new Date()): CoverageBadge {
  const status = deadlineStatus(date, now);
  if (!date || !status) return { label: 'Not added', tone: 'neutral' };
  if (status.status === 'overdue') return { label: kind === 'return' ? 'Return period passed' : 'Warranty expired', tone: 'danger' };
  if (status.status === 'today') return { label: kind === 'return' ? 'Return closes today' : 'Warranty expires today', tone: 'danger' };
  if (kind === 'return') return status.days <= SOON_DAYS
    ? { label: 'Return closes soon', tone: 'warning' }
    : { label: 'Return available', tone: 'success' };
  return status.days <= SOON_DAYS
    ? { label: 'Warranty expiring soon', tone: 'warning' }
    : { label: 'Warranty active', tone: 'success' };
}

/** Badge for a user-created or rebate deadline. Never implies a return or warranty. */
export function customDeadlineBadge(date: string, now = new Date()): CoverageBadge {
  const status = deadlineStatus(date, now);
  if (!status) return { label: 'Not added', tone: 'neutral' };
  if (status.status === 'overdue') return { label: 'Date passed', tone: 'danger' };
  if (status.status === 'today') return { label: 'Today', tone: 'warning' };
  return { label: status.days <= SOON_DAYS ? 'Coming up soon' : `${status.days} days away`, tone: status.days <= SOON_DAYS ? 'warning' : 'success' };
}
