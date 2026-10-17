begin;

create schema if not exists community_private;
revoke all on schema community_private from public;
grant usage on schema community_private to anon, authenticated;

create table community_private.settings (
  singleton boolean primary key default true check (singleton),
  minimum_age integer not null default 18 check (minimum_age >= 18),
  title_limit integer not null default 80 check (title_limit between 1 and 200),
  post_limit integer not null default 1500 check (post_limit between 1 and 10000),
  comment_limit integer not null default 600 check (comment_limit between 1 and 5000),
  edit_window_minutes integer not null default 15 check (edit_window_minutes between 1 and 1440),
  posts_per_hour integer not null default 5 check (posts_per_hour between 1 and 100),
  posts_per_day integer not null default 20 check (posts_per_day between 1 and 500),
  comments_per_hour integer not null default 30 check (comments_per_hour between 1 and 1000),
  reports_per_hour integer not null default 10 check (reports_per_hour between 1 and 500),
  display_name_cooldown_days integer not null default 7 check (display_name_cooldown_days between 1 and 365),
  helpful_window_days integer not null default 30 check (helpful_window_days between 1 and 365)
);
alter table community_private.settings enable row level security;
revoke all on community_private.settings from public, anon, authenticated;
insert into community_private.settings (singleton) values (true) on conflict (singleton) do nothing;

create table public.community_circles (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,48}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text not null check (char_length(description) between 2 and 240),
  created_at timestamptz not null default now()
);

insert into public.community_circles (slug, name, description) values
  ('endo-chronic-pain', 'Endometriosis and Chronic Pain', 'Share lived experience and support around chronic pelvic pain.'),
  ('irregular-cycles-pcos', 'Irregular Cycles and PCOS', 'A respectful space for experiences with irregular cycles and PCOS.'),
  ('painful-periods', 'Painful Periods', 'Talk about painful periods and the ways they affect everyday life.'),
  ('partners-supporters', 'Partners and Supporters', 'A space for supporters to learn from shared experiences.'),
  ('general-chat', 'General Chat', 'Everyday conversation and encouragement across the community.')
on conflict (slug) do update set name = excluded.name, description = excluded.description;

create table public.community_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  public_id uuid not null unique default gen_random_uuid(),
  display_name text not null default ('Member-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)))
    check (char_length(trim(display_name)) between 2 and 32),
  avatar_color text not null default 'rose'
    check (avatar_color in ('rose', 'coral', 'lavender', 'sage', 'plum')),
  display_name_changed_at timestamptz not null default '-infinity',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index community_profiles_display_name_lower_key on public.community_profiles (lower(display_name));

create table public.community_age_confirmations (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  confirmed_at timestamptz not null default now()
);

create table public.community_guideline_acceptances (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  version text not null check (char_length(version) between 1 and 24),
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);

create table public.community_memberships (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  circle_slug text not null references public.community_circles (slug) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (user_id, circle_slug)
);
create index community_memberships_circle_joined_idx on public.community_memberships (circle_slug, joined_at desc);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  circle_slug text not null references public.community_circles (slug) on delete restrict,
  author_public_id uuid not null references public.community_profiles (public_id) on delete cascade,
  title text,
  body text not null,
  topic_tag text check (topic_tag is null or char_length(trim(topic_tag)) between 1 and 32),
  status text not null default 'visible' check (status in ('visible', 'hidden', 'removed')),
  reaction_counts jsonb not null default '{"me_too":0,"sending_support":0,"helpful":0}'::jsonb,
  helpful_count integer not null default 0 check (helpful_count >= 0),
  comments_count integer not null default 0 check (comments_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index community_posts_recent_idx on public.community_posts (circle_slug, created_at desc, id desc) where status = 'visible';
create index community_posts_helpful_idx on public.community_posts (circle_slug, helpful_count desc, created_at desc, id desc) where status = 'visible';
create index community_posts_author_idx on public.community_posts (author_public_id, created_at desc);

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  parent_id uuid references public.community_comments (id) on delete set null,
  author_public_id uuid not null references public.community_profiles (public_id) on delete cascade,
  body text not null,
  status text not null default 'visible' check (status in ('visible', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index community_comments_post_created_idx on public.community_comments (post_id, created_at, id);
create index community_comments_parent_idx on public.community_comments (parent_id, created_at, id) where parent_id is not null;
create index community_comments_author_idx on public.community_comments (author_public_id, created_at desc);

create table public.community_reactions (
  post_id uuid not null references public.community_posts (id) on delete cascade,
  author_public_id uuid not null references public.community_profiles (public_id) on delete cascade,
  reaction_type text not null check (reaction_type in ('me_too', 'sending_support', 'helpful')),
  created_at timestamptz not null default now(),
  primary key (post_id, author_public_id, reaction_type)
);
create index community_reactions_author_idx on public.community_reactions (author_public_id, created_at desc);

create table public.community_saved_posts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  post_id uuid not null references public.community_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index community_saved_posts_created_idx on public.community_saved_posts (user_id, created_at desc, post_id);

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_kind text not null check (target_kind in ('post', 'comment')),
  target_id uuid not null,
  reason text not null check (reason in ('harassment', 'personal_information', 'dangerous_medical_advice', 'spam', 'inappropriate', 'other')),
  detail text check (detail is null or char_length(detail) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_user_id, target_kind, target_id)
);
create index community_reports_queue_idx on public.community_reports (created_at, id) where status = 'open';

create table public.community_blocks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_public_id uuid not null references public.community_profiles (public_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, target_public_id)
);
create index community_blocks_target_idx on public.community_blocks (target_public_id, user_id);

create table public.community_mutes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_public_id uuid not null references public.community_profiles (public_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, target_public_id)
);
create index community_mutes_target_idx on public.community_mutes (target_public_id, user_id);

create table public.community_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  actor_public_id uuid not null references public.community_profiles (public_id) on delete cascade,
  notification_type text not null check (notification_type in ('reply', 'reaction')),
  target_kind text not null check (target_kind in ('post', 'comment')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (recipient_user_id, actor_public_id, notification_type, target_kind, target_id)
);
create index community_notifications_unread_idx on public.community_notifications (recipient_user_id, created_at desc, id desc) where read_at is null;

create table public.community_moderators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'moderator' check (role in ('moderator', 'admin')),
  added_at timestamptz not null default now()
);

create table public.community_moderation_snapshots (
  target_kind text not null check (target_kind in ('post', 'comment')),
  target_id uuid not null,
  body text not null,
  title text,
  captured_at timestamptz not null default now(),
  captured_by uuid references auth.users (id) on delete set null,
  primary key (target_kind, target_id)
);

create table public.community_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_user_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('hide', 'restore', 'remove', 'resolve', 'dismiss')),
  target_kind text not null check (target_kind in ('post', 'comment', 'report')),
  target_id uuid,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now()
);
create index community_moderation_actions_created_idx on public.community_moderation_actions (created_at desc);
comment on table public.community_moderation_actions is 'Minimal audit trail. On account deletion moderator_user_id is nulled; user-authored content and snapshots are removed with their owner.';

create or replace function community_private.my_public_id()
returns uuid language sql stable security definer
set search_path = pg_catalog, public, auth
as $$ select public_id from public.community_profiles where user_id = auth.uid() $$;

create or replace function community_private.owns_profile(p_public_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$ select exists (select 1 from public.community_profiles where user_id = auth.uid() and public_id = p_public_id) $$;

create or replace function community_private.profile_user_id(p_public_id uuid)
returns uuid language sql stable security definer
set search_path = pg_catalog, public
as $$ select user_id from public.community_profiles where public_id = p_public_id $$;

create or replace function community_private.is_moderator()
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$ select exists (select 1 from public.community_moderators where user_id = auth.uid()) $$;

create or replace function community_private.has_age_confirmation()
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$ select exists (select 1 from public.community_age_confirmations where user_id = auth.uid()) $$;

create or replace function community_private.has_guidelines()
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$ select exists (select 1 from public.community_guideline_acceptances where user_id = auth.uid() and version = 'v1') $$;

create or replace function community_private.is_member(p_circle_slug text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$ select exists (select 1 from public.community_memberships where user_id = auth.uid() and circle_slug = p_circle_slug) $$;

create or replace function community_private.can_view_author_for(p_author_public_id uuid, p_viewer_id uuid)
returns boolean language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare author_user_id uuid;
begin
  if p_viewer_id is null then return true; end if;
  select user_id into author_user_id from public.community_profiles where public_id = p_author_public_id;
  if author_user_id is null then return false; end if;
  if exists (select 1 from public.community_blocks where (user_id = p_viewer_id and target_public_id = p_author_public_id)
             or (user_id = author_user_id and target_public_id = community_private.my_public_id_for(p_viewer_id))) then return false; end if;
  if exists (select 1 from public.community_mutes where user_id = p_viewer_id and target_public_id = p_author_public_id) then return false; end if;
  return true;
end;
$$;

create or replace function community_private.can_view_author(p_author_public_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$ select community_private.can_view_author_for(p_author_public_id, auth.uid()) $$;

create or replace function community_private.my_public_id_for(p_user_id uuid)
returns uuid language sql stable security definer
set search_path = pg_catalog, public
as $$ select public_id from public.community_profiles where user_id = p_user_id $$;

comment on function community_private.can_view_author(uuid) is 'Blocks hide each other’s content in either direction. Mutes hide only for the muting account, including feeds, comments, replies, and notifications; neither setting affects Bella or partner sync.';

create or replace function community_private.text_is_allowed(p_text text)
returns boolean language plpgsql immutable security definer
set search_path = pg_catalog
as $$
declare normalized text := lower(coalesce(p_text, ''));
digits text := regexp_replace(coalesce(p_text, ''), '[^0-9]', '', 'g');
begin
  if position('@' in normalized) > 0 then return false; end if;
  if normalized ~ '(https?://|www[.]|[[:alnum:]-]+[.](com|org|net|edu|gov|io|co|me|app|info|uk|ca|au)(/|[[:space:][:punct:]]|$))' then return false; end if;
  if char_length(digits) >= 7 then return false; end if;
  return true;
end;
$$;

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
  if normalized ~ '(admin|moderator|phasetwo|bella|support|staff|official|clinician|doctor)' then
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
create trigger community_profiles_validate_name before insert or update on public.community_profiles
for each row execute function community_private.validate_display_name();

create or replace function community_private.guard_age_confirmation()
returns trigger language plpgsql security definer
set search_path = pg_catalog, auth
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  new.user_id := auth.uid();
  new.confirmed_at := now();
  return new;
end;
$$;
create trigger community_age_confirmation_server_time before insert on public.community_age_confirmations
for each row execute function community_private.guard_age_confirmation();

create or replace function community_private.guard_relationship_target()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  new.user_id := auth.uid();
  if new.target_public_id = community_private.my_public_id() then raise exception 'cannot_block_or_mute_self' using errcode = '23514'; end if;
  new.created_at := now();
  return new;
end;
$$;
create trigger community_blocks_guard before insert on public.community_blocks for each row execute function community_private.guard_relationship_target();
create trigger community_mutes_guard before insert on public.community_mutes for each row execute function community_private.guard_relationship_target();

create or replace function community_private.assign_post_author()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare current_public_id uuid := community_private.my_public_id();
current_user_id uuid := auth.uid();
begin
  if current_user_id is null or current_public_id is null then raise exception 'community_profile_required' using errcode = '28000'; end if;
  new.author_public_id := current_public_id;
  if not community_private.has_age_confirmation() or not community_private.has_guidelines() then
    raise exception 'community_requirements_missing' using errcode = '42501';
  end if;
  if not community_private.is_member(new.circle_slug) then raise exception 'circle_membership_required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  if (select count(*) from public.community_posts p join public.community_profiles cp on cp.public_id = p.author_public_id where cp.user_id = current_user_id and p.created_at > now() - interval '1 hour') >= (select posts_per_hour from community_private.settings where singleton)
    or (select count(*) from public.community_posts p join public.community_profiles cp on cp.public_id = p.author_public_id where cp.user_id = current_user_id and p.created_at > now() - interval '1 day') >= (select posts_per_day from community_private.settings where singleton) then
    raise exception 'community_post_rate_limited' using errcode = 'P0001';
  end if;
  if not community_private.text_is_allowed(new.body) or (new.title is not null and not community_private.text_is_allowed(new.title)) then
    raise exception 'community_contact_details_not_allowed' using errcode = '23514';
  end if;
  if char_length(trim(new.body)) not between 1 and (select post_limit from community_private.settings where singleton)
    or (new.title is not null and char_length(trim(new.title)) not between 1 and (select title_limit from community_private.settings where singleton)) then
    raise exception 'community_post_length_invalid' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger community_posts_insert_guard before insert on public.community_posts
for each row execute function community_private.assign_post_author();

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
create trigger community_posts_update_guard before update on public.community_posts
for each row execute function community_private.validate_post_update();

create or replace function community_private.assign_comment_author()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare current_public_id uuid := community_private.my_public_id();
current_user_id uuid := auth.uid();
parent_comment public.community_comments%rowtype;
parent_circle text;
begin
  if current_user_id is null or current_public_id is null then raise exception 'community_profile_required' using errcode = '28000'; end if;
  new.author_public_id := current_public_id;
  if not community_private.has_age_confirmation() or not community_private.has_guidelines() then raise exception 'community_requirements_missing' using errcode = '42501'; end if;
  select circle_slug into parent_circle from public.community_posts where id = new.post_id and status = 'visible';
  if parent_circle is null or not community_private.is_member(parent_circle) then raise exception 'circle_membership_required' using errcode = '42501'; end if;
  if new.parent_id is not null then
    select * into parent_comment from public.community_comments where id = new.parent_id and post_id = new.post_id and status = 'visible';
    if not found or parent_comment.parent_id is not null then raise exception 'invalid_reply_depth' using errcode = '23514'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  if (select count(*) from public.community_comments c join public.community_profiles cp on cp.public_id = c.author_public_id where cp.user_id = current_user_id and c.created_at > now() - interval '1 hour') >= (select comments_per_hour from community_private.settings where singleton) then
    raise exception 'community_comment_rate_limited' using errcode = 'P0001';
  end if;
  if not community_private.text_is_allowed(new.body) then raise exception 'community_contact_details_not_allowed' using errcode = '23514'; end if;
  if char_length(trim(new.body)) not between 1 and (select comment_limit from community_private.settings where singleton) then raise exception 'community_comment_length_invalid' using errcode = '23514'; end if;
  return new;
end;
$$;
create trigger community_comments_insert_guard before insert on public.community_comments
for each row execute function community_private.assign_comment_author();

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
  if new.author_public_id <> old.author_public_id or new.post_id <> old.post_id or new.parent_id is distinct from old.parent_id
    or new.status <> old.status or new.created_at <> old.created_at then raise exception 'community_comment_fields_locked' using errcode = '42501'; end if;
  if old.created_at < now() - make_interval(mins => (select edit_window_minutes from community_private.settings where singleton)) then raise exception 'community_edit_window_expired' using errcode = 'P0001'; end if;
  if not community_private.text_is_allowed(new.body) then raise exception 'community_contact_details_not_allowed' using errcode = '23514'; end if;
  if char_length(trim(new.body)) not between 1 and (select comment_limit from community_private.settings where singleton) then raise exception 'community_comment_length_invalid' using errcode = '23514'; end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger community_comments_update_guard before update on public.community_comments
for each row execute function community_private.validate_comment_update();

create or replace function community_private.assign_reaction_author()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null or community_private.my_public_id() is null then raise exception 'community_profile_required' using errcode = '28000'; end if;
  new.author_public_id := community_private.my_public_id();
  if not community_private.has_age_confirmation() or not community_private.has_guidelines() then raise exception 'community_requirements_missing' using errcode = '42501'; end if;
  return new;
end;
$$;
create trigger community_reactions_insert_guard before insert on public.community_reactions
for each row execute function community_private.assign_reaction_author();

create or replace function community_private.update_post_counters()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare post_key uuid := coalesce(new.post_id, old.post_id);
kind text := coalesce(new.reaction_type, old.reaction_type);
delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  update public.community_posts p
    set reaction_counts = jsonb_set(p.reaction_counts, array[kind], to_jsonb(greatest(0, coalesce((p.reaction_counts ->> kind)::integer, 0) + delta)), true),
        helpful_count = case when kind = 'helpful' then greatest(0, p.helpful_count + delta) else p.helpful_count end
    where p.id = post_key;
  return coalesce(new, old);
end;
$$;
create trigger community_reactions_count after insert or delete on public.community_reactions
for each row execute function community_private.update_post_counters();

create or replace function community_private.update_comment_counter()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare post_key uuid := coalesce(new.post_id, old.post_id);
delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  update public.community_posts set comments_count = greatest(0, comments_count + delta) where id = post_key;
  return coalesce(new, old);
end;
$$;
create trigger community_comments_count after insert or delete on public.community_comments
for each row execute function community_private.update_comment_counter();

create or replace function community_private.validate_report()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare target_author uuid;
current_public_id uuid := community_private.my_public_id();
current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not community_private.has_age_confirmation() then raise exception 'age_confirmation_required' using errcode = '42501'; end if;
  if new.target_kind = 'post' then select author_public_id into target_author from public.community_posts where id = new.target_id and status = 'visible';
  else select author_public_id into target_author from public.community_comments where id = new.target_id and status = 'visible'; end if;
  if target_author is null or target_author = current_public_id then raise exception 'invalid_report_target' using errcode = '23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  if (select count(*) from public.community_reports where reporter_user_id = current_user_id and created_at > now() - interval '1 hour') >= (select reports_per_hour from community_private.settings where singleton) then
    raise exception 'community_report_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger community_reports_insert_guard before insert on public.community_reports
for each row execute function community_private.validate_report();

create or replace function community_private.notify_community_activity()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare post_author uuid;
recipient uuid;
parent_author uuid;
begin
  if tg_table_name = 'community_reactions' then
    select community_private.profile_user_id(p.author_public_id) into post_author from public.community_posts p where p.id = new.post_id;
    recipient := post_author;
    if recipient is not null and recipient <> community_private.profile_user_id(new.author_public_id)
      and community_private.can_view_author_for(new.author_public_id, recipient) then
      insert into public.community_notifications (recipient_user_id, actor_public_id, notification_type, target_kind, target_id)
      values (recipient, new.author_public_id, 'reaction', 'post', new.post_id) on conflict do nothing;
    end if;
  elsif new.parent_id is not null then
    select community_private.profile_user_id(parent.author_public_id) into parent_author from public.community_comments parent where parent.id = new.parent_id;
    recipient := parent_author;
    if recipient is not null and recipient <> community_private.profile_user_id(new.author_public_id)
      and community_private.can_view_author_for(new.author_public_id, recipient) then
      insert into public.community_notifications (recipient_user_id, actor_public_id, notification_type, target_kind, target_id)
      values (recipient, new.author_public_id, 'reply', 'comment', new.id) on conflict do nothing;
    end if;
  else
    select community_private.profile_user_id(p.author_public_id) into post_author from public.community_posts p where p.id = new.post_id;
    recipient := post_author;
    if recipient is not null and recipient <> community_private.profile_user_id(new.author_public_id)
      and community_private.can_view_author_for(new.author_public_id, recipient) then
      insert into public.community_notifications (recipient_user_id, actor_public_id, notification_type, target_kind, target_id)
      values (recipient, new.author_public_id, 'reply', 'post', new.id) on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
create trigger community_reactions_notify after insert on public.community_reactions
for each row execute function community_private.notify_community_activity();

create or replace function community_private.remove_reaction_notification()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare recipient uuid;
begin
  select community_private.profile_user_id(p.author_public_id) into recipient
    from public.community_posts p where p.id = old.post_id;
  if recipient is not null then
    delete from public.community_notifications
     where recipient_user_id = recipient and actor_public_id = old.author_public_id
       and notification_type = 'reaction' and target_kind = 'post' and target_id = old.post_id;
  end if;
  return old;
end;
$$;
create trigger community_reactions_remove_notification after delete on public.community_reactions
for each row execute function community_private.remove_reaction_notification();

create or replace function public.community_set_reaction(p_post_id uuid, p_reaction_type text, p_active boolean)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare current_user_id uuid := auth.uid();
current_public_id uuid := community_private.my_public_id();
target_circle text;
result jsonb;
begin
  if current_user_id is null or current_public_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_reaction_type not in ('me_too', 'sending_support', 'helpful') then raise exception 'invalid_reaction_type' using errcode = '22023'; end if;
  if not community_private.has_age_confirmation() or not community_private.has_guidelines() then raise exception 'community_requirements_missing' using errcode = '42501'; end if;
  select circle_slug into target_circle from public.community_posts where id = p_post_id and status = 'visible';
  if target_circle is null or not community_private.is_member(target_circle) then raise exception 'circle_membership_required' using errcode = '42501'; end if;
  if p_active then
    insert into public.community_reactions (post_id, author_public_id, reaction_type)
    values (p_post_id, current_public_id, p_reaction_type) on conflict do nothing;
  else
    delete from public.community_reactions where post_id = p_post_id and author_public_id = current_public_id and reaction_type = p_reaction_type;
  end if;
  select jsonb_build_object('reaction_counts', reaction_counts, 'helpful_count', helpful_count, 'comments_count', comments_count)
    into result from public.community_posts where id = p_post_id;
  return result;
end;
$$;
revoke all on function public.community_set_reaction(uuid, text, boolean) from public, anon;
grant execute on function public.community_set_reaction(uuid, text, boolean) to authenticated;

create trigger community_comments_notify after insert on public.community_comments
for each row execute function community_private.notify_community_activity();

create or replace function community_private.set_notification_read_time()
returns trigger language plpgsql security definer
set search_path = pg_catalog
as $$
begin
  if new.id <> old.id or new.recipient_user_id <> old.recipient_user_id or new.actor_public_id <> old.actor_public_id
    or new.notification_type <> old.notification_type or new.target_kind <> old.target_kind
    or new.target_id <> old.target_id or new.created_at <> old.created_at then
    raise exception 'notification_fields_locked' using errcode = '42501';
  end if;
  new.read_at := case when new.read_at is null then null else now() end;
  return new;
end;
$$;
create trigger community_notifications_server_read_time before update on public.community_notifications
for each row execute function community_private.set_notification_read_time();

create or replace function public.community_ensure_profile()
returns table (public_id uuid, display_name text, avatar_color text)
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  insert into public.community_profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  return query select p.public_id, p.display_name, p.avatar_color from public.community_profiles p where p.user_id = auth.uid();
end;
$$;
revoke all on function public.community_ensure_profile() from public, anon;
grant execute on function public.community_ensure_profile() to authenticated;

create or replace function public.community_public_config()
returns jsonb language sql stable security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'minimum_age', settings.minimum_age,
    'guidelines_version', 'v1',
    'title_limit', settings.title_limit,
    'post_limit', settings.post_limit,
    'comment_limit', settings.comment_limit,
    'edit_window_minutes', settings.edit_window_minutes,
    'helpful_window_days', settings.helpful_window_days,
    'posts_per_hour', settings.posts_per_hour,
    'posts_per_day', settings.posts_per_day,
    'comments_per_hour', settings.comments_per_hour,
    'reports_per_hour', settings.reports_per_hour,
    'display_name_cooldown_days', settings.display_name_cooldown_days
  )
  from community_private.settings settings where settings.singleton
$$;
revoke all on function public.community_public_config() from public;
grant execute on function public.community_public_config() to anon, authenticated;

create or replace function public.community_my_state()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $$
declare current_user_id uuid := auth.uid();
profile_row public.community_profiles%rowtype;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into profile_row from public.community_profiles where user_id = current_user_id;
  return jsonb_build_object(
    'profile', case when profile_row.user_id is null then null else jsonb_build_object('public_id', profile_row.public_id, 'display_name', profile_row.display_name, 'avatar_color', profile_row.avatar_color) end,
    'age_confirmed', community_private.has_age_confirmation(),
    'guidelines_accepted', community_private.has_guidelines(),
    'is_moderator', community_private.is_moderator(),
    'circles', coalesce((select jsonb_agg(circle_slug order by circle_slug) from public.community_memberships where user_id = current_user_id), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.community_my_state() from public, anon;
grant execute on function public.community_my_state() to authenticated;

create or replace function public.community_feed_page(
  p_circle_slug text default null,
  p_my_circles boolean default false,
  p_sort text default 'recent',
  p_before_created_at timestamptz default null,
  p_before_helpful_count integer default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns setof jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare page_size integer := least(greatest(coalesce(p_limit, 20), 1), 50);
helpful_days integer;
begin
  if p_sort is null or p_sort not in ('recent', 'helpful') then raise exception 'invalid_feed_sort' using errcode = '22023'; end if;
  if (p_before_created_at is null) <> (p_before_id is null)
    or (p_sort = 'helpful' and ((p_before_created_at is null) <> (p_before_helpful_count is null)))
    or (p_sort = 'recent' and p_before_helpful_count is not null) then
    raise exception 'invalid_feed_cursor' using errcode = '22023';
  end if;
  if p_my_circles and auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  helpful_days := (public.community_public_config() ->> 'helpful_window_days')::integer;

  if p_sort = 'helpful' then
    return query
      select jsonb_build_object(
        'id', p.id,
        'circle_slug', p.circle_slug,
        'author', jsonb_build_object('public_id', cp.public_id, 'display_name', cp.display_name, 'avatar_color', cp.avatar_color),
        'title', p.title,
        'body', p.body,
        'topic_tag', p.topic_tag,
        'status', p.status,
        'reaction_counts', p.reaction_counts,
        'comments_count', p.comments_count,
        'helpful_count', p.helpful_count,
        'created_at', p.created_at
      )
      from public.community_posts p
      join public.community_profiles cp on cp.public_id = p.author_public_id
      where p.created_at >= now() - make_interval(days => helpful_days)
        and (p_circle_slug is null or p.circle_slug = p_circle_slug)
        and (not p_my_circles or community_private.is_member(p.circle_slug))
        and community_private.can_view_author(p.author_public_id)
        and (p_before_created_at is null
          or (p.helpful_count, p.created_at, p.id) < (p_before_helpful_count, p_before_created_at, p_before_id))
      order by p.helpful_count desc, p.created_at desc, p.id desc
      limit page_size;
  else
    return query
      select jsonb_build_object(
        'id', p.id,
        'circle_slug', p.circle_slug,
        'author', jsonb_build_object('public_id', cp.public_id, 'display_name', cp.display_name, 'avatar_color', cp.avatar_color),
        'title', p.title,
        'body', p.body,
        'topic_tag', p.topic_tag,
        'status', p.status,
        'reaction_counts', p.reaction_counts,
        'comments_count', p.comments_count,
        'helpful_count', p.helpful_count,
        'created_at', p.created_at
      )
      from public.community_posts p
      join public.community_profiles cp on cp.public_id = p.author_public_id
      where (p_circle_slug is null or p.circle_slug = p_circle_slug)
        and (not p_my_circles or community_private.is_member(p.circle_slug))
        and community_private.can_view_author(p.author_public_id)
        and (p_before_created_at is null or (p.created_at, p.id) < (p_before_created_at, p_before_id))
      order by p.created_at desc, p.id desc
      limit page_size;
  end if;
end;
$$;
revoke all on function public.community_feed_page(text, boolean, text, timestamptz, integer, uuid, integer) from public;
grant execute on function public.community_feed_page(text, boolean, text, timestamptz, integer, uuid, integer) to anon, authenticated;

create or replace function public.community_remove_own_comment(p_comment_id uuid)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  update public.community_comments c set status = 'removed', body = '[Comment removed by author]'
   where c.id = p_comment_id and c.author_public_id = community_private.my_public_id() and c.status <> 'removed';
  get diagnostics changed = row_count;
  if changed = 1 then delete from public.community_notifications where target_kind = 'comment' and target_id = p_comment_id; end if;
  return changed = 1;
end;
$$;
revoke all on function public.community_remove_own_comment(uuid) from public, anon;
grant execute on function public.community_remove_own_comment(uuid) to authenticated;

create or replace function public.community_remove_own_post(p_post_id uuid)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  update public.community_posts p set status = 'removed', body = '[Post removed by author]', title = null
   where p.id = p_post_id and p.author_public_id = community_private.my_public_id() and p.status <> 'removed';
  get diagnostics changed = row_count;
  if changed = 1 then delete from public.community_notifications where target_kind = 'post' and target_id = p_post_id; end if;
  return changed = 1;
end;
$$;
revoke all on function public.community_remove_own_post(uuid) from public, anon;
grant execute on function public.community_remove_own_post(uuid) to authenticated;

create or replace function public.community_confirm_adult(p_confirms_adult boolean)
returns timestamptz language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare result timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_confirms_adult is distinct from true then raise exception 'adult_confirmation_required' using errcode = '42501'; end if;
  insert into public.community_age_confirmations (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select confirmed_at into result from public.community_age_confirmations where user_id = auth.uid();
  return result;
end;
$$;
revoke all on function public.community_confirm_adult(boolean) from public, anon;
grant execute on function public.community_confirm_adult(boolean) to authenticated;

create or replace function public.community_accept_guidelines(p_accepts boolean, p_version text default 'v1')
returns timestamptz language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare result timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_accepts is distinct from true or p_version <> 'v1' then raise exception 'guideline_acknowledgement_required' using errcode = '42501'; end if;
  insert into public.community_guideline_acceptances (user_id, version) values (auth.uid(), p_version) on conflict (user_id, version) do nothing;
  select accepted_at into result from public.community_guideline_acceptances where user_id = auth.uid() and version = p_version;
  return result;
end;
$$;
revoke all on function public.community_accept_guidelines(boolean, text) from public, anon;
grant execute on function public.community_accept_guidelines(boolean, text) to authenticated;

create or replace function public.community_moderate_item(p_target_kind text, p_target_id uuid, p_action text, p_reason text default null)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare current_user_id uuid := auth.uid();
post_row public.community_posts%rowtype;
comment_row public.community_comments%rowtype;
snapshot public.community_moderation_snapshots%rowtype;
begin
  if current_user_id is null or not community_private.is_moderator() then raise exception 'moderator_required' using errcode = '42501'; end if;
  if p_target_kind not in ('post', 'comment') or p_action not in ('hide', 'restore', 'remove') then raise exception 'invalid_moderation_action' using errcode = '22023'; end if;
  if p_reason is not null and char_length(p_reason) > 500 then raise exception 'invalid_moderation_reason' using errcode = '22023'; end if;

  if p_target_kind = 'post' then
    select * into post_row from public.community_posts where id = p_target_id for update;
    if not found then return false; end if;
    if p_action = 'hide' and post_row.status = 'visible' then
      insert into public.community_moderation_snapshots (target_kind, target_id, body, title, captured_by)
      values ('post', post_row.id, post_row.body, post_row.title, current_user_id)
      on conflict (target_kind, target_id) do update set body = excluded.body, title = excluded.title, captured_at = now(), captured_by = excluded.captured_by;
      update public.community_posts set status = 'hidden', body = '[This post is hidden pending review]', title = null where id = p_target_id;
    elsif p_action = 'restore' and post_row.status = 'hidden' then
      select * into snapshot from public.community_moderation_snapshots where target_kind = 'post' and target_id = p_target_id;
      if not found then raise exception 'moderation_snapshot_unavailable' using errcode = 'P0001'; end if;
      update public.community_posts set status = 'visible', body = snapshot.body, title = snapshot.title where id = p_target_id;
      delete from public.community_moderation_snapshots where target_kind = 'post' and target_id = p_target_id;
    elsif p_action = 'remove' then
      delete from public.community_moderation_snapshots where target_kind = 'post' and target_id = p_target_id;
      delete from public.community_notifications where target_kind = 'post' and target_id = p_target_id;
      update public.community_posts set status = 'removed', body = '[This post was removed]', title = null where id = p_target_id;
    else return false;
    end if;
  else
    select * into comment_row from public.community_comments where id = p_target_id for update;
    if not found then return false; end if;
    if p_action = 'hide' and comment_row.status = 'visible' then
      insert into public.community_moderation_snapshots (target_kind, target_id, body, captured_by)
      values ('comment', comment_row.id, comment_row.body, current_user_id)
      on conflict (target_kind, target_id) do update set body = excluded.body, captured_at = now(), captured_by = excluded.captured_by;
      update public.community_comments set status = 'hidden', body = '[This comment is hidden pending review]' where id = p_target_id;
    elsif p_action = 'restore' and comment_row.status = 'hidden' then
      select * into snapshot from public.community_moderation_snapshots where target_kind = 'comment' and target_id = p_target_id;
      if not found then raise exception 'moderation_snapshot_unavailable' using errcode = 'P0001'; end if;
      update public.community_comments set status = 'visible', body = snapshot.body where id = p_target_id;
      delete from public.community_moderation_snapshots where target_kind = 'comment' and target_id = p_target_id;
    elsif p_action = 'remove' then
      delete from public.community_moderation_snapshots where target_kind = 'comment' and target_id = p_target_id;
      delete from public.community_notifications where target_kind = 'comment' and target_id = p_target_id;
      update public.community_comments set status = 'removed', body = '[This comment was removed]' where id = p_target_id;
    else return false;
    end if;
  end if;

  insert into public.community_moderation_actions (moderator_user_id, action, target_kind, target_id, reason)
  values (current_user_id, p_action, p_target_kind, p_target_id, nullif(trim(p_reason), ''));
  return true;
end;
$$;
revoke all on function public.community_moderate_item(text, uuid, text, text) from public, anon;
grant execute on function public.community_moderate_item(text, uuid, text, text) to authenticated;

create or replace function public.community_moderate_report(p_report_id uuid, p_action text, p_reason text default null)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare current_user_id uuid := auth.uid();
next_status text;
begin
  if current_user_id is null or not community_private.is_moderator() then raise exception 'moderator_required' using errcode = '42501'; end if;
  if p_action not in ('resolve', 'dismiss') or (p_reason is not null and char_length(p_reason) > 500) then raise exception 'invalid_moderation_action' using errcode = '22023'; end if;
  next_status := case when p_action = 'resolve' then 'resolved' else 'dismissed' end;
  update public.community_reports set status = next_status where id = p_report_id and status = 'open';
  if not found then return false; end if;
  insert into public.community_moderation_actions (moderator_user_id, action, target_kind, target_id, reason)
  values (current_user_id, p_action, 'report', p_report_id, nullif(trim(p_reason), ''));
  return true;
end;
$$;
revoke all on function public.community_moderate_report(uuid, text, text) from public, anon;
grant execute on function public.community_moderate_report(uuid, text, text) to authenticated;

create or replace function public.community_moderation_queue(p_before_created_at timestamptz default null, p_before_id uuid default null, p_limit integer default 25)
returns setof jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare page_size integer := least(greatest(coalesce(p_limit, 25), 1), 50);
begin
  if auth.uid() is null or not community_private.is_moderator() then raise exception 'moderator_required' using errcode = '42501'; end if;
  return query
    select jsonb_build_object(
      'id', r.id,
      'target_kind', r.target_kind,
      'target_id', r.target_id,
      'reason', r.reason,
      'detail', r.detail,
      'status', r.status,
      'created_at', r.created_at,
      'author', jsonb_build_object('public_id', coalesce(post_profile.public_id, comment_profile.public_id), 'display_name', coalesce(post_profile.display_name, comment_profile.display_name), 'avatar_color', coalesce(post_profile.avatar_color, comment_profile.avatar_color)),
      'target_body', coalesce(case when r.target_kind = 'post' then p.body else c.body end, '[Content unavailable]'),
      'target_title', case when r.target_kind = 'post' then p.title else null end,
      'circle_slug', coalesce(p.circle_slug, parent_post.circle_slug)
    )
    from public.community_reports r
    left join public.community_posts p on r.target_kind = 'post' and p.id = r.target_id
    left join public.community_profiles post_profile on post_profile.public_id = p.author_public_id
    left join public.community_comments c on r.target_kind = 'comment' and c.id = r.target_id
    left join public.community_profiles comment_profile on comment_profile.public_id = c.author_public_id
    left join public.community_posts parent_post on parent_post.id = c.post_id
    where r.status = 'open'
      and (p_before_created_at is null or (r.created_at, r.id) < (p_before_created_at, p_before_id))
    order by r.created_at, r.id
    limit page_size;
end;
$$;
revoke all on function public.community_moderation_queue(timestamptz, uuid, integer) from public, anon;
grant execute on function public.community_moderation_queue(timestamptz, uuid, integer) to authenticated;

-- Enable row security on every community table. Client table grants below expose
-- only public pseudonyms and owner-scoped rows; auth UUIDs remain unselectable.
alter table public.community_circles enable row level security;
alter table public.community_profiles enable row level security;
alter table public.community_age_confirmations enable row level security;
alter table public.community_guideline_acceptances enable row level security;
alter table public.community_memberships enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_saved_posts enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_blocks enable row level security;
alter table public.community_mutes enable row level security;
alter table public.community_notifications enable row level security;
alter table public.community_moderators enable row level security;
alter table public.community_moderation_snapshots enable row level security;
alter table public.community_moderation_actions enable row level security;

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
    execute format('create policy community_default_deny on %s for all to anon, authenticated using (false) with check (false)', relation_name);
  end loop;
end;
$$;

create policy community_circles_read on public.community_circles for select to anon, authenticated using (true);
create policy community_circles_no_client_write on public.community_circles for all to anon, authenticated using (false) with check (false);

create policy community_profiles_read on public.community_profiles for select to anon, authenticated using (true);
create policy community_profiles_insert_own on public.community_profiles for insert to authenticated with check (user_id = auth.uid());
create policy community_profiles_update_own on public.community_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy community_profiles_delete_own on public.community_profiles for delete to authenticated using (user_id = auth.uid());

create policy community_age_confirmation_insert_own on public.community_age_confirmations for insert to authenticated with check (user_id = auth.uid());
create policy community_age_confirmation_read_own on public.community_age_confirmations for select to authenticated using (user_id = auth.uid());
create policy community_age_confirmation_no_change on public.community_age_confirmations for update to authenticated using (false) with check (false);
create policy community_age_confirmation_delete_own on public.community_age_confirmations for delete to authenticated using (user_id = auth.uid());

create policy community_guidelines_read_own on public.community_guideline_acceptances for select to authenticated using (user_id = auth.uid());
create policy community_guidelines_insert_own on public.community_guideline_acceptances for insert to authenticated with check (user_id = auth.uid() and version = 'v1');
create policy community_guidelines_no_update on public.community_guideline_acceptances for update to authenticated using (false) with check (false);
create policy community_guidelines_delete_own on public.community_guideline_acceptances for delete to authenticated using (user_id = auth.uid());

create policy community_memberships_read_own on public.community_memberships for select to authenticated using (user_id = auth.uid());
create policy community_memberships_insert_own on public.community_memberships for insert to authenticated with check (user_id = auth.uid() and community_private.has_age_confirmation());
create policy community_memberships_no_update on public.community_memberships for update to authenticated using (false) with check (false);
create policy community_memberships_delete_own on public.community_memberships for delete to authenticated using (user_id = auth.uid());

create policy community_posts_read_visible on public.community_posts for select to anon, authenticated using (community_private.can_view_author(author_public_id));
create policy community_posts_read_own_hidden on public.community_posts for select to authenticated using (community_private.owns_profile(author_public_id));
create policy community_posts_moderator_read on public.community_posts for select to authenticated using (community_private.is_moderator());
create policy community_posts_insert_member on public.community_posts for insert to authenticated with check (
  community_private.owns_profile(author_public_id)
  and community_private.is_member(circle_slug)
  and community_private.has_age_confirmation()
  and community_private.has_guidelines()
);
create policy community_posts_update_own on public.community_posts for update to authenticated using (community_private.owns_profile(author_public_id)) with check (community_private.owns_profile(author_public_id));
create policy community_posts_delete_own on public.community_posts for delete to authenticated using (community_private.owns_profile(author_public_id));
create policy community_posts_moderator_update on public.community_posts for update to authenticated using (community_private.is_moderator()) with check (community_private.is_moderator());

create policy community_comments_read_visible on public.community_comments for select to anon, authenticated using (
  community_private.can_view_author(author_public_id)
  and exists (select 1 from public.community_posts p where p.id = post_id and community_private.can_view_author(p.author_public_id))
);
create policy community_comments_read_own on public.community_comments for select to authenticated using (community_private.owns_profile(author_public_id));
create policy community_comments_moderator_read on public.community_comments for select to authenticated using (community_private.is_moderator());
create policy community_comments_insert_member on public.community_comments for insert to authenticated with check (
  community_private.owns_profile(author_public_id)
  and community_private.has_age_confirmation()
  and community_private.has_guidelines()
);
create policy community_comments_update_own on public.community_comments for update to authenticated using (community_private.owns_profile(author_public_id)) with check (community_private.owns_profile(author_public_id));
create policy community_comments_moderator_update on public.community_comments for update to authenticated using (community_private.is_moderator()) with check (community_private.is_moderator());

create policy community_reactions_read_visible on public.community_reactions for select to anon, authenticated using (
  community_private.can_view_author(author_public_id)
  and exists (select 1 from public.community_posts p where p.id = post_id and p.status = 'visible' and community_private.can_view_author(p.author_public_id))
);
create policy community_reactions_insert_member on public.community_reactions for insert to authenticated with check (
  community_private.owns_profile(author_public_id) and community_private.has_age_confirmation()
  and community_private.has_guidelines()
  and exists (select 1 from public.community_posts p where p.id = post_id and p.status = 'visible' and community_private.is_member(p.circle_slug))
);
create policy community_reactions_delete_own on public.community_reactions for delete to authenticated using (community_private.owns_profile(author_public_id));

create policy community_saved_posts_read_own on public.community_saved_posts for select to authenticated using (user_id = auth.uid());
create policy community_saved_posts_insert_own on public.community_saved_posts for insert to authenticated with check (
  user_id = auth.uid() and community_private.has_age_confirmation() and community_private.has_guidelines()
  and exists (select 1 from public.community_posts p where p.id = post_id and p.status = 'visible' and community_private.can_view_author(p.author_public_id))
);
create policy community_saved_posts_no_update on public.community_saved_posts for update to authenticated using (false) with check (false);
create policy community_saved_posts_delete_own on public.community_saved_posts for delete to authenticated using (user_id = auth.uid());

create policy community_reports_insert_own on public.community_reports for insert to authenticated with check (reporter_user_id = auth.uid());
create policy community_reports_read_own on public.community_reports for select to authenticated using (reporter_user_id = auth.uid());
create policy community_reports_moderator_read on public.community_reports for select to authenticated using (community_private.is_moderator());
create policy community_reports_moderator_update on public.community_reports for update to authenticated using (community_private.is_moderator()) with check (community_private.is_moderator());

create policy community_blocks_read_own on public.community_blocks for select to authenticated using (user_id = auth.uid());
create policy community_blocks_insert_own on public.community_blocks for insert to authenticated with check (user_id = auth.uid());
create policy community_blocks_no_update on public.community_blocks for update to authenticated using (false) with check (false);
create policy community_blocks_delete_own on public.community_blocks for delete to authenticated using (user_id = auth.uid());
create policy community_mutes_read_own on public.community_mutes for select to authenticated using (user_id = auth.uid());
create policy community_mutes_insert_own on public.community_mutes for insert to authenticated with check (user_id = auth.uid());
create policy community_mutes_no_update on public.community_mutes for update to authenticated using (false) with check (false);
create policy community_mutes_delete_own on public.community_mutes for delete to authenticated using (user_id = auth.uid());

create policy community_notifications_read_own on public.community_notifications for select to authenticated using (
  recipient_user_id = auth.uid()
  and community_private.can_view_author(actor_public_id)
  and case
    when target_kind = 'post' then exists (select 1 from public.community_posts p where p.id = target_id and community_private.can_view_author(p.author_public_id))
    else exists (select 1 from public.community_comments c join public.community_posts p on p.id = c.post_id where c.id = target_id and community_private.can_view_author(c.author_public_id) and community_private.can_view_author(p.author_public_id))
  end
);
create policy community_notifications_update_own on public.community_notifications for update to authenticated using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());
create policy community_notifications_no_insert on public.community_notifications for insert to authenticated with check (false);
create policy community_notifications_no_delete on public.community_notifications for delete to authenticated using (false);

create policy community_moderators_read_moderator on public.community_moderators for select to authenticated using (community_private.is_moderator());
create policy community_moderators_no_client_write on public.community_moderators for all to anon, authenticated using (false) with check (false);
create policy community_moderation_snapshots_moderator_read on public.community_moderation_snapshots for select to authenticated using (community_private.is_moderator());
create policy community_moderation_snapshots_moderator_write on public.community_moderation_snapshots for all to authenticated using (community_private.is_moderator()) with check (community_private.is_moderator());
create policy community_moderation_actions_moderator_read on public.community_moderation_actions for select to authenticated using (community_private.is_moderator());
create policy community_moderation_actions_moderator_insert on public.community_moderation_actions for insert to authenticated with check (community_private.is_moderator() and moderator_user_id = auth.uid());

revoke all on table
  public.community_circles, public.community_profiles, public.community_age_confirmations,
  public.community_guideline_acceptances, public.community_memberships, public.community_posts,
  public.community_comments, public.community_reactions, public.community_saved_posts,
  public.community_reports, public.community_blocks, public.community_mutes,
  public.community_notifications, public.community_moderators,
  public.community_moderation_snapshots, public.community_moderation_actions
from anon, authenticated;

grant select on public.community_circles to anon, authenticated;
grant select (public_id, display_name, avatar_color, created_at), insert (display_name, avatar_color), update (display_name, avatar_color), delete on public.community_profiles to anon, authenticated;
grant select (circle_slug, joined_at), insert (circle_slug), delete on public.community_memberships to authenticated;
grant select (id, circle_slug, author_public_id, title, body, topic_tag, status, reaction_counts, helpful_count, comments_count, created_at, updated_at), insert (circle_slug, title, body, topic_tag), update (title, body, topic_tag), delete on public.community_posts to anon, authenticated;
grant select (id, post_id, parent_id, author_public_id, body, status, created_at, updated_at), insert (post_id, parent_id, body), update (body) on public.community_comments to anon, authenticated;
grant select (post_id, author_public_id, reaction_type, created_at), insert (post_id, reaction_type), delete on public.community_reactions to anon, authenticated;
grant select (post_id, created_at), insert (post_id), delete on public.community_saved_posts to authenticated;
grant select (target_kind, target_id, reason, detail, status, created_at), insert (target_kind, target_id, reason, detail) on public.community_reports to authenticated;
grant select (target_public_id, created_at), insert (target_public_id), delete on public.community_blocks, public.community_mutes to authenticated;
grant select (id, actor_public_id, notification_type, target_kind, target_id, created_at, read_at), update (read_at) on public.community_notifications to authenticated;

revoke all on public.community_moderators, public.community_moderation_snapshots, public.community_moderation_actions from anon, authenticated;
revoke all on public.community_age_confirmations, public.community_guideline_acceptances from anon, authenticated;

-- Delete the reporter's records and references to their content before profile
-- cascading removes posts/comments; account rows otherwise cascade from auth.users.
create or replace function community_private.cleanup_profile_content()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.community_reports r
   where (r.target_kind = 'post' and r.target_id in (select id from public.community_posts where author_public_id = old.public_id))
      or (r.target_kind = 'comment' and r.target_id in (select id from public.community_comments where author_public_id = old.public_id));
  delete from public.community_moderation_snapshots s
   where (s.target_kind = 'post' and s.target_id in (select id from public.community_posts where author_public_id = old.public_id))
      or (s.target_kind = 'comment' and s.target_id in (select id from public.community_comments where author_public_id = old.public_id));
  return old;
end;
$$;
create trigger community_profiles_cleanup before delete on public.community_profiles
for each row execute function community_private.cleanup_profile_content();

do $$
declare function_signature text;
begin
  for function_signature in
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'community_private'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', function_signature);
  end loop;
end;
$$;

grant execute on function community_private.owns_profile(uuid) to authenticated;
grant execute on function community_private.is_moderator() to authenticated;
grant execute on function community_private.has_age_confirmation() to authenticated;
grant execute on function community_private.has_guidelines() to authenticated;
grant execute on function community_private.is_member(text) to authenticated;
grant execute on function community_private.is_member(text) to anon;
grant execute on function community_private.can_view_author(uuid) to anon, authenticated;

commit;

notify pgrst, 'reload schema';