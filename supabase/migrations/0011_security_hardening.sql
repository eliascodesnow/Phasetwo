-- 0011_security_hardening.sql
--
-- Security fixes from the audit (see GitHub issues #19, #21, #22, #29). Idempotent.
--
--   1. Partner invite email send log (rate limiting that survives revoking an invitation).
--   2. accept_cycle_invitation: caller's confirmed email must match the invited email, and failed
--      guesses are counted and locked out. Failures are RETURNED (not raised) so the attempt row
--      is not rolled back with the transaction.
--   3. push_subscriptions: endpoints must belong to a real browser push service (SSRF), plus
--      register_push_subscription() so a shared device moves cleanly between accounts.
--   4. Community: no post/profile deletes by clients, topic_tag filter, reaction guards,
--      hidden/removed content cannot be edited, display-name filter false positives,
--      misleading no-op policies removed.
--
-- NOT changed on purpose: guests can still read public community posts (the 0008 tests assert it).
-- If that is not wanted, restrict the select policies and grants to `authenticated`.

begin;

-- 1. Partner invite send log ---------------------------------------------------

create table if not exists public.partner_invite_sends (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index if not exists partner_invite_sends_owner_sent_idx on public.partner_invite_sends (owner_user_id, sent_at desc);
alter table public.partner_invite_sends enable row level security;
revoke all on table public.partner_invite_sends from anon, authenticated;
grant all on table public.partner_invite_sends to service_role;

-- 2. Invite acceptance: email binding and brute-force lockout --------------------

create table if not exists public.partner_code_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists partner_code_attempts_user_idx on public.partner_code_attempts (user_id, attempted_at desc);
alter table public.partner_code_attempts enable row level security;
revoke all on table public.partner_code_attempts from anon, authenticated;
grant all on table public.partner_code_attempts to service_role;

create or replace function public.accept_cycle_invitation(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_uid       uuid := auth.uid();
  v_raw       text;
  v_code      text;
  v_inv       public.cycle_invitations%rowtype;
  v_email     text;
  v_confirmed timestamptz;
  v_failures  integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select count(*) into v_failures
    from public.partner_code_attempts
   where user_id = v_uid and attempted_at > now() - interval '1 hour';
  if v_failures >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  v_raw := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_raw) <> 8 then
    insert into public.partner_code_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  end if;
  v_code := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4);

  select * into v_inv
    from public.cycle_invitations
   where invite_code = v_code
     and accepted_user_id is null
     and expires_at > now()
   for update;

  if not found then
    insert into public.partner_code_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  end if;

  if v_inv.owner_user_id = v_uid then
    raise exception 'cannot_accept_own_invite' using errcode = 'P0001';
  end if;

  -- The code only works for the account that owns the invited (and confirmed) email address.
  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
  if v_confirmed is null or v_email is distinct from lower(v_inv.invited_email) then
    insert into public.partner_code_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  end if;

  if exists (select 1 from public.cycle_invitations where accepted_user_id = v_uid) then
    raise exception 'already_linked' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.cycle_invitations
     where owner_user_id = v_inv.owner_user_id and accepted_user_id is not null
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  end if;

  update public.cycle_invitations
     set accepted_user_id = v_uid, accepted_at = now()
   where id = v_inv.id and accepted_user_id is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  end if;

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    raise exception 'already_linked' using errcode = 'P0001';
end;
$$;

revoke all on function public.accept_cycle_invitation(text) from public, anon;
grant execute on function public.accept_cycle_invitation(text) to authenticated;

-- 3. Push subscriptions ------------------------------------------------------------

-- Anything that is not a real push service was never legitimate; remove it before constraining.
delete from public.push_subscriptions
 where endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)(:443)?/'
    or char_length(endpoint) > 2048;

alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_allowed;
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_allowed check (
  char_length(endpoint) <= 2048
  and char_length(p256dh) <= 256
  and char_length(auth) <= 256
  and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)(:443)?/'
);

-- A browser endpoint belongs to the device, so when someone else signs in on it the row moves to them.
create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;
revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- 4. Community hardening -------------------------------------------------------------

-- Permissive "deny" policies are OR-ed with the real ones and deny nothing; access is governed by
-- the column grants and the specific policies. Drop them so they do not suggest otherwise.
do $$
declare relation_name text;
begin
  foreach relation_name in array array[
    'community_private.settings',
    'public.community_circles', 'public.community_profiles', 'public.community_age_confirmations',
    'public.community_guideline_acceptances', 'public.community_memberships', 'public.community_posts',
    'public.community_comments', 'public.community_reactions', 'public.community_saved_posts',
    'public.community_reports', 'public.community_blocks', 'public.community_mutes',
    'public.community_notifications', 'public.community_moderators',
    'public.community_moderation_snapshots', 'public.community_moderation_actions'
  ] loop
    execute format('drop policy if exists community_default_deny on %s', relation_name);
  end loop;
end;
$$;
drop policy if exists community_circles_no_client_write on public.community_circles;
drop policy if exists community_moderators_no_client_write on public.community_moderators;

-- Posts are removed through community_remove_own_post() (soft delete), never by DELETE: deleting rows
-- erased evidence and let people dodge the per-hour post limit, which counts existing rows.
-- Profiles are not deletable either: re-creating a profile minted a new public_id, which evaded
-- blocks and the display-name cooldown. delete_my_account() still removes everything.
revoke delete on public.community_posts from authenticated;
drop policy if exists community_posts_delete_own on public.community_posts;
revoke delete on public.community_profiles from authenticated;
drop policy if exists community_profiles_delete_own on public.community_profiles;

-- topic_tag is shown to everyone, so it gets the same contact-detail filter as titles and bodies.
create or replace function community_private.validate_topic_tag()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if new.topic_tag is not null and not community_private.text_is_allowed(new.topic_tag) then
    raise exception 'community_contact_details_not_allowed' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function community_private.validate_topic_tag() from public, anon, authenticated;
drop trigger if exists community_posts_validate_tag on public.community_posts;
create trigger community_posts_validate_tag before insert or update of topic_tag on public.community_posts
for each row execute function community_private.validate_topic_tag();

-- No reacting to your own post (inflated "helpful" ranking) and a cap on reaction churn.
create or replace function community_private.assign_reaction_author()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_public_id uuid := community_private.my_public_id();
begin
  if current_user_id is null or current_public_id is null then raise exception 'community_profile_required' using errcode = '28000'; end if;
  new.author_public_id := current_public_id;
  if not community_private.has_age_confirmation() or not community_private.has_guidelines() then raise exception 'community_requirements_missing' using errcode = '42501'; end if;
  if exists (select 1 from public.community_posts p where p.id = new.post_id and p.author_public_id = current_public_id) then
    raise exception 'cannot_react_to_own_post' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('reaction:' || current_user_id::text, 0));
  if (select count(*) from public.community_reactions r where r.author_public_id = current_public_id and r.created_at > now() - interval '1 hour') >= 120 then
    raise exception 'community_reaction_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Hidden and removed content is no longer editable by its author (it used to be, inside the edit window).
create or replace function community_private.validate_post_update()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if pg_trigger_depth() > 1 and new.author_public_id = old.author_public_id and new.circle_slug = old.circle_slug
    and new.status = old.status and new.title is not distinct from old.title and new.body = old.body
    and new.topic_tag is not distinct from old.topic_tag and new.created_at = old.created_at then
    new.updated_at := old.updated_at;
    return new;
  end if;
  if community_private.is_moderator() then
    if new.author_public_id <> old.author_public_id or new.circle_slug <> old.circle_slug
      or new.reaction_counts <> old.reaction_counts or new.helpful_count <> old.helpful_count
      or new.comments_count <> old.comments_count or new.created_at <> old.created_at then
      raise exception 'community_post_fields_locked' using errcode = '42501';
    end if;
    new.updated_at := now();
    return new;
  end if;
  if new.status = 'removed' and new.author_public_id = community_private.my_public_id()
    and new.body = '[Post removed by author]' and new.title is null then
    new.updated_at := now();
    return new;
  end if;
  if old.status <> 'visible' then raise exception 'community_post_not_editable' using errcode = '42501'; end if;
  if new.author_public_id <> old.author_public_id or new.circle_slug <> old.circle_slug or new.status <> old.status
    or new.reaction_counts <> old.reaction_counts or new.helpful_count <> old.helpful_count or new.comments_count <> old.comments_count
    or new.created_at <> old.created_at then raise exception 'community_post_fields_locked' using errcode = '42501'; end if;
  if old.created_at < now() - make_interval(mins => (select edit_window_minutes from community_private.settings where singleton)) then raise exception 'community_edit_window_expired' using errcode = 'P0001'; end if;
  if not community_private.text_is_allowed(new.body) or (new.title is not null and not community_private.text_is_allowed(new.title)) then
    raise exception 'community_contact_details_not_allowed' using errcode = '23514';
  end if;
  if char_length(trim(new.body)) not between 1 and (select post_limit from community_private.settings where singleton)
    or (new.title is not null and char_length(trim(new.title)) not between 1 and (select title_limit from community_private.settings where singleton)) then
    raise exception 'community_post_length_invalid' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function community_private.validate_comment_update()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if community_private.is_moderator() then
    if new.author_public_id <> old.author_public_id or new.post_id <> old.post_id
      or new.parent_id is distinct from old.parent_id or new.created_at <> old.created_at then
      raise exception 'community_comment_fields_locked' using errcode = '42501';
    end if;
    new.updated_at := now();
    return new;
  end if;
  if new.status = 'removed' and new.author_public_id = community_private.my_public_id()
    and new.body = '[Comment removed by author]' then
    new.updated_at := now();
    return new;
  end if;
  if old.status <> 'visible' then raise exception 'community_comment_not_editable' using errcode = '42501'; end if;
  if new.author_public_id <> old.author_public_id or new.post_id <> old.post_id or new.parent_id is distinct from old.parent_id
    or new.status <> old.status or new.created_at <> old.created_at then raise exception 'community_comment_fields_locked' using errcode = '42501'; end if;
  if old.created_at < now() - make_interval(mins => (select edit_window_minutes from community_private.settings where singleton)) then raise exception 'community_edit_window_expired' using errcode = 'P0001'; end if;
  if not community_private.text_is_allowed(new.body) then raise exception 'community_contact_details_not_allowed' using errcode = '23514'; end if;
  if char_length(trim(new.body)) not between 1 and (select comment_limit from community_private.settings where singleton) then raise exception 'community_comment_length_invalid' using errcode = '23514'; end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Display-name filter without the "bella" false positives.
create or replace function community_private.validate_display_name()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare normalized text;
cooldown_days integer;
begin
  select display_name_cooldown_days into cooldown_days from community_private.settings where singleton;
  new.display_name := trim(regexp_replace(new.display_name, '\s+', ' ', 'g'));
  normalized := regexp_replace(lower(new.display_name), '[^a-z0-9]', '', 'g');
  if not community_private.text_is_allowed(new.display_name) then raise exception 'display_name_contact_not_allowed' using errcode = '23514'; end if;
  -- Reserve staff-like names and the assistant's name, without rejecting real names that merely
  -- contain "bella" (Isabella, Bellamy, ...).
  if normalized ~ '^(admin|administrator|moderator|support|staff|official|clinician|doctor)'
     or normalized ~ 'phasetwo'
     or normalized ~ '^bella(team|support|official|ai|bot|assistant)?$' then
    raise exception 'display_name_reserved' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and lower(new.display_name) <> lower(old.display_name) then
    if old.display_name_changed_at > now() - make_interval(days => cooldown_days) then
      raise exception 'display_name_rate_limited' using errcode = 'P0001';
    end if;
    new.display_name_changed_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

commit;

notify pgrst, 'reload schema';
