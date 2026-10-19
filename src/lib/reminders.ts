import type { CycleProfile } from "../types";
import { currentCycleDay } from "./cycleUtils";

/** Days before the predicted period start on which a reminder is sent. */
export const REMINDER_DAYS_BEFORE = [2, 1] as const;

export interface PeriodReminder {
  daysBefore: (typeof REMINDER_DAYS_BEFORE)[number];
  /** Predicted period start, yyyy-mm-dd (local time). */
  periodDate: string;
  /** Stable key used to make sure each reminder fires only once. */
  key: string;
  title: string;
  body: string;
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Returns the reminder due today (2 days or 1 day before the predicted period), or null. */
export function dueReminder(profile: CycleProfile, asOf: Date = new Date()): PeriodReminder | null {
  const cycleLength = profile.cycleLength || 28;
  const daysUntil = cycleLength - currentCycleDay(profile, asOf) + 1;
  const daysBefore = REMINDER_DAYS_BEFORE.find((n) => n === daysUntil);
  if (!daysBefore) return null;

  const next = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() + daysUntil);
  const periodDate = dateKey(next);
  return {
    daysBefore,
    periodDate,
    key: `phasetwo:period-reminder:${periodDate}:${daysBefore}`,
    title: daysBefore === 1 ? "Your period is expected tomorrow" : "Your period is expected in 2 days",
    body: daysBefore === 1
      ? "Tomorrow is your predicted period start. Keep supplies close and plan some rest."
      : "Your predicted period starts in 2 days. A good moment to get supplies and plan ahead.",
  };
}
