CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- users (synced from auth.users via trigger — same as other modules)
CREATE TABLE IF NOT EXISTS public.users (
    id         UUID PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- process analyses
CREATE TABLE IF NOT EXISTS public.process_analyses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',  -- pending | running | done | failed
    report        TEXT,           -- markdown report produced by the agent
    charts        JSONB DEFAULT '[]',   -- [{title, image_b64}]
    agent_steps   JSONB DEFAULT '[]',   -- [{step, code, stdout, error, images_count}]
    iterations    INTEGER DEFAULT 0,
    error_message TEXT,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX process_analyses_user_id_idx ON public.process_analyses(user_id);
CREATE INDEX process_analyses_created_at_idx ON public.process_analyses(created_at DESC);

-- trigger: sync Supabase Auth → public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (new.id, new.email, split_part(new.email, '@', 1))
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
