import { describe, expect, it } from "vitest";
import { calculateWeeklyPeriodStreak, editPeriodStart, recordPeriodStart, removePeriodStart } from "./cycleUtils";

describe("period start tracking", () => {
  const profile = {
    lastPeriodStart: "2026-08-01",
    cycleLength: 28,
    periodLength: 5,
    ownerLabel: "You",
    timezone: "UTC",
    city: "",
  };

  it("records period starts and updates the observed cycle length", () => {
    const updated = recordPeriodStart(profile, "2026-09-01");

    expect(updated.lastPeriodStart).toBe("2026-09-01");
    expect(updated.periodStartDates).toEqual(["2026-08-01", "2026-09-01"]);
    expect(updated.cycleLength).toBe(31);
  });

  it("does not duplicate a period start logged for the same date", () => {
    const updated = recordPeriodStart(
      { ...profile, periodStartDates: ["2026-08-01", "2026-09-01"], lastPeriodStart: "2026-09-01" },
      "2026-09-01"
    );

    expect(updated.periodStartDates).toEqual(["2026-08-01", "2026-09-01"]);
  });

  it("edits a recorded date and recalculates the latest start", () => {
    const updated = editPeriodStart(
      { ...profile, periodStartDates: ["2026-08-01", "2026-09-01"], lastPeriodStart: "2026-09-01" },
      "2026-09-01",
      "2026-09-03",
    );

    expect(updated.periodStartDates).toEqual(["2026-08-01", "2026-09-03"]);
    expect(updated.lastPeriodStart).toBe("2026-09-03");
    expect(updated.cycleLength).toBe(33);
  });

  it("removes a recorded date while keeping the remaining latest date", () => {
    const updated = removePeriodStart(
      { ...profile, periodStartDates: ["2026-08-01", "2026-09-01"], lastPeriodStart: "2026-09-01" },
      "2026-09-01",
    );

    expect(updated.periodStartDates).toEqual(["2026-08-01"]);
    expect(updated.lastPeriodStart).toBe("2026-08-01");
  });

  it("counts a weekly streak when the user records a period or check-in on consecutive days", () => {
    const result = calculateWeeklyPeriodStreak(
      { ...profile, periodStartDates: ["2026-08-27", "2026-08-28"] },
      [
        { log_date: "2026-08-25" },
        { log_date: "2026-08-26" },
        { log_date: "2026-08-27" },
        { log_date: "2026-08-28" },
        { log_date: "2026-08-29" },
      ],
      new Date("2026-08-29T12:00:00Z")
    );

    expect(result.currentDays).toBe(5);
    expect(result.goal).toBe(7);
    expect(result.active).toBe(true);
    expect(result.message).toContain("5-day streak");
  });
});