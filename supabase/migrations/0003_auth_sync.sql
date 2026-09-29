create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

grant select, insert, update on public.profiles to authenticated;

create table if not exists public.user_app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cycle_profile jsonb not null default '{}'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  app_settings jsonb not null default '{}'::jsonb,
  chat_messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_app_state enable row level security;

drop policy if exists "user_app_state_select_own" on public.user_app_state;
create policy "user_app_state_select_own" on public.user_app_state
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_app_state_insert_own" on public.user_app_state;
create policy "user_app_state_insert_own" on public.user_app_state
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_app_state_update_own" on public.user_app_state;
create policy "user_app_state_update_own" on public.user_app_state
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.user_app_state to authenticated;