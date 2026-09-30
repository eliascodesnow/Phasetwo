CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    display_name text NOT NULL CHECK (
        char_length(trim(display_name)) BETWEEN 1 AND 80
    ),
    completed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles enable ROW level security;

DROP policy IF EXISTS "profiles_select_own" ON public.profiles;

CREATE policy "profiles_select_own" ON public.profiles FOR
SELECT TO authenticated USING (id = auth.uid ());

DROP policy IF EXISTS "profiles_insert_own" ON public.profiles;

CREATE policy "profiles_insert_own" ON public.profiles FOR
INSERT
    TO authenticated
WITH
    CHECK (id = auth.uid ());

DROP policy IF EXISTS "profiles_update_own" ON public.profiles;

CREATE policy "profiles_update_own" ON public.profiles FOR
UPDATE TO authenticated USING (id = auth.uid ())
WITH
    CHECK (id = auth.uid ());

GRANT SELECT, INSERT , UPDATE ON public.profiles TO authenticated;

create table if not exists public.user_app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cycle_profile jsonb not null default '{}'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  app_settings jsonb not null default '{}'::jsonb,
  chat_messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

ALTER TABLE public.user_app_state enable ROW level security;

DROP policy IF EXISTS "user_app_state_select_own" ON public.user_app_state;

CREATE policy "user_app_state_select_own" ON public.user_app_state FOR
SELECT TO authenticated USING (user_id = auth.uid ());

DROP policy IF EXISTS "user_app_state_insert_own" ON public.user_app_state;

CREATE policy "user_app_state_insert_own" ON public.user_app_state FOR
INSERT
    TO authenticated
WITH
    CHECK (user_id = auth.uid ());

DROP policy IF EXISTS "user_app_state_update_own" ON public.user_app_state;

CREATE policy "user_app_state_update_own" ON public.user_app_state FOR
UPDATE TO authenticated USING (user_id = auth.uid ())
WITH
    CHECK (user_id = auth.uid ());

GRANT
SELECT,
INSERT
,
UPDATE ON public.user_app_state TO authenticated;