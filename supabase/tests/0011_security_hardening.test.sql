begin;

create extension if not exists pgtap;
select plan(22);

-- Fixtures: A owns invitations; P is the invited partner; S is a stranger; U has an unconfirmed email.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('11000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'partner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11000000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'stranger@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11000000-0000-4000-8000-00000000000d', 'authenticated', 'authenticated', 'unconfirmed@example.test', '', null, '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11000000-0000-4000-8000-00000000000e', 'authenticated', 'authenticated', 'author@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11000000-0000-4000-8000-00000000000f', 'authenticated', 'authenticated', 'mod@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11000000-0000-4000-8000-000000000010', 'authenticated', 'authenticated', 'other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'brute@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.cycle_invitations (owner_user_id, invited_email, invite_code, expires_at) values
  ('11000000-0000-4000-8000-00000000000a', 'partner@example.test', 'ABCD-2345', now() + interval '1 day'),
  ('11000000-0000-4000-8000-000000000010', 'unconfirmed@example.test', 'WXYZ-6789', now() + interval '1 day'),
  ('11000000-0000-4000-8000-00000000000e', 'brute@example.test', 'KLMN-2345', now() + interval '1 day');

-- Community fixtures: author (E) with a profile, membership and a visible post; moderator (F).
insert into public.community_profiles (user_id, public_id, display_name, avatar_color) values
  ('11000000-0000-4000-8000-00000000000e', '21000000-0000-4000-8000-00000000000e', 'CalmRiver', 'sage'),
  ('11000000-0000-4000-8000-000000000010', '21000000-0000-4000-8000-000000000010', 'WarmStone', 'coral');
insert into public.community_moderators (user_id, role) values ('11000000-0000-4000-8000-00000000000f', 'moderator');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-00000000000e', true);
select public.community_confirm_adult(true);
select public.community_accept_guidelines(true, 'v1');
insert into public.community_memberships (user_id, circle_slug) values ('11000000-0000-4000-8000-00000000000e', 'general-chat');
insert into public.community_posts (id, circle_slug, title, body) values
  ('31000000-0000-4000-8000-000000000001', 'general-chat', 'Hello', 'A plain fixture post.');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000010', true);
select public.community_confirm_adult(true);
select public.community_accept_guidelines(true, 'v1');
insert into public.community_memberships (user_id, circle_slug) values ('11000000-0000-4000-8000-000000000010', 'general-chat');

-- 1. Partner invite codes -------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-00000000000c', true);
select is(public.accept_cycle_invitation('ABCD-2345') ->> 'error', 'invalid_or_expired_code', 'a code sent to another email address cannot be accepted');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-00000000000d', true);
select is(public.accept_cycle_invitation('WXYZ-6789') ->> 'error', 'invalid_or_expired_code', 'an unconfirmed email cannot accept a code');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-00000000000b', true);
select is(public.accept_cycle_invitation('abcd 2345') ->> 'ok', 'true', 'the invited, confirmed account can accept (any case or spacing)');
select is(public.accept_cycle_invitation('ABCD-2345') ->> 'error', 'invalid_or_expired_code', 'an accepted code cannot be reused');

reset role;
select is((select count(*)::integer from public.cycle_invitations where invite_code = 'ABCD-2345' and accepted_user_id = '11000000-0000-4000-8000-00000000000b'), 1, 'only the invited account was linked');
select is((select count(*)::integer from public.partner_code_attempts where user_id = '11000000-0000-4000-8000-00000000000c'), 1, 'the failed guess was recorded and survived the call');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000011', true);
select public.accept_cycle_invitation('AAAA-0000') from generate_series(1, 10);
select is(public.accept_cycle_invitation('KLMN-2345') ->> 'error', 'too_many_attempts', 'ten failed guesses lock the account out for an hour');
reset role;

-- 2. Push subscriptions ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-00000000000a', true);
select throws_ok(
  $$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('11000000-0000-4000-8000-00000000000a', 'https://169.254.169.254/latest', 'k', 'a') $$,
  '23514', null, 'internal addresses cannot be stored as push endpoints'
);
select throws_ok(
  $$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('11000000-0000-4000-8000-00000000000a', 'https://fcm.googleapis.com.evil.example/x', 'k', 'a') $$,
  '23514', null, 'look-alike hosts cannot be stored as push endpoints'
);
select lives_ok($$ select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/device-1', 'k1', 'a1', 'test') $$, 'a real push endpoint can be registered');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000010', true);
select lives_ok($$ select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/device-1', 'k2', 'a2', 'test') $$, 'a second account can take over the same device');
reset role;
select is((select user_id from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/device-1'), '11000000-0000-4000-8000-000000000010'::uuid, 'the device subscription moved to the account that is signed in now');
select is((select count(*)::integer from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/device-1'), 1, 'and the previous account no longer receives its reminders');

-- 3. Community ------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-00000000000e', true);
select throws_ok($$ delete from public.community_posts where id = '31000000-0000-4000-8000-000000000001' $$, '42501', null, 'authors cannot delete posts to dodge the rate limit');
select throws_ok($$ delete from public.community_profiles where user_id = '11000000-0000-4000-8000-00000000000e' $$, '42501', null, 'profiles cannot be deleted to evade blocks and the name cooldown');
select throws_ok(
  $$ insert into public.community_posts (circle_slug, body, topic_tag) values ('general-chat', 'Hi there', 'call 5551234567') $$,
  '23514', null, 'topic tags get the contact-details filter'
);
select throws_ok($$ select public.community_set_reaction('31000000-0000-4000-8000-000000000001', 'helpful', true) $$, '23514', null, 'authors cannot react to their own post');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000010', true);
select lives_ok($$ select public.community_set_reaction('31000000-0000-4000-8000-000000000001', 'helpful', true) $$, 'other members can still react');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-00000000000c', true);
select lives_ok($$ insert into public.community_profiles (display_name) values ('Isabella') $$, 'a real name containing "bella" is allowed');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-00000000000b', true);
select throws_ok($$ insert into public.community_profiles (display_name) values ('Bella') $$, '23514', null, 'the assistant''s own name is still reserved');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-00000000000f', true);
select is(public.community_moderate_item('post', '31000000-0000-4000-8000-000000000001', 'hide', 'test'), true, 'moderator hides the post');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-00000000000e', true);
select throws_ok($$ update public.community_posts set body = 'Sneaking my text back in' where id = '31000000-0000-4000-8000-000000000001' $$, '42501', null, 'authors cannot edit a hidden post');
reset role;

select * from finish();
rollback;
