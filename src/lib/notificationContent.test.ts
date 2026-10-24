import { describe, expect, it } from "vitest";
import type { CycleProfile } from "../types";
import type { SymptomLog } from "./symptoms";
import { inAppNotices, nextInAppNotice, TIPS } from "./notificationContent";

const profile: CycleProfile = {
  lastPeriodStart: "2026-10-01",
  periodStartDates: ["2026-10-01"],
  cycleLength: 28,
  periodLength: 5,
  ownerLabel: "You",
  timezone: "UTC",
  city: "",
};
const on = (day: number) => new Date(2026, 9, day, 9);
const self = (asOf: Date, extra: Partial<Parameters<typeof inAppNotices>[0]> = {}) => inAppNotices({ profile, role: "self", asOf, ...extra });

describe("the Today card never shows phase guides", () => {
  it("shows only a daily fact when there is nothing to flag, on every day of the cycle", () => {
    for (let day = 1; day <= 28; day += 1) {
      const notices = self(new Date(2026, 9, day, 9));
      expect(notices.map((notice) => notice.kind)).toEqual(["tip"]);
      expect(notices[0].id.startsWith("phase:")).toBe(false);
    }
  });

  it("carries no external links or source fields", () => {
    const heavy = (day: number) => ({ log_date: `2026-10-0${day}`, bleeding: "heavy" }) as SymptomLog;
    const everything = [...self(on(5), { logs: [heavy(1), heavy(2), heavy(3)] }), ...TIPS.map((tip, index) => ({ id: String(index), ...tip }))];
    for (const notice of everything) {
      expect(Object.keys(notice)).not.toContain("source");
      expect(JSON.stringify(notice)).not.toMatch(/https?:|www\.|\.org\b|\.gov\b|\.uk\b/i);
    }
  });

  it("makes no assumptions about work, study or hobbies", () => {
    for (const tip of TIPS) expect(`${tip.title} ${tip.body}`).not.toMatch(/\b(coding|code|study|studying|homework|exam|work meeting|presentation)s?\b/i);
  });
});

describe("in-app health signals", () => {
  const heavy = (day: number) => ({ log_date: `2026-10-0${day}`, bleeding: "heavy" }) as SymptomLog;

  it("flags several heavy days, ahead of the daily fact", () => {
    const notices = self(on(5), { logs: [heavy(1), heavy(2), heavy(3)] });
    expect(notices[0]).toMatchObject({ kind: "attention", id: "attention:heavy:2026-10-01" });
    expect(notices[0].caution).toMatch(/urgent/i);
  });

  it("stays quiet for fewer than three heavy days", () => {
    expect(self(on(5), { logs: [heavy(1), heavy(2)] }).some((n) => n.kind === "attention")).toBe(false);
  });

  it("flags repeatedly uneven cycles, but not a single outlier", () => {
    const uneven = { ...profile, lastPeriodStart: "2026-09-30", periodStartDates: ["2026-06-01", "2026-07-20", "2026-08-05", "2026-09-30"] };
    expect(inAppNotices({ profile: uneven, role: "self", asOf: on(3) }).some((n) => n.id.startsWith("attention:irregular"))).toBe(true);
    const oneOff = { ...profile, periodStartDates: ["2026-08-04", "2026-09-01", "2026-10-01"], lastPeriodStart: "2026-10-01" };
    expect(inAppNotices({ profile: oneOff, role: "self", asOf: on(3) }).some((n) => n.id.startsWith("attention:irregular"))).toBe(false);
  });

  it("flags more than one period longer than 7 days", () => {
    const long = {
      ...profile,
      lastPeriodStart: "2026-09-28",
      periodStartDates: ["2026-08-03", "2026-08-31", "2026-09-28"],
      periodEnds: { "2026-08-03": "2026-08-11", "2026-08-31": "2026-09-08" },
    };
    expect(inAppNotices({ profile: long, role: "self", asOf: on(2) }).some((n) => n.id.startsWith("attention:long-period"))).toBe(true);
  });

  it("scopes each flag to the cycle so it can return next cycle but not twice in one", () => {
    const logs = [heavy(1), heavy(2), heavy(3)];
    expect(self(on(5), { logs })[0].id).toBe(self(on(6), { logs })[0].id);
  });
});

describe("partners", () => {
  it("see nothing on the Today card", () => {
    const logs = [{ log_date: "2026-10-12", bleeding: "heavy" }] as SymptomLog[];
    expect(inAppNotices({ profile, role: "partner", asOf: on(14), logs })).toEqual([]);
  });
});

describe("dismissal and daily facts", () => {
  it("moves on to the next notice once one is dismissed, then to nothing", () => {
    const heavy = (day: number) => ({ log_date: `2026-10-0${day}`, bleeding: "heavy" }) as SymptomLog;
    const ctx = { profile, role: "self" as const, asOf: on(5), logs: [heavy(1), heavy(2), heavy(3)] };
    const all = inAppNotices(ctx);
    const seen = new Set<string>();
    expect(nextInAppNotice(ctx, seen)?.id).toBe(all[0].id);
    seen.add(all[0].id);
    expect(nextInAppNotice(ctx, seen)?.kind).toBe("tip");
    for (const notice of all) seen.add(notice.id);
    expect(nextInAppNotice(ctx, seen)).toBeNull();
  });

  it("rotates the daily fact and keeps its wording hedged", () => {
    const ids = new Set([3, 4, 5, 6].map((day) => self(on(day)).find((n) => n.kind === "tip")!.id));
    expect(ids.size).toBe(4);
    expect(TIPS.length).toBeGreaterThanOrEqual(8);
    for (const tip of TIPS) expect(`${tip.title} ${tip.body}`).not.toMatch(/you will (feel|be)|always|guarantee/i);
  });
});
