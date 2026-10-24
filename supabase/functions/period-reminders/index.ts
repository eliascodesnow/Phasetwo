// Sends a push notification 2 days and 1 day before each user's predicted period.
// Run once a day (see docs/PUSH_REMINDERS.md). Requires the secrets listed there.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import webpush from "npm:web-push@3.6.7";
import { chunk, constantTimeEqual, isAllowedPushEndpoint } from "../_shared/push.ts";

const DAYS_BEFORE = [2, 1];
const MS_PER_DAY = 86_400_000;
const PUSH_TIMEOUT_MS = 10_000; // one slow endpoint must never stall everyone else
const USER_CONCURRENCY = 10;

type Profile = { lastPeriodStart?: string; periodStartDates?: string[]; cycleLength?: number; timezone?: string };
type Settings = { role?: string; periodReminders?: boolean };

function todayIn(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / MS_PER_DAY);
}

function addDays(key: string, days: number): string {
  return new Date(Date.parse(`${key}T12:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Mirrors the app: cycle day wraps at the cycle length; next start is the day after the cycle ends. */
function nextPeriod(profile: Profile, today: string): { date: string; daysAway: number } | null {
  const starts = profile.periodStartDates ?? [];
  const last = profile.lastPeriodStart ?? starts[starts.length - 1];
  if (!starts.length || !last) return null;
  const cycle = profile.cycleLength || 28;
  const day = ((dayDiff(last, today) % cycle) + cycle) % cycle + 1;
  const daysAway = cycle - day + 1;
  return { date: addDays(today, daysAway), daysAway };
}

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
    const profile = (state?.cycle_profile ?? {}) as Profile;
    const settings = (state?.app_settings ?? {}) as Settings;
    if (!settings.periodReminders || settings.role === "partner") return 0;

    const next = nextPeriod(profile, todayIn(profile.timezone || "UTC"));
    if (!next || !DAYS_BEFORE.includes(next.daysAway)) return 0;

    const { error: logError } = await admin.from("reminder_log").insert({ user_id: userId, period_start: next.date, days_before: next.daysAway });
    if (logError) return 0; // already sent for this period

    const when = new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${next.date}T12:00:00Z`));
    const title = next.daysAway === 1 ? "Your period is expected tomorrow" : "Your period is expected in 2 days";
    const payload = JSON.stringify({ title, body: `Around ${when}.`, tag: `phasetwo-period-reminder-${next.daysAway}`, url: "/" });

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
    if (delivered === 0) await admin.from("reminder_log").delete().match({ user_id: userId, period_start: next.date, days_before: next.daysAway });
    return delivered;
  }

  for (const group of chunk(userIds, USER_CONCURRENCY)) {
    const results = await Promise.allSettled(group.map((userId) => remindUser(userId)));
    for (const result of results) if (result.status === "fulfilled") sent += result.value;
  }

  return Response.json({ users: userIds.length, sent });
});
