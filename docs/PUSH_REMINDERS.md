# Period reminders (2 days and 1 day before)

Two layers:

1. **In-app (works now).** When reminders are on and the app is opened 2 days or 1 day before the predicted period, a notification is shown once per reminder.
2. **Server push (needs setup).** Notifies even when the app is closed.

## Server push setup

1. Generate VAPID keys: `npx web-push generate-vapid-keys`
2. Vercel env: `VITE_VAPID_PUBLIC_KEY=<public key>`, then redeploy.
3. Run migrations `supabase/migrations/0010_push_reminders.sql` and `0011_security_hardening.sql` (the latter restricts push endpoints to real push services and adds `register_push_subscription`).
4. Set function secrets:
   `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:mail@phasetwo.space CRON_SECRET=<long random string>`
5. Deploy: `supabase functions deploy period-reminders --no-verify-jwt`
6. Schedule it daily (Supabase SQL editor, needs the `pg_cron` and `pg_net` extensions):

```sql
select cron.schedule(
  'period-reminders-daily',
  '0 6 * * *',
  $$ select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/period-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
  ); $$
);
```

The function sends at most one reminder per user per period per lead time (`reminder_log` keyed by user, period and days before) and removes dead subscriptions.

The function only contacts endpoints on known push-service hosts (FCM, Mozilla, Apple, Windows), times each push out after 10 seconds, and releases the day's reminder claim if nothing was delivered so the next run retries. `CRON_SECRET` is compared in constant time.
