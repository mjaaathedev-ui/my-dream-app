import type { TimetableEntry } from '@/types/database';

export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function getWeekOfMonth(date: Date): number {
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstDayOfWeek = firstDayOfMonth.getDay();
  return Math.floor((date.getDate() + firstDayOfWeek - 1) / 7) + 1;
}

export function entryMatchesDate(entry: TimetableEntry, date: Date): boolean {
  const dow = (date.getDay() + 6) % 7; // JS → DB day index

  if (entry.entry_type === 'once') {
    if (!entry.specific_date) return false;
    // Parse as local date to avoid UTC-shift surprises
    const [y, m, d] = entry.specific_date.split('-').map(Number);
    return (
      date.getFullYear() === y &&
      date.getMonth() === m - 1 &&
      date.getDate() === d
    );
  }

  // Recurring (default for legacy entries that have no entry_type)
  if (entry.day_of_week !== dow) return false;

  const recurrence = entry.recurrence ?? 'weekly';
  if (recurrence === 'weekly') return true;
  if (recurrence === 'biweekly') return getWeekNumber(date) % 2 === 0;
  if (recurrence === 'monthly') return getWeekOfMonth(date) === 1;

  return true;
}

export function getEntriesForDate(
  entries: TimetableEntry[],
  date: Date,
): TimetableEntry[] {
  return entries.filter((e) => entryMatchesDate(e, date));
}

/** Returns the 7 dates (Mon–Sun) for the week containing `date`. */
export function getWeekDates(date: Date): Date[] {
  const dow = (date.getDay() + 6) % 7; // 0=Mon
  const monday = new Date(date);
  monday.setDate(date.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToPx(minutes: number, pxPerHour = 72): number {
  return (minutes / 60) * pxPerHour;
}

export function recurrenceLabel(recurrence: string): string {
  switch (recurrence) {
    case 'biweekly': return 'Every 2 weeks';
    case 'monthly':  return 'Monthly';
    default:         return 'Every week';
  }
}

export const DAY_NAMES_FULL  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Convert JS Date to DB day_of_week (0=Mon … 6=Sun) */
export function dateToDow(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** Convert YYYY-MM-DD string to DB day_of_week */
export function dateStringToDow(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return dateToDow(new Date(y, m - 1, d));
}