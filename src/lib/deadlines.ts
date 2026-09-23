export type Urgency = 'critical' | 'warning' | 'normal' | 'expired';
/** Calendar-day difference avoids DST/time-of-day drift for purchase deadlines. */
export function daysUntil(date: string, now = new Date()): number {
  const target = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  if (Number.isNaN(target.getTime())) throw new Error('Invalid deadline date');
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}
export function urgencyFor(days: number): Urgency { return days < 0 ? 'expired' : days <= 2 ? 'critical' : days <= 14 ? 'warning' : 'normal'; }
