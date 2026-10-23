import { describe, expect, it } from "vitest";
import { nextPeriod, selectPush, todayIn, type PushProfile } from "./pushContent";

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
