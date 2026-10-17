begin;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  current_public_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select public_id into current_public_id
    from public.community_profiles
   where user_id = current_user_id;

  delete from public.community_moderation_actions a
   where a.target_kind = 'report'
     and a.target_id in (select id from public.community_reports where reporter_user_id = current_user_id);

  if current_public_id is not null then
    delete from public.community_moderation_actions a
     where (a.target_kind = 'post' and a.target_id in (select id from public.community_posts where author_public_id = current_public_id))
        or (a.target_kind = 'comment' and a.target_id in (select id from public.community_comments where author_public_id = current_public_id));
  end if;

  delete from public.community_reports where reporter_user_id = current_user_id;
  delete from public.community_notifications where recipient_user_id = current_user_id;
  delete from public.community_saved_posts where user_id = current_user_id;
  delete from public.community_memberships where user_id = current_user_id;
  delete from public.community_age_confirmations where user_id = current_user_id;
  delete from public.community_guideline_acceptances where user_id = current_user_id;
  delete from public.community_blocks where user_id = current_user_id;
  delete from public.community_mutes where user_id = current_user_id;

  -- Retain only the action type, target, and time for actions on other users'
  -- content; remove the moderator identity and free-text reason before auth deletion.
  update public.community_moderation_actions
     set moderator_user_id = null,
         reason = null
   where moderator_user_id = current_user_id;

  delete from public.community_profiles where user_id = current_user_id;

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

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

commit;