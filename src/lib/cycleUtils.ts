import type { CycleProfile, Phase, PhaseInfo, Task } from "../types";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const PHASES: PhaseInfo[] = [
  {
    key: "menstrual",
    label: "Menstrual",
    dayRange: [1, 5],
    energy: "low",
    summary:
      "Energy is at its lowest. The body is shedding and repairing. Good window for rest, gentle movement, and low-stakes admin.",
  },
  {
    key: "follicular",
    label: "Follicular",
    dayRange: [6, 13],
    energy: "rising",
    summary:
      "Estrogen climbs and energy follows. Cognitive capacity and openness to new ideas are elevated — a strong window for planning and starting things.",
  },
  {
    key: "ovulatory",
    label: "Ovulatory",
    dayRange: [14, 15],
    energy: "peak",
    summary:
      "Peak energy and social confidence. Good for high-intensity workouts, presentations, and anything that benefits from being sharp and outgoing.",
  },
  {
    key: "luteal",
    label: "Luteal",
    dayRange: [16, 28],
    energy: "winding down",
    summary:
      "Energy tapers as the cycle winds down. Later days may bring PMS symptoms. Favor wrap-up work, routine tasks, and extra self-care.",
  },
];

/** Given a cycle day (1-indexed, wraps at cycleLength), return the active phase. */
export function phaseForDay(day: number, cycleLength: number): PhaseInfo {
  // Phases are scaled proportionally; luteal always ends on the final day of the cycle.
  const scale = cycleLength / 28;
  const scaled = PHASES.map((p) => ({
    ...p,
    dayRange: [
      Math.round((p.dayRange[0] - 1) * scale) + 1,
      p.key === "luteal" ? cycleLength : Math.round(p.dayRange[1] * scale),
    ] as [number, number],
  }));
  const found = scaled.find((p) => day >= p.dayRange[0] && day <= p.dayRange[1]);
  return found ?? scaled[scaled.length - 1];
}

/**
 * Current day of the cycle (1-indexed). Computed from calendar-date keys (noon-anchored)
 * so it is correct in every timezone and across DST changes.
 */
export function currentCycleDay(profile: CycleProfile, asOf: Date = new Date()): number {
  const today = profile.viewInOwnerTimezone ? dateKeyInZone(asOf, profile.timezone) : dateKey(asOf);
  const diff = keyDiff(profile.lastPeriodStart.slice(0, 10), today);
  const cycleLength = profile.cycleLength || 28;
  const dayInCycle = ((diff % cycleLength) + cycleLength) % cycleLength;
  return dayInCycle + 1;
}

export function currentPhase(profile: CycleProfile, asOf: Date = new Date()): PhaseInfo {
  const day = currentCycleDay(profile, asOf);
  return phaseForDay(day, profile.cycleLength || 28);
}

/**
 * Record a new period start. Returns the profile unchanged if the date is invalid or overlaps
 * an already-recorded period (prevents accidental double taps). Blocking future dates is a UI decision.
 */
export function recordPeriodStart(profile: CycleProfile, date: string): CycleProfile {
  if (!isValidDateKey(date)) return profile;
  const starts = getStarts(profile);
  const overlaps = starts.some((start) => {
    const diff = keyDiff(start, date);
    return diff >= 0 ? diff < periodSpan(profile, start) : -diff < periodSpan(profile, date);
  });
  if (overlaps) return profile;
  return withPeriodStarts(profile, [...starts, date]);
}

/** Move a recorded period start. Returns the profile unchanged if either date is invalid or unknown. */
export function editPeriodStart(profile: CycleProfile, previousDate: string, nextDate: string): CycleProfile {
  const starts = getStarts(profile);
  if (!starts.includes(previousDate) || !isValidDateKey(nextDate)) return profile;
  const moved = withPeriodStarts(profile, starts.map((date) => (date === previousDate ? nextDate : date)));
  const end = profile.periodEnds?.[previousDate];
  if (!end || previousDate === nextDate) return moved;
  const { [previousDate]: _removed, ...rest } = moved.periodEnds ?? {};
  return { ...moved, periodEnds: end >= nextDate ? { ...rest, [nextDate]: end } : rest };
}

/**
 * Remove a recorded period start. The last remaining start can't be removed
 * (the profile always needs one), so the profile is returned unchanged in that case.
 */
export function removePeriodStart(profile: CycleProfile, date: string): CycleProfile {
  const starts = getStarts(profile);
  if (!starts.includes(date) || starts.length <= 1) return profile;
  const next = withPeriodStarts(profile, starts.filter((start) => start !== date));
  if (!next.periodEnds?.[date]) return next;
  const { [date]: _removed, ...rest } = next.periodEnds;
  return { ...next, periodEnds: rest };
}

/** Local calendar date as yyyy-mm-dd (not UTC, so late-night taps land on the right day). */
export function dateKey(date: Date = new Date()): string {
  return formatDateKey(date);
}

/** Calendar date (yyyy-mm-dd) in an IANA timezone; falls back to the device's date if the zone is unknown. */
export function dateKeyInZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    const key = `${get("year")}-${get("month")}-${get("day")}`;
    return isValidDateKey(key) ? key : dateKey(date);
  } catch {
    return dateKey(date);
  }
}

function keyDiff(from: string, to: string): number {
  return Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / MS_PER_DAY);
}

/** True only for real calendar dates in yyyy-mm-dd form (rejects e.g. 2026-13-45 and 2026-02-30). */
function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Recorded period starts, falling back to the legacy single lastPeriodStart. */
function getStarts(profile: CycleProfile): string[] {
  return profile.periodStartDates?.length ? profile.periodStartDates : [profile.lastPeriodStart];
}

/** Number of days a recorded period covers: up to its recorded end, otherwise the usual length. */
export function periodSpan(profile: Pick<CycleProfile, "periodLength" | "periodEnds">, start: string): number {
  const end = profile.periodEnds?.[start];
  return end && end >= start ? Math.min(14, keyDiff(start, end) + 1) : profile.periodLength;
}

/** The recorded period start whose window contains the given day, if any. */
export function periodStartContaining(profile: CycleProfile, key: string): string | undefined {
  return getStarts(profile).find((start) => {
    const elapsed = keyDiff(start, key);
    return elapsed >= 0 && elapsed < periodSpan(profile, start);
  });
}

/** Mark the day a period ended. Ignored if it falls before the start or more than 14 days after. */
export function recordPeriodEnd(profile: CycleProfile, start: string, end: string): CycleProfile {
  if (end < start || keyDiff(start, end) > 13) return profile;
  return { ...profile, periodEnds: { ...(profile.periodEnds ?? {}), [start]: end } };
}

/** Start dates of the next few predicted periods, one cycle apart. */
export function predictedPeriodStarts(profile: CycleProfile, count = 6, asOf: Date = new Date()): string[] {
  const cycleLength = profile.cycleLength || 28;
  const first = nextPeriodEstimate(profile, asOf);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(first);
    date.setDate(date.getDate() + index * cycleLength);
    return formatDateKey(date);
  });
}

/** Whole days until the next predicted period start. */
export function daysUntilNextPeriod(profile: CycleProfile, asOf: Date = new Date()): number {
  return (profile.cycleLength || 28) - currentCycleDay(profile, asOf) + 1;
}

function withPeriodStarts(profile: CycleProfile, values: string[]): CycleProfile {
  const starts = [...new Set(values)]
    .filter(isValidDateKey)
    .sort((left, right) => left.localeCompare(right));
  const intervals = starts
    .slice(1)
    .map((start, index) => keyDiff(starts[index], start))
    .filter((days) => days >= 20 && days <= 45);
  const recentIntervals = intervals.slice(-6);
  const cycleLength = recentIntervals.length
    ? Math.round(recentIntervals.reduce((total, days) => total + days, 0) / recentIntervals.length)
    : profile.cycleLength;

  return {
    ...profile,
    lastPeriodStart: starts[starts.length - 1] ?? profile.lastPeriodStart,
    periodStartDates: starts.slice(-24),
    cycleLength,
  };
}

/**
 * Relative energy (0 to 1) at a point in the cycle, where `fraction` runs from 0 (first day)
 * to 1 (the day before the next period). A smooth illustration, not a measurement.
 */
export function energyAtCycleFraction(fraction: number): number {
  const keys: Array<[number, number]> = [
    [0, 0.2], [0.18, 0.28], [0.35, 0.7], [0.5, 0.95], [0.6, 0.72], [0.75, 0.5], [0.9, 0.34], [1, 0.2],
  ];
  const f = Math.min(1, Math.max(0, fraction));
  for (let i = 1; i < keys.length; i += 1) {
    const [x1, y1] = keys[i];
    if (f <= x1) {
      const [x0, y0] = keys[i - 1];
      const t = (f - x0) / (x1 - x0);
      const eased = (1 - Math.cos(t * Math.PI)) / 2;
      return y0 + (y1 - y0) * eased;
    }
  }
  return keys[keys.length - 1][1];
}

export function cycleProgressPercent(profile: CycleProfile, asOf: Date = new Date()): number {
  const day = currentCycleDay(profile, asOf);
  return Math.round((day / (profile.cycleLength || 28)) * 100);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDateKey(date: Date): string {
  const normalized = startOfDay(date);
  const year = normalized.getFullYear();
  const month = String(normalized.getMonth() + 1).padStart(2, "0");
  const day = String(normalized.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function nextPeriodEstimate(profile: CycleProfile, asOf: Date = new Date()): Date {
  const next = new Date(asOf);
  next.setDate(next.getDate() + daysUntilNextPeriod(profile, asOf));
  return next;
}

export function calculateWeeklyPeriodStreak(
  profile: CycleProfile,
  logs: Array<{ log_date?: string | null }>,
  asOf: Date = new Date()
): { currentDays: number; bestDays: number; goal: number; active: boolean; message: string; } {
  const trackedDates = new Set<string>();
  for (const date of profile.periodStartDates ?? []) {
    if (date) trackedDates.add(date);
  }
  for (const entry of logs) {
    if (entry.log_date) trackedDates.add(entry.log_date);
  }

  const today = startOfDay(asOf);
  let currentDays = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = formatDateKey(date);
    if (!trackedDates.has(key)) break;
    currentDays += 1;
  }

  let bestDays = 0;
  let run = 0;
  for (let offset = 0; offset < 30; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = formatDateKey(date);
    if (trackedDates.has(key)) {
      run += 1;
      bestDays = Math.max(bestDays, run);
    } else {
      run = 0;
    }
  }

  const goal = 7;
  const active = currentDays >= 3;
  if (currentDays === 0) {
    return { currentDays: 0, bestDays, goal, active: false, message: "Start your 7-day streak" };
  }
  if (currentDays >= goal) {
    return { currentDays, bestDays, goal, active: true, message: "7-day streak! Great job" };
  }
  return { currentDays, bestDays, goal, active, message: `${currentDays}-day streak` };
}

/** Sort tasks so ones matching the current phase float to the top, without reordering within groups. */
export function sortTasksForPhase(tasks: Task[], phase: Phase): Task[] {
  const matching = tasks.filter((t) => t.recommendedPhases.includes(phase));
  const rest = tasks.filter((t) => !t.recommendedPhases.includes(phase));
  return [...matching, ...rest];
}

export function formatTimeInZone(tz: string, date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    }).format(date);
  } catch {
    return "—";
  }
}

export function formatDateInZone(tz: string, date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: tz,
    }).format(date);
  } catch {
    return "—";
  }
}
