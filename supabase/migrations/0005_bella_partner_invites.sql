CREATE TABLE IF NOT EXISTS public.cycle_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  invited_email text NOT NULL CHECK (char_length(invited_email) BETWEEN 3 AND 254),
  invite_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  accepted_user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  CHECK (accepted_user_id IS NULL OR accepted_user_id <> owner_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS cycle_invitations_pending_owner_key
  ON public.cycle_invitations (owner_user_id)
  WHERE accepted_user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cycle_invitations_partner_key
  ON public.cycle_invitations (accepted_user_id)
  WHERE accepted_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cycle_invitations_owner_key
  ON public.cycle_invitations (owner_user_id)
  WHERE accepted_user_id IS NOT NULL;

ALTER TABLE public.cycle_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cycle_invitations FROM anon, authenticated;
GRANT ALL ON public.cycle_invitations TO service_role;

CREATE OR REPLACE FUNCTION public.consume_bella_daily_limit(p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL OR p_limit < 1 THEN
    RETURN false;
  END IF;

  INSERT INTO public.ai_usage (user_id, day, request_count)
  VALUES (current_user_id, current_date, 1)
  ON CONFLICT (user_id, day) DO UPDATE
    SET request_count = public.ai_usage.request_count + 1
    WHERE public.ai_usage.request_count < p_limit;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_bella_daily_limit(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_bella_daily_limit(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_shared_cycle_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  owner_id uuid;
  profile_data jsonb;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT owner_user_id INTO owner_id
  FROM public.cycle_invitations
  WHERE accepted_user_id = current_user_id
  LIMIT 1;

  IF owner_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'lastPeriodStart', cycle_profile -> 'lastPeriodStart',
    'periodStartDates', cycle_profile -> 'periodStartDates',
    'cycleLength', cycle_profile -> 'cycleLength',
    'periodLength', cycle_profile -> 'periodLength',
    'ownerLabel', cycle_profile -> 'ownerLabel',
    'timezone', cycle_profile -> 'timezone'
  )) INTO profile_data
  FROM public.user_app_state
  WHERE user_id = owner_id;

  RETURN profile_data;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_shared_cycle_profile() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_shared_cycle_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_cycle_share()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.cycle_invitations WHERE accepted_user_id = current_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_cycle_share() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.leave_cycle_share() TO authenticated;
