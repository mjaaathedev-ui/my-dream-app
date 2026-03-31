import { supabase } from '@/integrations/supabase/client';

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

interface CalendarEvent {
  title: string;
  date: string; // ISO date string
  description?: string;
  reminderDays?: number[];
}

/**
 * Get a valid Google access token, refreshing if expired.
 * Returns null if user has no Google connection.
 */
async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  // Check if we have tokens and if they're expired
  const { data: tokenRow } = await supabase
    .from('google_tokens')
    .select('*')
    .single();

  if (!tokenRow) return null;

  // If token expires within 5 minutes, refresh it
  const expiresAt = new Date(tokenRow.expires_at).getTime();
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    const res = await fetch(`${FUNCTIONS_BASE}/google-oauth?action=refresh`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token;
  }

  return tokenRow.access_token;
}

/**
 * Check if user has connected Google
 */
export async function isGoogleConnected(): Promise<boolean> {
  const { data } = await supabase
    .from('google_tokens')
    .select('id')
    .single();
  return !!data;
}

/**
 * Create a Google Calendar event
 */
export async function createCalendarEvent(
  event: CalendarEvent
): Promise<string | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  const eventDate = new Date(event.date);

  const reminders = event.reminderDays?.map(days => ({
    method: 'popup',
    minutes: days * 24 * 60,
  })) || [];

  const calendarEvent = {
    summary: event.title,
    description: event.description || '',
    start: {
      dateTime: eventDate.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: new Date(eventDate.getTime() + 60 * 60 * 1000).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    reminders: {
      useDefault: false,
      overrides: reminders,
    },
  };

  try {
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(calendarEvent),
      }
    );

    if (!res.ok) {
      console.error('Google Calendar API error:', await res.text());
      return null;
    }

    const data = await res.json();
    return data.id;
  } catch (err) {
    console.error('Failed to create calendar event:', err);
    return null;
  }
}

/**
 * Delete a Google Calendar event
 */
export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  const accessToken = await getAccessToken();
  if (!accessToken) return false;

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/**
 * Sync a timetable entry as a recurring Google Calendar event
 */
export async function syncTimetableEntry(entry: {
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location?: string;
  recurring?: boolean;
  color?: string;
}): Promise<string | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  // Calculate the next occurrence of this day
  const now = new Date();
  const currentDay = now.getDay();
  // Convert our day_of_week (0=Mon) to JS day (0=Sun)
  const targetJsDay = (entry.day_of_week + 1) % 7;
  let daysUntil = targetJsDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7;

  const nextDate = new Date(now);
  nextDate.setDate(now.getDate() + daysUntil);

  const [startH, startM] = entry.start_time.split(':').map(Number);
  const [endH, endM] = entry.end_time.split(':').map(Number);

  const startDateTime = new Date(nextDate);
  startDateTime.setHours(startH, startM, 0, 0);
  const endDateTime = new Date(nextDate);
  endDateTime.setHours(endH, endM, 0, 0);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dayNames = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

  const calendarEvent: Record<string, unknown> = {
    summary: entry.title,
    location: entry.location || '',
    start: { dateTime: startDateTime.toISOString(), timeZone: tz },
    end: { dateTime: endDateTime.toISOString(), timeZone: tz },
  };

  if (entry.recurring) {
    calendarEvent.recurrence = [`RRULE:FREQ=WEEKLY;BYDAY=${dayNames[entry.day_of_week]}`];
  }

  try {
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(calendarEvent),
      }
    );

    if (!res.ok) {
      console.error('Failed to sync timetable entry:', await res.text());
      return null;
    }

    const data = await res.json();
    return data.id;
  } catch (err) {
    console.error('Timetable sync error:', err);
    return null;
  }
}
