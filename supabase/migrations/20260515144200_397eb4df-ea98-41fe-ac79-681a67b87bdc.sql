ALTER TABLE public.modules
  ADD COLUMN IF NOT EXISTS chapters_total integer,
  ADD COLUMN IF NOT EXISTS chapters_done integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difficulty_rating integer;