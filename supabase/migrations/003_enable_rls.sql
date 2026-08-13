-- Row Level Security.
-- The backend talks to Postgres with the service-role key, which bypasses RLS,
-- so these policies do not affect it. They exist to close off the anon key,
-- which the browser holds and could otherwise use to read every row.

ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_analyses ENABLE ROW LEVEL SECURITY;

-- users: each account sees only its own row
DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
    FOR SELECT USING (auth.uid() = id);

-- process_analyses: owner-only access
DROP POLICY IF EXISTS analyses_select_own ON public.process_analyses;
CREATE POLICY analyses_select_own ON public.process_analyses
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS analyses_insert_own ON public.process_analyses;
CREATE POLICY analyses_insert_own ON public.process_analyses
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS analyses_update_own ON public.process_analyses;
CREATE POLICY analyses_update_own ON public.process_analyses
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS analyses_delete_own ON public.process_analyses;
CREATE POLICY analyses_delete_own ON public.process_analyses
    FOR DELETE USING (auth.uid() = user_id);
