import type { TimetableEntry } from "@/types/database";
import {
  timeToMinutes,
  entryMatchesDate,
  dateStringToDow,
} from "./Timetableutils";

// ── Overlap check ─────────────────────────────────────────────────────────────

function doTimesOverlap(
  s1: string,
  e1: string,
  s2: string,
  e2: string,
): boolean {
  return (
    timeToMinutes(s1) < timeToMinutes(e2) &&
    timeToMinutes(s2) < timeToMinutes(e1)
  );
}

// ── Candidate filtering ───────────────────────────────────────────────────────

/**
 * Returns existing entries that share the same day as `newEntry`.
 * Handles cross-type conflicts: a recurring Monday entry conflicts with a
 * one-time entry that falls on a Monday.
 */
function sameDayCandidates(
  entries: TimetableEntry[],
  newEntry: Partial<TimetableEntry>,
  excludeId?: string,
): TimetableEntry[] {
  return entries.filter((e) => {
    if (e.id === excludeId) return false;

    // If the new entry is one-time, check against its specific date
    if (newEntry.entry_type === "once" && newEntry.specific_date) {
      const [y, m, d] = newEntry.specific_date.split("-").map(Number);
      const targetDate = new Date(y, m - 1, d);
      return entryMatchesDate(e, targetDate);
    }

    // New entry is recurring — check day_of_week match
    return e.day_of_week === newEntry.day_of_week;
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ConflictResult {
  hasConflict: boolean;
  conflicting?: TimetableEntry;
  message: string;
}

/**
 * Checks whether `newEntry` conflicts with any existing `entries`.
 *
 * @param entries     Current list of entries in state
 * @param newEntry    The entry being added or updated (partial shape)
 * @param isUpdate    Pass true when editing; will exclude the entry's own id
 */
export function detectConflict(
  entries: TimetableEntry[],
  newEntry: Partial<TimetableEntry>,
  isUpdate = false,
): ConflictResult {
  const excludeId = isUpdate ? newEntry.id : undefined;
  const candidates = sameDayCandidates(entries, newEntry, excludeId);

  for (const e of candidates) {
    if (
      newEntry.start_time &&
      newEntry.end_time &&
      doTimesOverlap(
        newEntry.start_time,
        newEntry.end_time,
        e.start_time,
        e.end_time,
      )
    ) {
      const dayLabel =
        e.entry_type === "once" && e.specific_date
          ? `on ${e.specific_date}`
          : `every ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][e.day_of_week]}`;

      return {
        hasConflict: true,
        conflicting: e,
        message: `Time conflict with "${e.title}" (${e.start_time}–${e.end_time} ${dayLabel})`,
      };
    }
  }

  return { hasConflict: false, message: "" };
}

/**
 * Validate a batch of entries, returning which ones pass and which conflict.
 */
export function detectBatchConflicts(
  existingEntries: TimetableEntry[],
  newEntries: Partial<TimetableEntry>[],
): {
  passed: Partial<TimetableEntry>[];
  failed: { entry: Partial<TimetableEntry>; reason: string }[];
} {
  const passed: Partial<TimetableEntry>[] = [];
  const failed: { entry: Partial<TimetableEntry>; reason: string }[] = [];
  // Accumulate as we go so we also check within the batch
  const accumulated: TimetableEntry[] = [...existingEntries];

  for (const entry of newEntries) {
    const result = detectConflict(accumulated, entry, false);
    if (result.hasConflict) {
      failed.push({ entry, reason: result.message });
    } else {
      passed.push(entry);
      // Add a synthetic version so subsequent entries in the batch see it
      accumulated.push(entry as TimetableEntry);
    }
  }

  return { passed, failed };
}
