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
  // Scale the last (luteal) phase to absorb any difference from the default 28-day length.
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

export function currentCycleDay(profile: CycleProfile, asOf: Date = new Date()): number {
  const start = startOfDay(new Date(profile.lastPeriodStart));
  const today = startOfDay(asOf);
  const diff = Math.floor((today.getTime() - start.getTime()) / MS_PER_DAY);
  const cycleLength = profile.cycleLength || 28;
  const dayInCycle = ((diff % cycleLength) + cycleLength) % cycleLength;
  return dayInCycle + 1;
}

export function currentPhase(profile: CycleProfile, asOf: Date = new Date()): PhaseInfo {
  const day = currentCycleDay(profile, asOf);
  return phaseForDay(day, profile.cycleLength || 28);
}

export function recordPeriodStart(profile: CycleProfile, date: string): CycleProfile {
  return withPeriodStarts(profile, [...(profile.periodStartDates ?? []), profile.lastPeriodStart, date]);
}

export function editPeriodStart(profile: CycleProfile, previousDate: string, nextDate: string): CycleProfile {
  const starts = profile.periodStartDates?.length ? profile.periodStartDates : [profile.lastPeriodStart];
  return withPeriodStarts(profile, starts.map((date) => date === previousDate ? nextDate : date));
}

export function removePeriodStart(profile: CycleProfile, date: string): CycleProfile {
  const starts = profile.periodStartDates?.length ? profile.periodStartDates : [profile.lastPeriodStart];
  const remaining = starts.filter((start) => start !== date);
  return withPeriodStarts(profile, remaining.length ? remaining : [profile.lastPeriodStart]);
}

function withPeriodStarts(profile: CycleProfile, values: string[]): CycleProfile {
  const starts = [...new Set(values)]
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort((left, right) => left.localeCompare(right));
  const intervals = starts.slice(1).map((start, index) => {
    const previous = new Date(`${starts[index]}T12:00:00`);
    const current = new Date(`${start}T12:00:00`);
    return Math.round((current.getTime() - previous.getTime()) / MS_PER_DAY);
  }).filter((days) => days >= 20 && days <= 45);
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
  const start = startOfDay(new Date(profile.lastPeriodStart));
  const cycleLength = profile.cycleLength || 28;
  const day = currentCycleDay(profile, asOf);
  const daysUntilNext = cycleLength - day + 1;
  const next = new Date(asOf);
  next.setDate(next.getDate() + daysUntilNext);
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
