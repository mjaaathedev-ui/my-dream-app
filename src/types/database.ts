// Application-level types derived from database schema

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  institution: string;
  degree: string;
  year_of_study: string;
  career_goal: string;
  career_field: string;
  why_it_matters: string;
  target_average: number;
  funding_condition: string;
  has_funding_condition: boolean;
  whatsapp_number: string;
  whatsapp_enabled: boolean;
  whatsapp_verified: boolean;
  timezone: string;
  onboarding_completed: boolean;
  daily_study_target_hours: number;
  default_session_type: string;
  default_pomodoro_minutes: number;
  email_reminders_enabled: boolean;
  reminder_days_before: number;
  preferred_checkin_time: string;
  created_at: string;
  updated_at: string;
  google_calendar_id?: string;
  checkin_interval_hours?: number;
}

export interface Module {
  id: string;
  user_id: string;
  name: string;
  code: string;
  credit_weight: number;
  color: string;
  semester: string;
  year: string;
  archived: boolean;
  notes: string;
  sort_order: number;
  created_at: string;
}

export interface Assessment {
  id: string;
  user_id: string;
  module_id: string;
  name: string;
  type: 'test' | 'assignment' | 'exam' | 'practical' | 'project';
  due_date: string | null;
  weight_percent: number;
  mark_achieved: number | null;
  max_mark: number;
  submitted: boolean;
  notes: string;
  google_event_id?: string | null;
  created_at: string;
  module?: Module;
}

export interface StudySession {
  id: string;
  user_id: string;
  module_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  topic: string;
  energy_level: number;
  energy_level_after: number | null;
  reflection: string;
  distractions_count: number;
  session_type: string;
  created_at: string;
  module?: Module;
}

export interface UploadedFile {
  id: string;
  user_id: string;
  module_id: string | null;
  file_name: string;
  file_path: string;
  file_type: string;
  size_bytes: number;
  extracted_text: string;
  description: string;
  upload_date: string;
}

// ── Extended TimetableEntry ───────────────────────────────────────────────────

export interface TimetableEntry {
  id: string;
  user_id: string;
  title: string;

  /** Visual / semantic type of the block */
  type: string;

  /**
   * Scheduling type:
   *   'once'      — appears only on `specific_date`
   *   'recurring' — repeats on `day_of_week` with `recurrence` pattern
   */
  entry_type: 'once' | 'recurring';

  /**
   * ISO date string (YYYY-MM-DD) for one-time entries.
   * null for recurring entries.
   */
  specific_date: string | null;

  /**
   * 0 = Monday … 6 = Sunday  (DB convention, NOT JS getDay())
   * For one-time entries this is derived from specific_date on save.
   * For recurring entries this is the authoritative day.
   */
  day_of_week: number;

  /** How often the entry repeats (only relevant for recurring entries) */
  recurrence: 'weekly' | 'biweekly' | 'monthly';

  start_time: string;   // "HH:MM" 24-hour
  end_time: string;     // "HH:MM" 24-hour
  location: string;
  notes: string | null;
  category: string | null;
  module_id: string | null;

  /** Keep for Google Calendar sync compatibility */
  recurring: boolean;

  color: string;
  is_suggested: boolean;
  created_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  type: 'semester' | 'module' | 'career' | 'funding';
  title: string;
  description: string;
  target_value: number | null;
  current_value: number;
  deadline: string | null;
  achieved: boolean;
  created_at: string;
}

export interface JournalEntry {
  id: string;
  user_id: string;
  entry_type: 'reflection' | 'future_self' | 'monthly_review';
  content: string;
  module_id: string | null;
  assessment_id: string | null;
  created_at: string;
}

export interface ExamSession {
  id: string;
  user_id: string;
  module_id: string;
  paper_content: string;
  time_limit_minutes: number;
  started_at: string;
  ended_at: string | null;
  focus_score: number;
  time_away_seconds: number;
  answers: any[];
  ai_feedback: string;
  created_at: string;
  module?: Module;
}

export interface Quote {
  id: string;
  career_field: string;
  author: string;
  text: string;
  created_at: string;
}

export interface NotificationLog {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  sent_at: string;
  read: boolean;
}

export interface AIConversation {
  id: string;
  user_id: string;
  module_id: string | null;
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  context_summary: string;
  created_at: string;
  updated_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const CAREER_FIELDS = [
  'Engineering',
  'Medicine',
  'Law',
  'Commerce',
  'Sciences',
  'Humanities',
  'Architecture',
  'Other',
] as const;

export const YEAR_OPTIONS = [
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year',
  'Honours',
  'Masters',
] as const;

export const ASSESSMENT_TYPES = [
  'test',
  'assignment',
  'exam',
  'practical',
  'project',
] as const;

export const SESSION_TYPES = [
  { value: 'pomodoro',     label: 'Pomodoro (50/10)',      work: 50, break: 10 },
  { value: 'deep_work',   label: 'Deep Work (90 min)',     work: 90, break: 15 },
  { value: 'quick_review',label: 'Quick Review (25 min)',  work: 25, break: 5  },
  { value: 'custom',      label: 'Custom',                 work: 0,  break: 0  },
] as const;

export const MODULE_COLORS = [
  '#2563EB', '#DC2626', '#16A34A', '#D97706', '#7C3AED',
  '#DB2777', '#0891B2', '#65A30D', '#EA580C', '#4F46E5',
] as const;

export const TIMETABLE_ENTRY_TYPES = [
  'class', 'tutorial', 'practical', 'study', 'personal', 'assessment',
] as const;

export const TIMETABLE_ENTRY_COLORS: Record<string, string> = {
  class:      '#2563EB',
  tutorial:   '#7C3AED',
  practical:  '#0891B2',
  study:      '#16A34A',
  personal:   '#D97706',
  assessment: '#DC2626',
};

export const TIMETABLE_CATEGORIES = [
  'Lecture',
  'Tutorial',
  'Practical',
  'Study',
  'Assignment',
  'Exam',
  'Personal',
  'Other',
] as const;