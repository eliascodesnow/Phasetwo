import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./supabase", () => ({ hasSupabaseConfig: false, supabase: null }));

import { defaultSettings } from "./storage";
import type { SymptomLog } from "./symptoms";
import { analyzeSymptomPatterns, PAIN_LOCATION_LABELS, SYMPTOM_LABELS, buildSymptomLogMeta, fetchLogs, hasUserConsented, saveUserConsent, upsertLog, type SymptomLog } from "./symptoms";

beforeEach(() => {
  const store = new Map<string, string>();

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
});

describe("symptom labels", () => {
  it("exposes friendly labels for the available options", () => {
    expect(PAIN_LOCATION_LABELS.lower_abdomen).toBe("Lower abdomen");
    expect(PAIN_LOCATION_LABELS.lower_back).toBe("Lower back");
    expect(SYMPTOM_LABELS.cramps).toBe("Cramps");
    expect(SYMPTOM_LABELS.bloating).toBe("Bloating");
  });
});

describe("ai provider settings", () => {
  it("keeps provider credentials out of browser settings", () => {
    expect(defaultSettings).toMatchObject({
      ldrEnabled: false,
    });
    expect("openRouterApiKey" in defaultSettings).toBe(false);
  });
});

describe("local symptom fallback", () => {
  it("stores consent and symptom logs in browser storage when Supabase is not configured", async () => {
    const userId = "local-user-123";
    const log: Partial<SymptomLog> = {
      log_date: "2026-09-10",
      cycle_day: 10,
      phase: "follicular",
      pain_score: 4,
      pain_locations: ["lower_abdomen"],
      symptoms: ["cramps"],
      bleeding: "light",
      impact: "some",
      notes: "Better after a walk",
    };

    const saved = await upsertLog(userId, log);
    expect(saved.user_id).toBe(userId);
    expect((await fetchLogs(userId)).length).toBe(1);
    expect(await hasUserConsented(userId)).toBe(false);

    await saveUserConsent(userId, "v1");
    expect(await hasUserConsented(userId)).toBe(true);
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

describe("multi-cycle symptom pattern review", () => {
  const profile = {
    lastPeriodStart: "2026-09-01",
    cycleLength: 28,
    periodLength: 5,
    ownerLabel: "You",
    timezone: "UTC",
    city: "Berlin",
  };

  function entry(logDate: string, painScore: number): SymptomLog {
    return {
      log_date: logDate,
      cycle_day: 2,
      phase: "menstrual",
      pain_score: painScore,
      pain_locations: [],
      symptoms: [],
      bleeding: "medium",
      impact: "none",
    };
  }

  it("does not recommend evaluation from a single recorded cycle", () => {
    const result = analyzeSymptomPatterns([entry("2026-09-02", 9)], profile);

    expect(result.cyclesReviewed).toBe(1);
    expect(result.recommendEvaluation).toBe(false);
  });

  it("highlights repeated severe pain only after three cycles are recorded", () => {
    const result = analyzeSymptomPatterns(
      [entry("2026-09-02", 9), entry("2026-08-05", 8), entry("2026-07-08", 7)],
      profile
    );

    expect(result.cyclesReviewed).toBe(3);
    expect(result.patterns).toContain("high pain");
    expect(result.recommendEvaluation).toBe(true);
  });

  it("highlights pain that is consistently worsening across three cycles", () => {
    const result = analyzeSymptomPatterns(
      [entry("2026-09-02", 7), entry("2026-08-05", 5), entry("2026-07-08", 3)],
      profile
    );

    expect(result.patterns).toContain("pain increasing over the reviewed cycles");
    expect(result.recommendEvaluation).toBe(true);
  });
});
