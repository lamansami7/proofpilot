import { parseIsoDate } from './date';

export type Urgency = 'critical' | 'warning' | 'normal' | 'expired';

/** Calendar-day difference using UTC components, avoiding DST/time-of-day drift. */
export function daysUntil(date: string, now = new Date()): number {
  const parsed = parseIsoDate(date);
  if (!parsed) throw new Error('Invalid deadline date');
  const target = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}
export function urgencyFor(days: number): Urgency { return days < 0 ? 'expired' : days <= 2 ? 'critical' : days <= 14 ? 'warning' : 'normal'; }
