import type { CycleProfile } from "../types";
import { dueReminder } from "./reminders";
import { supabase } from "./supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";

export type ReminderSupport = "unsupported" | "denied" | "default" | "granted";

export function reminderSupport(): ReminderSupport {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

function keyToBytes(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/** Saves a Web Push subscription for the signed-in account so the server can notify while the app is closed. */
async function subscribeForPush(): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !supabase || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready);
    if (!("pushManager" in reg)) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const subscription = (await reg.pushManager.getSubscription())
      ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) as BufferSource });
    const json = subscription.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys.auth) {
      // The RPC moves this device's subscription to whoever is signed in now (a plain upsert is refused by RLS
      // when another account used the same browser before).
      await supabase.rpc("register_push_subscription", {
        p_endpoint: json.endpoint,
        p_p256dh: json.keys.p256dh,
        p_auth: json.keys.auth,
        p_user_agent: navigator.userAgent.slice(0, 200),
      });
    }
  } catch {
    // The on-open reminder still works without a server push subscription.
  }
}

/** Asks for notification permission and sets up server push. Must be called from a user gesture (e.g. a button click). */
export async function enableReminders(): Promise<ReminderSupport> {
  if (reminderSupport() === "unsupported") return "unsupported";
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission === "granted") {
    await registration();
    await subscribeForPush();
  }
  return permission;
}

/** Removes this device's push subscription (the in-app toggle was switched off). */
export async function disableReminders(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
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

/** Call before sign-out: removes this device's server push subscription so reminders stop for the old account. */
export async function releasePushSubscription(): Promise<void> {
  await disableReminders();
}

function alreadySent(key: string): boolean {
  try { return localStorage.getItem(key) !== null; } catch { return false; }
}

function markSent(key: string): void {
  try { localStorage.setItem(key, new Date().toISOString()); } catch { /* storage unavailable */ }
}

/** Shows today's reminder if one is due and has not been shown yet. Returns true if one was shown. */
export async function sendDueReminder(profile: CycleProfile, asOf: Date = new Date()): Promise<boolean> {
  if (reminderSupport() !== "granted") return false;
  const reminder = dueReminder(profile, asOf);
  if (!reminder || alreadySent(reminder.key)) return false;

  const reg = await registration();
  if (!reg) return false;
  await reg.showNotification(reminder.title, {
    body: reminder.body,
    icon: "/android-chrome-192x192.png",
    badge: "/favicon-32x32.png",
    tag: reminder.key,
    data: { url: "/" },
  });
  markSent(reminder.key);
  return true;
}
