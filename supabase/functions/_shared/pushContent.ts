// PUSH notification content and scheduling rules.
//
// Push is for short, time-sensitive nudges that are still safe to read on a lock screen. Anything
// longer, educational, or sensitive (fertility, mood, health warnings) lives in the app instead:
// see src/lib/notificationContent.ts. Keep the two files separate on purpose.
//
// This file is plain TypeScript (no Deno globals, no URL imports) so it can be unit tested with Vitest.

export type PushKind = "period-2d" | "period-1d" | "period-due" | "pms-heads-up";

export interface PushProfile {
  lastPeriodStart?: string;
  periodStartDates?: string[];
  cycleLength?: number;
  timezone?: string;
}

export interface PushPrefs {
  /** "Period reminders": 2 days and 1 day before the predicted period. */
  periodReminders?: boolean;
  /** "Cycle tips": the extra nudges below. Off unless the person turns it on. */
  phaseTips?: boolean;
  role?: string;
}

export interface PushMessage {
  kind: PushKind;
  /**
   * Written to reminder_log.days_before. 2 and 1 are the period reminders; 5 is the PMS heads-up;
   * 0 is "period due today". Together with period_start this keeps each message to once per cycle.
   */
  daysBefore: number;
  /** reminder_log.period_start: the predicted period start (for 0, the cycle's own start). */
  periodStart: string;
  title: string;
  body: string;
  tag: string;
  url: string;
}

const MS_PER_DAY = 86_400_000;

/** Days before the predicted period that the PMS heads-up goes out. */
export const PMS_HEADS_UP_DAYS = 5;

/** Shortest cycle for which the PMS heads-up still makes sense (it would otherwise land on day 1). */
const MIN_CYCLE_FOR_PMS_HEADS_UP = 21;

export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / MS_PER_DAY);
}

export function addDays(key: string, days: number): string {
  return new Date(Date.parse(`${key}T12:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Today's calendar date (yyyy-mm-dd) in the person's own timezone. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export interface NextPeriod {
  /** Predicted start of the next period, yyyy-mm-dd. */
  date: string;
  daysAway: number;
  /** 1-indexed day of the current cycle. */
  cycleDay: number;
  cycleLength: number;
}

/** Mirrors the app: the cycle day wraps at the cycle length; the next start is the day after the cycle ends. */
export function nextPeriod(profile: PushProfile, today: string): NextPeriod | null {
  const starts = profile.periodStartDates ?? [];
  const last = profile.lastPeriodStart ?? starts[starts.length - 1];
  if (!starts.length || !last) return null;
  const cycleLength = profile.cycleLength || 28;
  const cycleDay = ((dayDiff(last, today) % cycleLength) + cycleLength) % cycleLength + 1;
  const daysAway = cycleLength - cycleDay + 1;
  return { date: addDays(today, daysAway), daysAway, cycleDay, cycleLength };
}

function formatWhen(date: string): string {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

/**
 * The one push (if any) this person should get today. At most one per day: the trigger days
 * (5, 2 and 1 days before, and the due day) never coincide for a normal cycle length.
 */
export function selectPush(profile: PushProfile, today: string, prefs: PushPrefs): PushMessage | null {
  if (prefs.role === "partner") return null;
  const next = nextPeriod(profile, today);
  if (!next) return null;
  const url = "/";

  if (prefs.periodReminders && (next.daysAway === 2 || next.daysAway === 1)) {
    return {
      kind: next.daysAway === 1 ? "period-1d" : "period-2d",
      daysBefore: next.daysAway,
      periodStart: next.date,
      title: next.daysAway === 1 ? "Your period is expected tomorrow" : "Your period is expected in 2 days",
      body: `Around ${formatWhen(next.date)}.`,
      tag: `phasetwo-period-reminder-${next.daysAway}`,
      url,
    };
  }

  if (!prefs.phaseTips) return null;

  if (next.daysAway === PMS_HEADS_UP_DAYS && next.cycleLength >= MIN_CYCLE_FOR_PMS_HEADS_UP) {
    return {
      kind: "pms-heads-up",
      daysBefore: PMS_HEADS_UP_DAYS,
      periodStart: next.date,
      title: "Your period is about 5 days away",
      // Neutral wording on purpose: this can be read on a lock screen.
      body: "Some people feel more tired or bloated around now. A quick log helps you spot your own pattern.",
      tag: "phasetwo-pms-heads-up",
      url,
    };
  }

  if (next.cycleDay === 1) {
    return {
      kind: "period-due",
      daysBefore: 0,
      periodStart: today,
      title: "Your period may start today",
      body: "If cramps show up, heat, fluids and a regular meal can help. Log your start date when it begins.",
      tag: "phasetwo-period-due",
      url,
    };
  }

  return null;
}
