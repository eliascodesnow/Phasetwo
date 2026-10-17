import type { CycleProfile } from "../types";
import { dateKey, daysUntilNextPeriod, nextPeriodEstimate } from "./cycleUtils";
import { supabase } from "./supabase";

export const REMINDER_DAYS_BEFORE = 2;
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";

export type ReminderResult = "enabled" | "denied" | "unsupported";

export function remindersSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready);
}

function keyToBytes(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/** Ask for permission, register the worker, and (if configured) save a push subscription for the account. */
export async function enableReminders(): Promise<ReminderResult> {
  if (!remindersSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const reg = await registration();

  if (VAPID_PUBLIC_KEY && supabase && "pushManager" in reg) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const subscription = (await reg.pushManager.getSubscription())
          ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) as BufferSource });
        const json = subscription.toJSON();
        if (json.endpoint && json.keys?.p256dh && json.keys.auth) {
          await supabase.from("push_subscriptions").upsert(
            { user_id: user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 200) },
            { onConflict: "endpoint" },
          );
        }
      }
    } catch {
      // The in-app reminder below still works without a server push subscription.
    }
  }
  return "enabled";
}

export async function disableReminders(): Promise<void> {
  if (!remindersSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const subscription = await reg?.pushManager.getSubscription();
    if (subscription) {
      if (supabase) await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      await subscription.unsubscribe();
    }
  } catch {
    // Nothing to clean up if the browser has no subscription.
  }
}

/**
 * Fires the reminder when the app is opened exactly two days before the predicted period.
 * Server push covers the days the app stays closed; this guarantees one reminder per period either way.
 */
export async function showDueReminder(profile: CycleProfile): Promise<void> {
  if (!remindersSupported() || Notification.permission !== "granted") return;
  if (!(profile.periodStartDates?.length)) return;
  if (daysUntilNextPeriod(profile) !== REMINDER_DAYS_BEFORE) return;

  const due = nextPeriodEstimate(profile);
  const marker = `phasetwo:reminded:${dateKey(due)}`;
  try {
    if (window.localStorage.getItem(marker)) return;
    window.localStorage.setItem(marker, "1");
  } catch {
    // If storage is blocked, fall through and notify once per load.
  }
  const reg = await registration();
  await reg.showNotification("Period expected in 2 days", {
    body: `Around ${new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" }).format(due)}.`,
    icon: "/android-chrome-192x192.png",
    badge: "/favicon-32x32.png",
    tag: "phasetwo-period-reminder",
    data: { url: "/" },
  });
}
