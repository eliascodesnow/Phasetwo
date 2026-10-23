# Notifications: push and in-app

There are two separate channels with different jobs. Keep content in the right one.

| | Push (server) | In-app (Today screen) |
|---|---|---|
| Content | `supabase/functions/_shared/pushContent.ts` | `src/lib/notificationContent.ts` |
| Purpose | Short, time-sensitive nudge | Longer, educational, dismissible insight |
| Where it shows | Lock screen, even when the app is closed | `InAppNoticeCard`, top of Today |
| Opt-in | "Period reminders" and "Cycle tips (push)" | "Insights on Today" (on by default) |
| Must avoid | Fertility, sexual health, mood, health warnings (lock screen is visible to others) | Nothing, but always label dates as estimates and never present a guess as fact |
| Partners | Never sent | Supportive phase note only |

### Push messages

| Kind | When | Setting | `reminder_log` key |
|---|---|---|---|
| `period-2d` | 2 days before predicted period | Period reminders | `(period start, 2)` |
| `period-1d` | 1 day before | Period reminders | `(period start, 1)` |
| `pms-heads-up` | 5 days before (cycles of 21+ days) | Cycle tips | `(period start, 5)` |
| `period-due` | Predicted cycle day 1 | Cycle tips | `(today, 0)` |

At most one push per person per day. `days_before` in `reminder_log` doubles as the message type; no migration is needed.

### In-app notices (most important first)

1. **Attention**: uneven cycles, repeated periods over 7 days, several heavy-flow days. Built only from the person's own logs and never sent as push.
2. **Phase guide**: one per phase per cycle (menstrual, follicular, estimated ovulation window, luteal, and a PMS window for the last 5 days).
3. **Daily fact**: rotating library, one per day.

Only one notice is shown per visit. Dismissals are stored on the device (`phasetwo:inapp-notices:<userId>`).

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

The function sends at most one reminder per user per period per lead time (`reminder_log` keyed by user, period and days before) and removes dead subscriptions.
