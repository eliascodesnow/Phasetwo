import { describe, expect, it } from "vitest";
import { classifyDay } from "../components/PeriodCalendar";
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

  it("classifies a past day as recorded inside the current period", () => {
    expect(classifyDay("2026-10-07", ["2026-10-07"], 5, "2026-10-08", "2026-10-12")).toBe("recorded");
  });

  it("classifies today as recorded inside the current period", () => {
    expect(classifyDay("2026-10-08", ["2026-10-07"], 5, "2026-10-08", "2026-10-12")).toBe("recorded");
  });

  it("classifies a future day in the current period window as estimated", () => {
    expect(classifyDay("2026-10-09", ["2026-10-07"], 5, "2026-10-08", "2026-10-12")).toBe("estimated");
  });

  it("classifies a future day in the next predicted period as estimated without double counting", () => {
    expect(classifyDay("2026-10-12", ["2026-10-07"], 5, "2026-10-08", "2026-10-12")).toBe("estimated");
  });

  it("returns none for a day outside all period windows", () => {
    expect(classifyDay("2026-10-18", ["2026-10-07"], 5, "2026-10-08", "2026-10-12")).toBe("none");
  });

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
