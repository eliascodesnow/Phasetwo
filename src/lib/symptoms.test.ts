import { describe, expect, it } from "vitest";
import { defaultSettings } from "./storage";
import { PAIN_LOCATION_LABELS, SYMPTOM_LABELS, buildSymptomLogMeta } from "./symptoms";

describe("symptom labels", () => {
  it("exposes friendly labels for the available options", () => {
    expect(PAIN_LOCATION_LABELS.lower_abdomen).toBe("Lower abdomen");
    expect(PAIN_LOCATION_LABELS.lower_back).toBe("Lower back");
    expect(SYMPTOM_LABELS.cramps).toBe("Cramps");
    expect(SYMPTOM_LABELS.bloating).toBe("Bloating");
  });
});

describe("ai provider settings", () => {
  it("stores the OpenRouter API key field instead of the deprecated Gemini field", () => {
    expect(defaultSettings).toMatchObject({
      openRouterApiKey: "",
      ldrEnabled: false,
    });
    expect("geminiApiKey" in defaultSettings).toBe(false);
  });
});

describe("symptom date auto-fill", () => {
  it("fills the cycle day and phase from the profile for a given log date", () => {
    const profile = {
      lastPeriodStart: "2026-09-01",
      cycleLength: 28,
      periodLength: 5,
      ownerLabel: "You",
      timezone: "UTC",
      city: "Berlin",
    };

    const result = buildSymptomLogMeta("2026-09-10", profile);

    expect(result.log_date).toBe("2026-09-10");
    expect(result.cycle_day).toBe(10);
    expect(result.phase).toBe("follicular");
  });

  it("tracks dates that fall into the luteal phase near the cycle end", () => {
    const profile = {
      lastPeriodStart: "2026-09-01",
      cycleLength: 28,
      periodLength: 5,
      ownerLabel: "You",
      timezone: "UTC",
      city: "Berlin",
    };

    const result = buildSymptomLogMeta("2026-09-23", profile);

    expect(result.log_date).toBe("2026-09-23");
    expect(result.cycle_day).toBe(23);
    expect(result.phase).toBe("luteal");
  });
});
