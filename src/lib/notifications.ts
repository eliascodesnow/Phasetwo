import type { CycleProfile } from "../types";
import { dueReminder } from "./reminders";

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

/** Asks for notification permission. Must be called from a user gesture (e.g. a button click). */
export async function enableReminders(): Promise<ReminderSupport> {
  if (reminderSupport() === "unsupported") return "unsupported";
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission === "granted") await registration();
  return permission;
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
