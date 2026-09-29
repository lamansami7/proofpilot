import { coverageBadge, customDeadlineBadge } from '../coverage';

const NOW = new Date('2026-06-15T09:00:00');
const iso = (days: number) => {
  const date = new Date(NOW);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

describe('coverage badges name the window and never invent a date', () => {
  test('return window wording', () => {
    expect(coverageBadge('return', iso(30), NOW)).toEqual({ label: 'Return available', tone: 'success' });
    // A week out is already "soon" — that is the point a user acts.
    expect(coverageBadge('return', iso(8), NOW)).toEqual({ label: 'Return available', tone: 'success' });
    expect(coverageBadge('return', iso(7), NOW)).toEqual({ label: 'Return closes soon', tone: 'warning' });
    expect(coverageBadge('return', iso(6), NOW)).toEqual({ label: 'Return closes soon', tone: 'warning' });
    expect(coverageBadge('return', iso(0), NOW)).toEqual({ label: 'Return closes today', tone: 'danger' });
    expect(coverageBadge('return', iso(-1), NOW)).toEqual({ label: 'Return period passed', tone: 'danger' });
  });

  test('warranty wording differs from return wording for the same offset', () => {
    expect(coverageBadge('warranty', iso(30), NOW)).toEqual({ label: 'Warranty active', tone: 'success' });
    expect(coverageBadge('warranty', iso(3), NOW)).toEqual({ label: 'Warranty expiring soon', tone: 'warning' });
    expect(coverageBadge('warranty', iso(0), NOW)).toEqual({ label: 'Warranty expires today', tone: 'danger' });
    expect(coverageBadge('warranty', iso(-30), NOW)).toEqual({ label: 'Warranty expired', tone: 'danger' });
  });

  test('a missing date is "Not added", never a guessed period', () => {
    expect(coverageBadge('return', null, NOW)).toEqual({ label: 'Not added', tone: 'neutral' });
    expect(coverageBadge('warranty', null, NOW)).toEqual({ label: 'Not added', tone: 'neutral' });
    expect(coverageBadge('return', '', NOW)).toEqual({ label: 'Not added', tone: 'neutral' });
  });

  test('urgency is never understated: closer dates are never calmer', () => {
    const order = [40, 20, 7, 3, 0, -1].map((days) => {
      const { tone } = coverageBadge('warranty', iso(days), NOW);
      return { success: 0, warning: 1, danger: 2, neutral: 3 }[tone];
    });
    for (let index = 1; index < order.length; index++) {
      expect(order[index]).toBeGreaterThanOrEqual(order[index - 1]);
    }
  });

  test('a custom deadline never claims to be a return or warranty window', () => {
    expect(customDeadlineBadge(iso(40), NOW)).toEqual({ label: '40 days away', tone: 'success' });
    expect(customDeadlineBadge(iso(2), NOW)).toEqual({ label: 'Coming up soon', tone: 'warning' });
    expect(customDeadlineBadge(iso(0), NOW)).toEqual({ label: 'Today', tone: 'warning' });
    expect(customDeadlineBadge(iso(-2), NOW)).toEqual({ label: 'Date passed', tone: 'danger' });
    for (const label of [customDeadlineBadge(iso(1), NOW).label, customDeadlineBadge(iso(-5), NOW).label])
      expect(label).not.toMatch(/return|warranty/i);
  });

  test('badges describe only the stored date and never a different one', () => {
    // The label carries no date of its own; the UI renders the real stored value.
    const badge = coverageBadge('return', iso(3), NOW);
    expect(badge.label).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(badge.label).not.toContain(String(NOW.getFullYear()));
  });
});
