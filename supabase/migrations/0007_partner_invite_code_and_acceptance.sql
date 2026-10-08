-- 0007_partner_invitation_code_and_acceptance.sql
--
-- Adds short shareable invite codes (ABCD-EFGH) to partner invitations and a
-- code-based acceptance RPC, and keeps public.cycle_invitations restricted to
-- the service role (the design from 0005).
--
-- Depends on: 0005_bella_partner_invites.sql
--   - public.cycle_invitations and its unique indexes
--       cycle_invitations_pending_owner_key  (one pending invite per owner)
--       cycle_invitations_owner_key          (one accepted partner per owner)
--       cycle_invitations_partner_key        (a user can be a partner once)
--   - public.get_my_shared_cycle_profile() and public.leave_cycle_share()
--     (both SECURITY DEFINER, so they keep working without table grants)
--
-- Write path: the partner-invites Edge Function must create, refresh and
-- revoke invitations with the SERVICE ROLE key and generate invite_code
-- itself (8 characters from an unambiguous alphabet, stored as ABCD-EFGH).
--
-- Idempotent: safe to run on a project where these objects were already
-- created by hand.

begin;

-- 1. Invite code column ------------------------------------------------------

alter table public.cycle_invitations
  add column if not exists invite_code text;

-- Pending invites created before codes existed cannot be accepted by code.
-- Accepted rows (existing partner links) are left untouched.
delete from public.cycle_invitations
where invite_code is null
  and accepted_user_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cycle_invitations'::regclass
      and conname = 'cycle_invitations_invite_code_format'
  ) then
    alter table public.cycle_invitations
      add constraint cycle_invitations_invite_code_format
      check (invite_code is null or invite_code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$');
  end if;

  -- A pending invitation must always carry a code; accepted legacy rows may not.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cycle_invitations'::regclass
      and conname = 'cycle_invitations_pending_has_code'
  ) then
    alter table public.cycle_invitations
      add constraint cycle_invitations_pending_has_code
      check (accepted_user_id is not null or invite_code is not null);
  end if;
end
$$;

create unique index if not exists cycle_invitations_invite_code_key
  on public.cycle_invitations (invite_code)
  where invite_code is not null;

-- 2. Code-based acceptance ---------------------------------------------------

create or replace function public.accept_cycle_invitation(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_uid  uuid := auth.uid();
  v_raw  text;
  v_code text;
  v_inv  public.cycle_invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Accept the code with or without the dash, spaces, or lowercase.
  v_raw := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_raw) <> 8 then
    raise exception 'invalid_or_expired_code' using errcode = 'P0001';
  end if;
  v_code := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4);

  select *
    into v_inv
    from public.cycle_invitations
   where invite_code = v_code
     and accepted_user_id is null
     and expires_at > now()
   for update;

  if not found then
    raise exception 'invalid_or_expired_code' using errcode = 'P0001';
  end if;

  if v_inv.owner_user_id = v_uid then
    raise exception 'cannot_accept_own_invite' using errcode = 'P0001';
  end if;

  -- This user is already someone's partner.
  if exists (
    select 1 from public.cycle_invitations
     where accepted_user_id = v_uid
  ) then
    raise exception 'already_linked' using errcode = 'P0001';
  end if;

  -- The owner already has a partner: do not reveal that, treat as invalid.
  if exists (
    select 1 from public.cycle_invitations
     where owner_user_id = v_inv.owner_user_id
       and accepted_user_id is not null
  ) then
    raise exception 'invalid_or_expired_code' using errcode = 'P0001';
  end if;

  update public.cycle_invitations
     set accepted_user_id = v_uid,
         accepted_at      = now()
   where id = v_inv.id
     and accepted_user_id is null;

  if not found then
    raise exception 'invalid_or_expired_code' using errcode = 'P0001';
  end if;

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    raise exception 'already_linked' using errcode = 'P0001';
end;
$$;

revoke all on function public.accept_cycle_invitation(text) from public, anon;
grant execute on function public.accept_cycle_invitation(text) to authenticated;

-- 3. Keep the invitations table service-role only ------------------------------

alter table public.cycle_invitations enable row level security;

-- Remove every client-facing policy (including ones added by hand). With RLS
-- on and no policies, anon and authenticated clients are denied by default;
-- the service role bypasses RLS.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
      from pg_policies
     where schemaname = 'public'
       and tablename  = 'cycle_invitations'
  loop
    execute format('drop policy %I on public.cycle_invitations', pol.policyname);
  end loop;
end
$$;

revoke all on table public.cycle_invitations from anon, authenticated;
grant select, insert, update, delete on table public.cycle_invitations to service_role;

commit;

notify pgrst, 'reload schema';