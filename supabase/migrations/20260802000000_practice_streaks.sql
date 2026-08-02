-- Practice consistency tracking: one row per user per local practice day,
-- logged client-side on musical activity (analyze / play / ear-training win).
CREATE TABLE IF NOT EXISTS public.practice_log (
  user_id UUID NOT NULL,
  day DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.practice_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own practice log" ON public.practice_log;
CREATE POLICY "Users manage own practice log" ON public.practice_log
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Weekly practice goal (days per week)
CREATE TABLE IF NOT EXISTS public.practice_goals (
  user_id UUID PRIMARY KEY,
  goal_days INT NOT NULL DEFAULT 5 CHECK (goal_days BETWEEN 1 AND 7),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.practice_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own practice goal" ON public.practice_goals;
CREATE POLICY "Users manage own practice goal" ON public.practice_goals
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
