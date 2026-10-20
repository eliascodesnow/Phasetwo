import { describe, expect, it } from "vitest";
import { MAX_TOUR_STEPS, TOUR_STEPS, tourStepsFor } from "./tour";

describe("app tour steps", () => {
  it("has unique step ids", () => {
    const ids = TOUR_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never shows more than the maximum number of steps", () => {
    for (const role of ["self", "partner"] as const) {
      const steps = tourStepsFor(role);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.length).toBeLessThanOrEqual(MAX_TOUR_STEPS);
    }
  });

  it("points every step at a button or area", () => {
    for (const step of TOUR_STEPS) {
      expect(step.target.length).toBeGreaterThan(0);
    }
  });

  it("starts people who track their own cycle with how to log a period", () => {
    const first = tourStepsFor("self")[0];
    expect(first.id).toBe("log-period");
    expect(first.target).toBe("record-period");
    expect(`${first.body} ${first.tips?.join(" ")}`).toContain("Period started");
    expect(first.tips?.join(" ")).toContain("Record period start");
  });

  it("explains each tab it points at", () => {
    const tabs = tourStepsFor("self").find((step) => step.id === "tabs");
    expect(tabs?.rows?.map((row) => row.label)).toEqual(["Calendar", "Planner", "History", "Report"]);
  });

  it("keeps self-only steps away from partners and the reverse", () => {
    const self = tourStepsFor("self").map((step) => step.id);
    const partner = tourStepsFor("partner").map((step) => step.id);
    expect(self).not.toContain("partner-cycle");
    expect(partner).not.toContain("log-period");
    expect(partner).not.toContain("check-in");
    expect(partner).toContain("partner-cycle");
  });
});
