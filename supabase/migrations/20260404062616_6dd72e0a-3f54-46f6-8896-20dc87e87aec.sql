
-- Tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  module_id UUID NOT NULL,
  goal_id UUID,
  title TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'not_started',
  time_logged_minutes NUMERIC NOT NULL DEFAULT 0,
  due_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tasks" ON public.tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tasks" ON public.tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tasks" ON public.tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tasks" ON public.tasks FOR DELETE USING (auth.uid() = user_id);

-- Task time logs table
CREATE TABLE public.task_time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  minutes NUMERIC NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  logged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.task_time_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own time logs" ON public.task_time_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own time logs" ON public.task_time_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own time logs" ON public.task_time_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own time logs" ON public.task_time_logs FOR DELETE USING (auth.uid() = user_id);

-- Trigger to auto-update updated_at on tasks
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
