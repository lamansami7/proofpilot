const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a calendar date without allowing JavaScript's date rollover. */
export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth ? { year, month, day } : null;
}

export function isValidIsoDate(value: string): boolean { return parseIsoDate(value) !== null; }

export function calendarDate(value: string): Date | null {
  const parsed = parseIsoDate(value);
  return parsed ? new Date(parsed.year, parsed.month - 1, parsed.day, 12) : null;
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addCalendarDays(baseIso: string | null, days: number, fallback = new Date()): string {
  const parsed = baseIso ? parseIsoDate(baseIso) : null;
  const date = parsed ? new Date(parsed.year, parsed.month - 1, parsed.day, 12) : new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 12);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}
