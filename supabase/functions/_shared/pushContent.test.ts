import { describe, expect, it } from "vitest";
import { phaseForDay } from "../../../src/lib/cycleUtils";
import {
  IDEAS, IDEA_CHANCE, IDEA_CODE_BASE, IDEA_MAX_PER_WEEK, IDEA_MIN_GAP_DAYS,
  addDays, dayDiff, nextPeriod, phaseOfDay, selectDailyPush, selectPhaseIdea, selectPush, todayIn, unitHash,
  type IdeaHistoryItem, type PushProfile,
} from "./pushContent";

// Cycle starts 2026-10-01 and is 28 days long, so the next period is predicted for 2026-10-29.
const profile: PushProfile = { lastPeriodStart: "2026-10-01", periodStartDates: ["2026-10-01"], cycleLength: 28, timezone: "UTC" };
const both = { periodReminders: true, phaseTips: true };

describe("push schedule", () => {
  it("keeps the existing period reminders and their wording", () => {
    const two = selectPush(profile, "2026-10-27", { periodReminders: true });
    expect(two).toMatchObject({ kind: "period-2d", daysBefore: 2, periodStart: "2026-10-29", title: "Your period is expected in 2 days", body: "Around Thursday, Oct 29." });
    const one = selectPush(profile, "2026-10-28", { periodReminders: true });
    expect(one).toMatchObject({ kind: "period-1d", daysBefore: 1, title: "Your period is expected tomorrow" });
  });

  it("sends the PMS heads-up 5 days before, only to people who opted in to cycle tips", () => {
    expect(selectPush(profile, "2026-10-24", both)).toMatchObject({ kind: "pms-heads-up", daysBefore: 5, periodStart: "2026-10-29" });
    expect(selectPush(profile, "2026-10-24", { periodReminders: true })).toBeNull();
  });

  it("nudges on the day the period may start, and keys it to that day", () => {
    expect(selectPush(profile, "2026-10-29", both)).toMatchObject({ kind: "period-due", daysBefore: 0, periodStart: "2026-10-29" });
    expect(selectPush(profile, "2026-10-29", { periodReminders: true })).toBeNull();
  });

  it("is quiet on every other day", () => {
    for (const day of ["2026-10-02", "2026-10-15", "2026-10-23", "2026-10-25", "2026-10-26"]) {
      expect(selectPush(profile, day, both)).toBeNull();
    }
  });

  it("never sends two different messages with the same log key in one cycle", () => {
    const keys = new Set<string>();
    for (let offset = 0; offset < 28; offset += 1) {
      const day = new Date(Date.UTC(2026, 9, 1 + offset)).toISOString().slice(0, 10);
      const message = selectPush(profile, day, both);
      if (message) keys.add(`${message.periodStart}:${message.daysBefore}`);
    }
    expect(keys.size).toBe(4);
  });

  it("skips partners, missing data and cycles too short for a PMS heads-up", () => {
    expect(selectPush(profile, "2026-10-27", { ...both, role: "partner" })).toBeNull();
    expect(selectPush({}, "2026-10-27", both)).toBeNull();
    const short = { ...profile, cycleLength: 20 };
    expect(selectPush(short, "2026-10-16", both)).toBeNull();
  });

  it("keeps lock-screen text free of fertility, sexual-health and mood claims", () => {
    for (const day of ["2026-10-24", "2026-10-27", "2026-10-28", "2026-10-29"]) {
      const message = selectPush(profile, day, both)!;
      expect(`${message.title} ${message.body}`).not.toMatch(/fertil|ovulat|pregnan|sex|mood|depress|anxi/i);
    }
  });
});

describe("push helpers", () => {
  it("wraps the cycle day and counts days to the next period", () => {
    expect(nextPeriod(profile, "2026-10-29")).toMatchObject({ cycleDay: 1, daysAway: 28, date: "2026-11-26" });
    expect(nextPeriod(profile, "2026-10-24")).toMatchObject({ cycleDay: 24, daysAway: 5, date: "2026-10-29" });
  });

  it("falls back to UTC for an unknown timezone", () => {
    expect(todayIn("Not/AZone", new Date("2026-10-23T10:00:00Z"))).toBe("2026-10-23");
    expect(todayIn("Pacific/Kiritimati", new Date("2026-10-23T12:00:00Z"))).toBe("2026-10-24");
  });
});

// ---- Phase ideas ---------------------------------------------------------------------------------

const optedIn = { phaseTips: true };

/** Runs the daily job for one person over many days, feeding each send back in as history. */
function simulate(userId: string, days: number, prefs = optedIn, start = "2026-10-01") {
  const history: IdeaHistoryItem[] = [];
  const log: Array<{ day: string; kind: string; code: number; body: string; title: string }> = [];
  for (let offset = 0; offset < days; offset += 1) {
    const day = addDays(start, offset);
    const message = selectDailyPush(profile, day, prefs, userId, history);
    if (!message) continue;
    log.push({ day, kind: message.kind, code: message.daysBefore, body: message.body, title: message.title });
    if (message.kind === "phase-idea") history.push({ code: message.daysBefore, sentOn: day });
  }
  return log;
}

describe("phase ideas: rare, random, never spammy", () => {
  it("never sends more than 2 in any 7 days or closer than 3 days apart, for many people", () => {
    for (let person = 0; person < 40; person += 1) {
      const sent = simulate(`user-${person}`, 120).filter((entry) => entry.kind === "phase-idea").map((entry) => entry.day);
      for (let index = 0; index < sent.length; index += 1) {
        if (index > 0) expect(dayDiff(sent[index - 1], sent[index])).toBeGreaterThanOrEqual(IDEA_MIN_GAP_DAYS);
        expect(sent.filter((day) => dayDiff(day, sent[index]) >= 0 && dayDiff(day, sent[index]) < 7).length).toBeLessThanOrEqual(IDEA_MAX_PER_WEEK);
      }
    }
  });

  it("averages a handful per cycle, not a daily stream", () => {
    let total = 0;
    for (let person = 0; person < 40; person += 1) total += simulate(`user-${person}`, 112).filter((entry) => entry.kind === "phase-idea").length;
    const perCycle = total / 40 / 4;
    expect(perCycle).toBeGreaterThan(2);
    expect(perCycle).toBeLessThan(7);
    expect(IDEA_CHANCE).toBeLessThanOrEqual(0.5);
  });

  it("is random across people and days but repeatable for the same person and day", () => {
    const a = simulate("user-a", 60).map((entry) => entry.day).join();
    expect(simulate("user-a", 60).map((entry) => entry.day).join()).toBe(a);
    const days = new Set(Array.from({ length: 12 }, (_, person) => simulate(`user-${person}`, 60).map((entry) => entry.day).join()));
    expect(days.size).toBeGreaterThan(8);
    expect(unitHash("x")).toBeGreaterThanOrEqual(0);
    expect(unitHash("x")).toBeLessThan(1);
  });

  it("is off unless Cycle tips is on, and never reaches partners", () => {
    expect(simulate("user-a", 90, {} as typeof optedIn).filter((entry) => entry.kind === "phase-idea")).toEqual([]);
    expect(simulate("user-a", 90, { phaseTips: true, role: "partner" } as typeof optedIn)).toEqual([]);
  });

  it("gives way to the period messages and skips the first day of a period", () => {
    const history: IdeaHistoryItem[] = [];
    for (let person = 0; person < 200; person += 1) {
      expect(selectPhaseIdea(profile, "2026-10-29", `user-${person}`, history)).toBeNull();
      expect(selectDailyPush(profile, "2026-10-27", { ...both }, `user-${person}`, history)?.kind).toBe("period-2d");
      expect(selectDailyPush(profile, "2026-10-24", { ...both }, `user-${person}`, history)?.kind).toBe("pms-heads-up");
    }
  });

  it("picks an idea that matches the current phase and avoids repeating recent ones", () => {
    for (let person = 0; person < 40; person += 1) {
      const history: IdeaHistoryItem[] = [];
      for (const entry of simulate(`user-${person}`, 60).filter((e) => e.kind === "phase-idea")) {
        const idea = IDEAS.find((item) => item.code === entry.code)!;
        const day = dayDiff("2026-10-01", entry.day) % 28 + 1;
        expect(idea.phase).toBe(phaseOfDay(day, 28));
        expect(history.some((item) => item.code === entry.code && dayDiff(item.sentOn, entry.day) < 30)).toBe(false);
        history.push({ code: entry.code, sentOn: entry.day });
      }
    }
  });

  it("logs each idea under its own code so reminder_log can rate-limit it", () => {
    expect(new Set(IDEAS.map((idea) => idea.code)).size).toBe(IDEAS.length);
    for (const idea of IDEAS) expect(idea.code).toBeGreaterThanOrEqual(IDEA_CODE_BASE);
    const message = simulate("user-a", 60).find((entry) => entry.kind === "phase-idea")!;
    expect(message.code).toBeGreaterThanOrEqual(IDEA_CODE_BASE);
  });
});

describe("phase ideas: wording", () => {
  const phases = ["menstrual", "follicular", "ovulatory", "luteal"] as const;

  it("has a healthy pool for every phase, each tagged for the future hobbies survey", () => {
    for (const phase of phases) {
      const pool = IDEAS.filter((idea) => idea.phase === phase);
      expect(pool.length).toBeGreaterThanOrEqual(8);
      for (const idea of pool) expect(idea.tags.length).toBeGreaterThan(0);
    }
  });

  it("is safe on a lock screen: no body, health, fertility or mood talk", () => {
    for (const idea of IDEAS) {
      expect(idea.text).not.toMatch(/period|cycle|phase|fertil|ovulat|pregnan|sex|mood|cramp|pms|hormon|estrogen|progesterone|symptom|bleed/i);
    }
  });

  it("makes no assumptions about work, study, hobbies or what women like", () => {
    for (const idea of IDEAS) {
      expect(idea.text).not.toMatch(/\b(coding|code|study|studying|homework|exam|work|office|presentation|meeting|girly|ladies|girls)\b/i);
      expect(idea.text).not.toMatch(/you will|always|guarantee|should/i);
    }
  });

  it("has no links, and every message stays short enough to read at a glance", () => {
    for (const entry of simulate("user-a", 120).filter((e) => e.kind === "phase-idea")) {
      expect(`${entry.title} ${entry.body}`).not.toMatch(/https?:|www\./i);
      expect(entry.body.length).toBeLessThanOrEqual(170);
    }
  });

  it("mixes soft and lively ideas in the same phase, since energy varies from person to person", () => {
    for (const phase of phases) {
      const tags = new Set(IDEAS.filter((idea) => idea.phase === phase).flatMap((idea) => idea.tags));
      expect(tags.size).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("phase boundaries match the app", () => {
  it("agrees with phaseForDay for every day of every normal cycle length", () => {
    for (let length = 21; length <= 35; length += 1) {
      for (let day = 1; day <= length; day += 1) {
        expect(phaseOfDay(day, length)).toBe(phaseForDay(day, length).key);
      }
    }
  });
});
