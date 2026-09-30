import { describe, expect, it } from "vitest";
import { recordPeriodStart } from "./cycleUtils";

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
});