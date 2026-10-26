begin;

create extension if not exists pgtap;
select plan(25);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'community-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'community-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'community-mod@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.community_profiles (user_id, public_id, display_name, avatar_color) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'QuietFern', 'sage'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'SoftCoral', 'coral'),
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'KindSage', 'plum')
on conflict (user_id) do nothing;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select public.community_confirm_adult(true);
select public.community_accept_guidelines(true, 'v1');
insert into public.community_memberships (user_id, circle_slug) values
  ('10000000-0000-4000-8000-000000000001', 'general-chat'),
  ('10000000-0000-4000-8000-000000000001', 'painful-periods')
on conflict do nothing;
insert into public.community_posts (id, circle_slug, author_public_id, title, body) values
  ('30000000-0000-4000-8000-000000000001', 'general-chat', '20000000-0000-4000-8000-000000000001', 'A shared experience', 'A private fixture post for policy tests.')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select public.community_confirm_adult(true);
select public.community_accept_guidelines(true, 'v1');
insert into public.community_memberships (user_id, circle_slug) values
  ('10000000-0000-4000-8000-000000000002', 'general-chat')
on conflict do nothing;
insert into public.community_posts (id, circle_slug, author_public_id, title, body) values
  ('30000000-0000-4000-8000-000000000002', 'general-chat', '20000000-0000-4000-8000-000000000002', 'Another experience', 'A second private fixture post for policy tests.')
on conflict (id) do nothing;
insert into public.community_blocks (user_id, target_public_id)
values ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001')
on conflict do nothing;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.community_reports (reporter_user_id, target_kind, target_id, reason, detail)
values ('10000000-0000-4000-8000-000000000001', 'post', '30000000-0000-4000-8000-000000000002', 'other', 'test report')
on conflict do nothing;

insert into public.community_moderators (user_id, role)
values ('10000000-0000-4000-8000-000000000003', 'moderator')
on conflict do nothing;

select ok(
  (select bool_and(c.relrowsecurity)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and ((n.nspname = 'community_private' and c.relname = 'settings')
        or (n.nspname = 'public' and c.relname like 'community_%'))),
  'RLS is enabled on every community table'
);
select ok(not has_column_privilege('authenticated', 'public.community_profiles', 'user_id', 'SELECT'), 'auth user ids are not selectable from community profiles');
select ok(not has_table_privilege('authenticated', 'public.community_moderators', 'INSERT'), 'clients cannot grant moderator rights');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.community_memberships), 2, 'member sees only their own memberships');
select is((select count(*)::integer from public.community_reports), 1, 'reporter can see their private report');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.community_memberships), 1, 'second member sees only their membership');
select is((select count(*)::integer from public.community_posts), 1, 'block hides the blocked author from the blocker feed');
select is((select count(*)::integer from public.community_reports), 0, 'reported user cannot read another user report');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ insert into public.community_memberships (circle_slug) values ('painful-periods') $$,
  '42501', null, 'age confirmation is required before joining another circle'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::integer from public.community_posts), 2, 'guests can read public posts');
select is((select count(*)::integer from public.community_circles), 5, 'guests can read seeded public circles');
select throws_ok(
  $$ insert into public.community_posts (circle_slug, body) values ('general-chat', 'anonymous write attempt') $$,
  '28000', null, 'guests cannot create posts'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select is((select count(*)::integer from public.community_reports), 1, 'moderator can read the moderation queue');
select is(public.community_moderate_item('post', '30000000-0000-4000-8000-000000000002', 'hide', 'test moderation'), true, 'moderator can hide a post');
select is((select body from public.community_posts where id = '30000000-0000-4000-8000-000000000002'), '[This post is hidden pending review]', 'hidden post content is replaced with a neutral placeholder');
select is(public.community_moderate_item('post', '30000000-0000-4000-8000-000000000002', 'restore', 'test restore'), true, 'moderator can restore a hidden post');
select is(public.community_moderate_item('post', '30000000-0000-4000-8000-000000000001', 'hide', 'retained audit fixture'), true, 'moderator action on another account content is recorded');
select is(public.community_moderate_item('post', '30000000-0000-4000-8000-000000000001', 'restore', 'retained audit fixture'), true, 'moderator can restore the second fixture');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select lives_ok('select public.delete_my_account()', 'account deletion removes community-owned data');
reset role;
select is((select count(*)::integer from public.community_posts where id = '30000000-0000-4000-8000-000000000002'), 0, 'deleted account posts are removed');
select is((select count(*)::integer from public.community_reports where target_id = '30000000-0000-4000-8000-000000000002'), 0, 'reports about deleted content are removed');
select is((select count(*)::integer from public.community_blocks where user_id = '10000000-0000-4000-8000-000000000002'), 0, 'deleted account block list is removed');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select lives_ok('select public.delete_my_account()', 'moderator account can be deleted');
reset role;
select is((select count(*)::integer from public.community_moderators where user_id = '10000000-0000-4000-8000-000000000003'), 0, 'deleted user loses moderator role');
select is((select count(*)::integer from public.community_moderation_actions where target_id = '30000000-0000-4000-8000-000000000001' and moderator_user_id is null and reason is null), 2, 'retained audit rows are de-identified');

select * from finish();
rollback;