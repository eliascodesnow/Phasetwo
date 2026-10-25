-- Partner sync: also share the owner's recorded period end dates so the partner's calendar
-- and period window match the owner's. Same sharing boundary as before: cycle dates only,
-- no symptom logs, notes, age or health flags.
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
    'periodEnds', cycle_profile -> 'periodEnds',
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

REVOKE ALL ON FUNCTION public.get_my_shared_cycle_profile () FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_shared_cycle_profile () TO authenticated;
