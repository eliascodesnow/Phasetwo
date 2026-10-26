# Notifications: push and in-app

There are two separate channels with different jobs. Keep content in the right one.

| | Push (server) | In-app (Today screen) |
|---|---|---|
| Content | `supabase/functions/_shared/pushContent.ts` | `src/lib/notificationContent.ts` |
| Purpose | Short nudges and occasional gentle ideas | Short, dismissible heads-ups and one daily fact |
| Where it shows | Lock screen, even when the app is closed | `InAppNoticeCard`, top of Today |
| Opt-in | "Period reminders" and "Cycle tips (push)" | "Insights on Today" (on by default) |
| Must avoid | Naming the phase, fertility, sexual health, mood, symptoms (a lock screen is visible to others) | Presenting an estimate as fact |
| Partners | Never sent | Nothing shown |
| Links | None | None |

The Today screen does **not** show phase guides. Phase content lives only in push, as ideas.

### Push messages

| Kind | When | Setting | `reminder_log` key |
|---|---|---|---|
| `period-2d` | 2 days before predicted period | Period reminders | `(period start, 2)` |
| `period-1d` | 1 day before | Period reminders | `(period start, 1)` |
| `pms-heads-up` | 5 days before (cycles of 21+ days) | Cycle tips | `(period start, 5)` |
| `period-due` | Predicted cycle day 1 | Cycle tips | `(today, 0)` |
| `phase-idea` | Random, rare (see below) | Cycle tips | `(today, idea code >= 100)` |

At most one push per person per day, and the period messages always win. `days_before` in `reminder_log` doubles as the message type, so no migration is needed.

### Phase ideas

A gentle suggestion for the day that fits the current phase (soft and cozy through to lively and social), written so the lock screen never names the phase. Rules, all enforced in `selectPhaseIdea` and unit tested:

- Each eligible day has a 40% chance, decided by a hash of person + day (random across people, repeatable for one person and day).
- Never more than 2 in any 7 days, never within 3 days of the last one: about 3 to 5 a cycle.
- Never on the first day of a period, and never on a day that carries a period message.
- An idea isn't repeated within 30 days while the phase has unused ones.
- Each idea has `tags` (`cozy`, `creative`, `social`, `movement`, `outdoors`, `food`, `music`, `mindful`). They are unused today and exist so the planned hobbies survey can filter ideas to a person's interests.

Idea `code` values are stored in `reminder_log`, so never renumber or reuse one.

### In-app notices (most important first)

1. **Worth knowing**: uneven cycles, repeated periods over 7 days, several heavy-flow days. Built only from the person's own logs and never sent as push.
2. **Did you know?**: a rotating general fact, one per day.

Only one notice is shown per visit. Dismissals are stored on the device (`phasetwo:inapp-notices:<userId>`).

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
