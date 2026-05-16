
ALTER TABLE public.timetable_entries
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'recurring',
  ADD COLUMN IF NOT EXISTS specific_date date,
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled';

CREATE INDEX IF NOT EXISTS idx_timetable_entries_user_date
  ON public.timetable_entries(user_id, specific_date);
