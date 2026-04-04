import type { TimetableEntry, Module } from '@/types/database';
import { DAY_NAMES_SHORT } from '../utils/Timetableutils';


export function formatTimetableState(
  entries: TimetableEntry[],
  modules: Module[],
): string {
  if (entries.length === 0) return 'Current timetable is empty.';

  const lines = entries.map((e) => {
    const mod = modules.find((m) => m.id === e.module_id);
    const scheduleStr =
      e.entry_type === 'once' && e.specific_date
        ? `Date: ${e.specific_date}`
        : `Day: ${DAY_NAMES_SHORT[e.day_of_week]}, Recurrence: ${e.recurrence ?? 'weekly'}`;

    return `- ID: ${e.id}
  Title: ${e.title}
  Type: ${e.entry_type === 'once' ? 'One-time' : 'Recurring'}
  ${scheduleStr}
  Time: ${e.start_time}–${e.end_time}
  Module: ${mod?.name ?? 'None'}
  Location: ${e.location || 'None'}
  Category: ${e.category ?? 'None'}
  Notes: ${e.notes || 'None'}`;
  });

  return `Current timetable entries:\n\n${lines.join('\n\n')}`;
}

// ── System instruction ────────────────────────────────────────────────────────

export function buildTimetableSystemPrompt(
  entries: TimetableEntry[],
  modules: Module[],
  fullAppContext?: string,  // ← full app context passed in from the page
): string {
  const state = formatTimetableState(entries, modules);
  const moduleList =
    modules.length > 0
      ? modules.map((m) => `- ${m.name} (${m.code})`).join('\n')
      : 'No modules registered.';

  return `You are an intelligent timetable assistant embedded in a student study app.
Your job is to help the student manage their weekly timetable through natural conversation.
You have full visibility into all app data (grades, study sessions, goals, assessments) so you can make smart scheduling decisions.

You can:
- Add one-time entries (specific date) or recurring entries (day of week)
- Delete entries by ID or by description
- Answer questions about the student's schedule
- Suggest study slots based on free time, upcoming assessments, and workload
- Consider the student's grades and goals when suggesting study priorities

ALWAYS respond with a JSON object. No markdown, no prose — only JSON.

Response schema:
{
  "action": "add" | "add_multiple" | "delete" | "delete_multiple" | "chat",
  "message": "Human-readable confirmation or question (always included)",
  "error": false | true,

  // For action="add" (single entry):
  "entry": {
    "title": string,
    "entry_type": "once" | "recurring",
    "specific_date": "YYYY-MM-DD" | null,   // required if entry_type="once"
    "day_of_week": 0-6,                      // 0=Mon, required if entry_type="recurring"
    "recurrence": "weekly" | "biweekly" | "monthly",
    "start_time": "HH:MM",
    "end_time": "HH:MM",
    "type": "class" | "tutorial" | "practical" | "study" | "personal" | "assessment",
    "location": string,
    "notes": string,
    "color": "#hex",
    "module_id": string | null               // match from known modules list
  },

  // For action="add_multiple":
  "entries": [ /* same shape as entry above */ ],

  // For action="delete":
  "id": string,

  // For action="delete_multiple":
  "ids": string[],

  // For action="chat" (no DB change needed):
  // Only "message" and "action" are required
}

Rules:
- Times must be HH:MM (24-hour format)
- day_of_week: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, 5=Saturday, 6=Sunday
- If user says "next Monday" or "this Friday", calculate the actual date (today: ${new Date().toISOString().split('T')[0]})
- If user says "every Monday" or "Mondays", use entry_type="recurring"
- If information is missing, set action="chat", error=true, and ask in "message"
- Never invent IDs — only use IDs from the timetable state below
- If deleting by description, find the matching entry in the state and use its ID
- When suggesting study slots, consider the student's upcoming assessments and current grades

Available modules:
${moduleList}

${state}
${fullAppContext ? `\n=== FULL STUDENT CONTEXT (for smart scheduling) ===\n${fullAppContext}` : ''}`;
}

export interface TimetableAIResponse {
  action: 'add' | 'add_multiple' | 'delete' | 'delete_multiple' | 'chat';
  message: string;
  error: boolean;
  entry?: Partial<import('@/types/database').TimetableEntry>;
  entries?: Partial<import('@/types/database').TimetableEntry>[];
  id?: string;
  ids?: string[];
}

export function parseTimetableAIResponse(raw: string): TimetableAIResponse | null {
  let cleaned = raw.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned) as TimetableAIResponse;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]) as TimetableAIResponse; } catch {}
    }
    return null;
  }
}