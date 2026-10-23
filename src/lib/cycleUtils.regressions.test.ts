import { describe, expect, it } from "vitest";
import type { CycleProfile } from "../types";
import { currentCycleDay, editPeriodStart, periodStartContaining, recordPeriodStart, removePeriodStart } from "./cycleUtils";

const base: CycleProfile = {
  lastPeriodStart: "2026-10-07",
  periodStartDates: ["2026-10-07"],
  cycleLength: 28,
  periodLength: 5,
  ownerLabel: "You",
  timezone: "UTC",
  city: "",
};

describe("cycle day is the same in every timezone", () => {
  it("counts the start date as day 1 and wraps at the cycle length", () => {
    expect(currentCycleDay(base, new Date(2026, 9, 7, 0, 30))).toBe(1);
    expect(currentCycleDay(base, new Date(2026, 9, 7, 23, 30))).toBe(1);
    expect(currentCycleDay(base, new Date(2026, 9, 8, 9))).toBe(2);
    expect(currentCycleDay(base, new Date(2026, 10, 3, 9))).toBe(28);
    expect(currentCycleDay(base, new Date(2026, 10, 4, 9))).toBe(1);
  });
});

describe("period start edits keep data safe", () => {
  it("won't remove the only recorded start, or its end date", () => {
    const withEnd = { ...base, periodEnds: { "2026-10-07": "2026-10-11" } };
    expect(removePeriodStart(withEnd, "2026-10-07")).toBe(withEnd);
  });

  it("ignores removing a date that was never recorded", () => {
    expect(removePeriodStart(base, "2026-09-01")).toBe(base);
  });

  it("treats a profile with no start list as having its lastPeriodStart recorded", () => {
    const legacy = { ...base, periodStartDates: undefined };
    expect(periodStartContaining(legacy, "2026-10-09")).toBe("2026-10-07");
  });

  it("rejects malformed or impossible dates when editing", () => {
    expect(editPeriodStart(base, "2026-10-07", "not-a-date")).toBe(base);
    expect(editPeriodStart(base, "2026-10-07", "2026-13-45")).toBe(base);
    expect(editPeriodStart(base, "2026-02-01", "2026-10-09")).toBe(base);
  });

  it("moves a start and its end date together", () => {
    const edited = editPeriodStart({ ...base, periodEnds: { "2026-10-07": "2026-10-11" } }, "2026-10-07", "2026-10-06");
    expect(edited.periodStartDates).toEqual(["2026-10-06"]);
    expect(edited.periodEnds).toEqual({ "2026-10-06": "2026-10-11" });
  });

  it("ignores a second tap inside an already-recorded period", () => {
    expect(recordPeriodStart(base, "2026-10-08")).toBe(base);
    expect(recordPeriodStart(base, "2026-10-07")).toBe(base);
    expect(recordPeriodStart(base, "2026-10-05")).toBe(base);
    expect(recordPeriodStart(base, "garbage")).toBe(base);
  });

  it("still records a genuine next period", () => {
    const next = recordPeriodStart(base, "2026-11-04");
    expect(next.periodStartDates).toEqual(["2026-10-07", "2026-11-04"]);
    expect(next.lastPeriodStart).toBe("2026-11-04");
    expect(next.cycleLength).toBe(28);
  });
});
