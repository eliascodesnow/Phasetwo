import { describe, expect, it } from "vitest";
import { classifyDay } from "../components/PeriodCalendar";
import { calculateWeeklyPeriodStreak, currentCycleDay, dateKeyInZone, daysUntilNextPeriod, editPeriodStart, energyAtCycleFraction, periodStartContaining, predictedPeriodStarts, recordPeriodEnd, recordPeriodStart, removePeriodStart } from "./cycleUtils";

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

  it("keeps the energy curve in range, peaking mid-cycle and low at the ends", () => {
    for (let i = 0; i <= 100; i += 1) {
      const value = energyAtCycleFraction(i / 100);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(energyAtCycleFraction(0.5)).toBeGreaterThan(energyAtCycleFraction(0));
    expect(energyAtCycleFraction(0.5)).toBeGreaterThan(energyAtCycleFraction(0.9));
    expect(energyAtCycleFraction(-1)).toBe(energyAtCycleFraction(0));
    expect(energyAtCycleFraction(2)).toBe(energyAtCycleFraction(1));
  });
});

describe("period end and predictions", () => {
  const base = {
    lastPeriodStart: "2026-10-07",
    periodStartDates: ["2026-10-07"],
    cycleLength: 28,
    periodLength: 5,
    ownerLabel: "You",
    timezone: "UTC",
    city: "",
  };
  const asOf = new Date("2026-10-09T12:00:00");

  it("ends a period early and stops marking later days", () => {
    const ended = recordPeriodEnd(base, "2026-10-07", "2026-10-09");
    expect(classifyDay("2026-10-09", ["2026-10-07"], 5, "2026-10-09", "", { ends: ended.periodEnds })).toBe("recorded");
    expect(classifyDay("2026-10-10", ["2026-10-07"], 5, "2026-10-09", "", { ends: ended.periodEnds })).toBe("none");
  });

  it("ignores an end before the start", () => {
    expect(recordPeriodEnd(base, "2026-10-07", "2026-10-05")).toBe(base);
  });

  it("drops the end date when its period is removed", () => {
    const two = recordPeriodStart(recordPeriodEnd(base, "2026-10-07", "2026-10-09"), "2026-11-04");
    expect(removePeriodStart(two, "2026-10-07").periodEnds?.["2026-10-07"]).toBeUndefined();
  });

  it("finds the period that contains a day", () => {
    expect(periodStartContaining(base, "2026-10-10")).toBe("2026-10-07");
    expect(periodStartContaining(base, "2026-10-20")).toBeUndefined();
  });

  it("predicts several future periods one cycle apart and marks them", () => {
    const starts = predictedPeriodStarts(base, 3, asOf);
    expect(starts).toEqual(["2026-11-04", "2026-12-02", "2026-12-30"]);
    expect(classifyDay("2026-12-03", ["2026-10-07"], 5, "2026-10-09", "", { futureStarts: starts })).toBe("estimated");
    expect(classifyDay("2026-12-08", ["2026-10-07"], 5, "2026-10-09", "", { futureStarts: starts })).toBe("none");
  });

  it("counts days until the next period", () => {
    expect(daysUntilNextPeriod(base, asOf)).toBe(26);
  });
});

describe("partner view reads the owner's timezone", () => {
  const profile = { lastPeriodStart: "2026-10-01", cycleLength: 28, periodLength: 5, ownerLabel: "Her", timezone: "Pacific/Kiritimati", city: "" };
  // 2026-10-24 23:30 UTC is already 2026-10-25 in Kiritimati (UTC+14) but still the 24th in UTC.
  const instant = new Date("2026-10-24T23:30:00Z");
  it("uses the owner's calendar date for the shared copy", () => {
    expect(currentCycleDay({ ...profile, viewInOwnerTimezone: true }, instant)).toBe(25);
  });
  it("reads dates in the named zone and tolerates an unknown one", () => {
    expect(dateKeyInZone(instant, "UTC")).toBe("2026-10-24");
    expect(dateKeyInZone(instant, "Pacific/Kiritimati")).toBe("2026-10-25");
    expect(dateKeyInZone(instant, "Not/AZone")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
