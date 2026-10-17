# Period reminders (2 days before)

Two layers:

1. **In-app (works now).** When reminders are on and the app is opened exactly 2 days before the predicted period, a notification is shown once per period.
2. **Server push (needs setup).** Notifies even when the app is closed.

## Server push setup

1. Generate VAPID keys: `npx web-push generate-vapid-keys`
2. Vercel env: `VITE_VAPID_PUBLIC_KEY=<public key>`, then redeploy.
3. Run migration `supabase/migrations/0010_push_reminders.sql`.
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

The function sends at most one reminder per user per period (`reminder_log`) and removes dead subscriptions.
