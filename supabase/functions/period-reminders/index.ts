// Sends the daily push notifications: period reminders (2 days and 1 day before) and, for people who
// turned on "Cycle tips", a PMS heads-up (5 days before), a "period may start today" nudge, and
// an occasional gentle idea that fits the current phase (rare and random, never more than 2 a week).
// What is sent and when is decided in _shared/pushContent.ts.
// Run once a day (see docs/PUSH_REMINDERS.md). Requires the secrets listed there.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import webpush from "npm:web-push@3.6.7";
import { chunk, constantTimeEqual, isAllowedPushEndpoint } from "../_shared/push.ts";
import { IDEA_CODE_BASE, selectDailyPush, todayIn, type IdeaHistoryItem, type PushProfile } from "../_shared/pushContent.ts";

const PUSH_TIMEOUT_MS = 10_000; // one slow endpoint must never stall everyone else
const USER_CONCURRENCY = 10;

type Settings = { role?: string; periodReminders?: boolean; phaseTips?: boolean };

Deno.serve(async (request) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || !constantTimeEqual(request.headers.get("Authorization") ?? "", `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:mail@phasetwo.space",
    Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
    Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
  );
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  const { data: subscriptions, error } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth");
  if (error) return new Response(error.message, { status: 500 });

  type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
  const all = (subscriptions ?? []) as Subscription[];

  // Rows saved before the endpoint allowlist existed are never contacted; drop them.
  const rejected = all.filter((row) => !isAllowedPushEndpoint(row.endpoint));
  for (const row of rejected) await admin.from("push_subscriptions").delete().eq("id", row.id);
  const valid = all.filter((row) => isAllowedPushEndpoint(row.endpoint));

  const byUser = new Map<string, Subscription[]>();
  for (const row of valid) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
  const userIds = [...byUser.keys()];
  let sent = 0;

  async function remindUser(userId: string): Promise<number> {
    const { data: state } = await admin.from("user_app_state").select("cycle_profile, app_settings").eq("user_id", userId).maybeSingle();
    const profile = (state?.cycle_profile ?? {}) as PushProfile;
    const settings = (state?.app_settings ?? {}) as Settings;
    if (settings.role === "partner") return 0; // partners never get these
    if (!settings.periodReminders && !settings.phaseTips) return 0;

    // Past ideas (reminder_log rows with a code at or above IDEA_CODE_BASE) keep them rare and varied.
    let history: IdeaHistoryItem[] = [];
    if (settings.phaseTips) {
      const since = new Date(Date.now() - 35 * 86_400_000).toISOString();
      const { data: rows } = await admin.from("reminder_log").select("period_start, days_before").eq("user_id", userId).gte("days_before", IDEA_CODE_BASE).gte("sent_at", since);
      history = (rows ?? []).map((row) => ({ code: row.days_before as number, sentOn: row.period_start as string }));
    }

    const message = selectDailyPush(profile, todayIn(profile.timezone || "UTC"), settings, userId, history);
    if (!message) return 0;

    const { error: logError } = await admin.from("reminder_log").insert({ user_id: userId, period_start: message.periodStart, days_before: message.daysBefore });
    if (logError) return 0; // already sent for this period

    const payload = JSON.stringify({ title: message.title, body: message.body, tag: message.tag, url: message.url });

    let delivered = 0;
    for (const row of byUser.get(userId) ?? []) {
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, { timeout: PUSH_TIMEOUT_MS, TTL: 86_400 });
        delivered += 1;
      } catch (pushError) {
        const status = (pushError as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", row.id);
      }
    }
    // Nothing was delivered: release the claim so the next run retries instead of losing the reminder.
    if (delivered === 0) await admin.from("reminder_log").delete().match({ user_id: userId, period_start: message.periodStart, days_before: message.daysBefore });
    return delivered;
  }

  for (const group of chunk(userIds, USER_CONCURRENCY)) {
    const results = await Promise.allSettled(group.map((userId) => remindUser(userId)));
    for (const result of results) if (result.status === "fulfilled") sent += result.value;
  }

  return Response.json({ users: userIds.length, sent });
});
