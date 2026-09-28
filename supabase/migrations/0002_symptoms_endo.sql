CREATE extension IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) Add fields to the existing cycle_profiles table.
-- -----------------------------------------------------------------------------
ALTER TABLE public.cycle_profiles
ADD COLUMN IF NOT EXISTS family_history_endo boolean;

-- -----------------------------------------------------------------------------
-- 2) symptom_logs
-- -----------------------------------------------------------------------------
create table if not exists public.symptom_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null,
  cycle_day integer not null,
  phase text not null check (phase in ('menstrual', 'follicular', 'ovulatory', 'luteal')),
  pain_score integer not null check (pain_score between 0 and 10),
  pain_locations text[] not null default '{}'::text[],
  symptoms text[] not null default '{}'::text[],
  bleeding text check (bleeding in ('none', 'light', 'medium', 'heavy')),
  impact text not null default 'none' check (impact in ('none', 'some', 'missed_activity')),
  painkillers_helped boolean,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

ALTER TABLE public.symptom_logs
ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE public.symptom_logs
ADD COLUMN IF NOT EXISTS log_date DATE;

ALTER TABLE public.symptom_logs
ADD COLUMN IF NOT EXISTS cycle_day integer;

ALTER TABLE public.symptom_logs
ADD COLUMN IF NOT EXISTS phase text;

ALTER TABLE public.symptom_logs
ADD COLUMN IF NOT EXISTS pain_score integer;

alter table public.symptom_logs
  add column if not exists pain_locations text[] default '{}'::text[];

alter table public.symptom_logs
  add column if not exists symptoms text[] default '{}'::text[];

ALTER TABLE public.symptom_logs
ADD COLUMN IF NOT EXISTS bleeding text;

ALTER TABLE public.symptom_logs
ADD COLUMN IF NOT EXISTS impact text DEFAULT 'none';

ALTER TABLE public.symptom_logs
ADD COLUMN IF NOT EXISTS painkillers_helped boolean;

ALTER TABLE public.symptom_logs
ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.symptom_logs
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.symptom_logs
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.symptom_logs ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.symptom_logs ALTER COLUMN log_date SET NOT NULL;

ALTER TABLE public.symptom_logs
ALTER COLUMN cycle_day
SET
    NOT NULL;

ALTER TABLE public.symptom_logs ALTER COLUMN phase SET NOT NULL;

ALTER TABLE public.symptom_logs
ALTER COLUMN pain_score
SET
    NOT NULL;

ALTER TABLE public.symptom_logs
ALTER COLUMN pain_locations
SET
    NOT NULL;

ALTER TABLE public.symptom_logs ALTER COLUMN symptoms SET NOT NULL;

ALTER TABLE public.symptom_logs ALTER COLUMN impact SET NOT NULL;

ALTER TABLE public.symptom_logs
ALTER COLUMN created_at
SET DEFAULT now();

ALTER TABLE public.symptom_logs
ALTER COLUMN updated_at
SET DEFAULT now();

alter table public.symptom_logs
  alter column pain_locations set default '{}'::text[];

alter table public.symptom_logs
  alter column symptoms set default '{}'::text[];

ALTER TABLE public.symptom_logs
ALTER COLUMN impact
SET DEFAULT 'none';

ALTER TABLE public.symptom_logs
DROP CONSTRAINT IF EXISTS symptom_logs_pkey;

ALTER TABLE public.symptom_logs
ADD CONSTRAINT symptom_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.symptom_logs
DROP CONSTRAINT IF EXISTS symptom_logs_user_id_fkey;

ALTER TABLE public.symptom_logs
ADD CONSTRAINT symptom_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.symptom_logs
DROP CONSTRAINT IF EXISTS symptom_logs_phase_check;

ALTER TABLE public.symptom_logs
ADD CONSTRAINT symptom_logs_phase_check CHECK (
    phase IN (
        'menstrual',
        'follicular',
        'ovulatory',
        'luteal'
    )
);

ALTER TABLE public.symptom_logs
DROP CONSTRAINT IF EXISTS symptom_logs_pain_score_check;

ALTER TABLE public.symptom_logs
ADD CONSTRAINT symptom_logs_pain_score_check CHECK (pain_score BETWEEN 0 AND 10);

ALTER TABLE public.symptom_logs
DROP CONSTRAINT IF EXISTS symptom_logs_bleeding_check;

ALTER TABLE public.symptom_logs
ADD CONSTRAINT symptom_logs_bleeding_check CHECK (
    bleeding IS NULL
    OR bleeding IN (
        'none',
        'light',
        'medium',
        'heavy'
    )
);

ALTER TABLE public.symptom_logs
DROP CONSTRAINT IF EXISTS symptom_logs_impact_check;

ALTER TABLE public.symptom_logs
ADD CONSTRAINT symptom_logs_impact_check CHECK (
    impact IN (
        'none',
        'some',
        'missed_activity'
    )
);

ALTER TABLE public.symptom_logs
DROP CONSTRAINT IF EXISTS symptom_logs_notes_check;

ALTER TABLE public.symptom_logs
ADD CONSTRAINT symptom_logs_notes_check CHECK (
    notes IS NULL
    OR char_length(notes) <= 500
);

CREATE UNIQUE INDEX IF NOT EXISTS symptom_logs_user_id_log_date_key ON public.symptom_logs (user_id, log_date);

CREATE INDEX IF NOT EXISTS symptom_logs_user_id_log_date_desc_idx ON public.symptom_logs (user_id, log_date DESC);

ALTER TABLE public.symptom_logs enable ROW level security;

-- Policy: users can read only their own symptom entries.
DROP policy IF EXISTS "symptom_logs_select_own" ON public.symptom_logs;

CREATE policy "symptom_logs_select_own" ON public.symptom_logs FOR
SELECT USING (user_id = auth.uid ());

-- Policy: users can create symptom entries only for themselves via with check.
DROP policy IF EXISTS "symptom_logs_insert_own" ON public.symptom_logs;

CREATE policy "symptom_logs_insert_own" ON public.symptom_logs FOR
INSERT
WITH
    CHECK (user_id = auth.uid ());

-- Policy: users can update only their own entries and keep ownership unchanged.
DROP policy IF EXISTS "symptom_logs_update_own" ON public.symptom_logs;

CREATE policy "symptom_logs_update_own" ON public.symptom_logs FOR
UPDATE USING (user_id = auth.uid ())
WITH
    CHECK (user_id = auth.uid ());

-- Policy: users can delete only their own symptom entries.
DROP policy IF EXISTS "symptom_logs_delete_own" ON public.symptom_logs;

CREATE policy "symptom_logs_delete_own" ON public.symptom_logs FOR DELETE USING (user_id = auth.uid ());

-- -----------------------------------------------------------------------------
-- 3) nudge_events
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nudge_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    nudge_key text NOT NULL,
    shown_at timestamptz NOT NULL DEFAULT now(),
    dismissed_at timestamptz,
    action_taken text,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nudge_events
ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE public.nudge_events
ADD COLUMN IF NOT EXISTS nudge_key text;

ALTER TABLE public.nudge_events
ADD COLUMN IF NOT EXISTS shown_at timestamptz DEFAULT now();

ALTER TABLE public.nudge_events
ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

ALTER TABLE public.nudge_events
ADD COLUMN IF NOT EXISTS action_taken text;

ALTER TABLE public.nudge_events
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.nudge_events ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.nudge_events
ALTER COLUMN nudge_key
SET
    NOT NULL;

ALTER TABLE public.nudge_events ALTER COLUMN shown_at SET NOT NULL;

ALTER TABLE public.nudge_events
DROP CONSTRAINT IF EXISTS nudge_events_pkey;

ALTER TABLE public.nudge_events
ADD CONSTRAINT nudge_events_pkey PRIMARY KEY (id);

ALTER TABLE public.nudge_events
DROP CONSTRAINT IF EXISTS nudge_events_user_id_fkey;

ALTER TABLE public.nudge_events
ADD CONSTRAINT nudge_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS nudge_events_user_id_nudge_key_shown_at_idx ON public.nudge_events (
    user_id,
    nudge_key,
    shown_at DESC
);

ALTER TABLE public.nudge_events enable ROW level security;

-- Policy: users can read their own nudge events only.
DROP policy IF EXISTS "nudge_events_select_own" ON public.nudge_events;

CREATE policy "nudge_events_select_own" ON public.nudge_events FOR
SELECT USING (user_id = auth.uid ());

-- Policy: users can create their own nudge events only, and must always be tied to their auth user.
DROP policy IF EXISTS "nudge_events_insert_own" ON public.nudge_events;

CREATE policy "nudge_events_insert_own" ON public.nudge_events FOR
INSERT
WITH
    CHECK (user_id = auth.uid ());

-- Policy: users can update only their own nudge events while preserving ownership.
DROP policy IF EXISTS "nudge_events_update_own" ON public.nudge_events;

CREATE policy "nudge_events_update_own" ON public.nudge_events FOR
UPDATE USING (user_id = auth.uid ())
WITH
    CHECK (user_id = auth.uid ());

-- Policy: users can delete only their own nudge events.
DROP policy IF EXISTS "nudge_events_delete_own" ON public.nudge_events;

CREATE policy "nudge_events_delete_own" ON public.nudge_events FOR DELETE USING (user_id = auth.uid ());

-- -----------------------------------------------------------------------------
-- 4) user_consents
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_consents (
    user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    health_data_consent_at timestamptz,
    policy_version text
);

ALTER TABLE public.user_consents
ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE public.user_consents
ADD COLUMN IF NOT EXISTS health_data_consent_at timestamptz;

ALTER TABLE public.user_consents
ADD COLUMN IF NOT EXISTS policy_version text;

ALTER TABLE public.user_consents
DROP CONSTRAINT IF EXISTS user_consents_pkey;

ALTER TABLE public.user_consents
ADD CONSTRAINT user_consents_pkey PRIMARY KEY (user_id);

ALTER TABLE public.user_consents
DROP CONSTRAINT IF EXISTS user_consents_user_id_fkey;

ALTER TABLE public.user_consents
ADD CONSTRAINT user_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.user_consents enable ROW level security;

-- Policy: users can read only their own consent record.
DROP policy IF EXISTS "user_consents_select_own" ON public.user_consents;

CREATE policy "user_consents_select_own" ON public.user_consents FOR
SELECT USING (user_id = auth.uid ());

-- Policy: users can insert only their own consent record via with check.
DROP policy IF EXISTS "user_consents_insert_own" ON public.user_consents;

CREATE policy "user_consents_insert_own" ON public.user_consents FOR
INSERT
WITH
    CHECK (user_id = auth.uid ());

-- Policy: users can update only their own consent record while preserving ownership.
DROP policy IF EXISTS "user_consents_update_own" ON public.user_consents;

CREATE policy "user_consents_update_own" ON public.user_consents FOR
UPDATE USING (user_id = auth.uid ())
WITH
    CHECK (user_id = auth.uid ());

-- -----------------------------------------------------------------------------
-- 5) ai_usage
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_usage (
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    DAY DATE NOT NULL,
    request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
    PRIMARY KEY (user_id, DAY)
);

ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS DAY DATE;

ALTER TABLE public.ai_usage
ADD COLUMN IF NOT EXISTS request_count integer DEFAULT 0;

ALTER TABLE public.ai_usage ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.ai_usage ALTER COLUMN DAY SET NOT NULL;

ALTER TABLE public.ai_usage
ALTER COLUMN request_count
SET
    NOT NULL;

ALTER TABLE public.ai_usage
ALTER COLUMN request_count
SET DEFAULT 0;

ALTER TABLE public.ai_usage
DROP CONSTRAINT IF EXISTS ai_usage_pkey;

ALTER TABLE public.ai_usage
ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (user_id, DAY);

ALTER TABLE public.ai_usage
DROP CONSTRAINT IF EXISTS ai_usage_user_id_fkey;

ALTER TABLE public.ai_usage
ADD CONSTRAINT ai_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.ai_usage
DROP CONSTRAINT IF EXISTS ai_usage_request_count_check;

ALTER TABLE public.ai_usage
ADD CONSTRAINT ai_usage_request_count_check CHECK (request_count >= 0);

ALTER TABLE public.ai_usage enable ROW level security;

-- Policy: users can only read their own AI usage ledger; writes are restricted to service role via RLS bypass.
DROP policy IF EXISTS "ai_usage_select_own" ON public.ai_usage;

CREATE policy "ai_usage_select_own" ON public.ai_usage FOR
SELECT USING (user_id = auth.uid ());

-- -----------------------------------------------------------------------------
-- 6) Updated-at trigger for tables with modified timestamps.
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger only on symptom_logs because that table owns updated_at.
DROP TRIGGER IF EXISTS symptom_logs_set_updated_at ON public.symptom_logs;

create trigger symptom_logs_set_updated_at
  before update on public.symptom_logs
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 7) Ensure RLS is enabled on existing core tables.
-- -----------------------------------------------------------------------------
ALTER TABLE public.cycle_profiles enable ROW level security;

ALTER TABLE public.tasks enable ROW level security;

ALTER TABLE public.chat_messages enable ROW level security;

ALTER TABLE public.subscriptions enable ROW level security;

-- -----------------------------------------------------------------------------
-- 8) Account deletion RPC.
-- -----------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from public.ai_usage where user_id = current_user_id;
  delete from public.user_consents where user_id = current_user_id;
  delete from public.nudge_events where user_id = current_user_id;
  delete from public.symptom_logs where user_id = current_user_id;
  delete from public.chat_messages where user_id = current_user_id;
  delete from public.tasks where user_id = current_user_id;
  delete from public.subscriptions where user_id = current_user_id;
  delete from public.cycle_profiles where user_id = current_user_id;

  delete from auth.users where id = current_user_id;
end;
$$;

GRANT
EXECUTE ON FUNCTION public.delete_my_account () TO authenticated;