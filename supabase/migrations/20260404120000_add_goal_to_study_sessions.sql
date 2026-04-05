-- Add goal_id to study_sessions so sessions can optionally be linked to a goal
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL;