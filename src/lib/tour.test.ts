import { describe, expect, it } from "vitest";
import { TOUR_STEPS, tourStepsFor } from "./tour";

describe("app tour steps", () => {
  it("has unique step ids", () => {
    const ids = TOUR_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("starts with the welcome step and ends with the done step for every role", () => {
    for (const role of ["self", "partner"] as const) {
      const steps = tourStepsFor(role);
      expect(steps[0].id).toBe("welcome");
      expect(steps[steps.length - 1].id).toBe("done");
    }
  });

  it("teaches period logging to people who track their own cycle", () => {
    const self = tourStepsFor("self");
    const logging = self.find((step) => step.id === "log-period");
    expect(logging).toBeDefined();
    expect(logging?.points?.join(" ")).toContain("Record period");
  });

  it("keeps self-only steps away from partners and partner steps away from self", () => {
    const self = tourStepsFor("self").map((step) => step.id);
    const partner = tourStepsFor("partner").map((step) => step.id);
    expect(self).not.toContain("partner-cycle");
    expect(partner).not.toContain("log-period");
    expect(partner).not.toContain("check-in");
    expect(partner).toContain("partner-cycle");
    expect(partner).toContain("settings");
  });
});
