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

describe("in-app phase notices", () => {
  it("shows the phase guide first, scoped to the current cycle", () => {
    const [first] = self(on(3));
    expect(first).toMatchObject({ kind: "phase", phase: "menstrual", id: "phase:menstrual:2026-10-01" });
    expect(first.tips?.length).toBeGreaterThan(0);
  });

  it("scopes ids per cycle so the guide returns next cycle but not again today", () => {
    const thisCycle = self(on(3))[0].id;
    const nextCycle = self(new Date(2026, 10, 1, 9))[0].id;
    expect(nextCycle).not.toBe(thisCycle);
    expect(self(on(4))[0].id).toBe(thisCycle);
  });

  it("labels fertility information as an estimate and mentions contraception", () => {
    const ovulatory = self(on(14))[0];
    expect(ovulatory.title).toBe("Estimated ovulation window");
    expect(ovulatory.body).toMatch(/estimate/i);
    expect(ovulatory.tips?.join(" ")).toMatch(/contraception/i);
  });

  it("switches to the PMS window in the last 5 days before the period", () => {
    expect(self(on(23))[0].title).toBe("Luteal phase (estimated)");
    const pms = self(on(24))[0];
    expect(pms.title).toBe("PMS window (estimated)");
    expect(pms.body).toMatch(/in about 5 days/);
    expect(pms.caution).toMatch(/PMDD/);
    expect(self(on(28))[0].body).toMatch(/in about 1 day\./);
  });

  it("always cites a source for the self-facing guides", () => {
    for (const day of [3, 8, 14, 20, 25]) {
      expect(self(on(day))[0].source?.url).toMatch(/^https:\/\//);
    }
  });
});

describe("in-app health signals", () => {
  const heavy = (day: number) => ({ log_date: `2026-10-0${day}`, bleeding: "heavy" }) as SymptomLog;

  it("flags several heavy days, ahead of the phase guide", () => {
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
});

describe("partners", () => {
  it("get a supportive phase note only, with no fertility detail or health signals", () => {
    const notices = inAppNotices({ profile: { ...profile, ownerLabel: "Amina" }, role: "partner", asOf: on(14), logs: [{ log_date: "2026-10-12", bleeding: "heavy" }] as SymptomLog[] });
    expect(notices).toHaveLength(1);
    expect(notices[0].body).toContain("Amina");
    expect(notices[0].tips).toBeUndefined();
    expect(`${notices[0].title} ${notices[0].body}`).not.toMatch(/fertile|contracept|pregnan/i);
  });

  it("falls back to 'Your partner' when no name is set", () => {
    expect(inAppNotices({ profile, role: "partner", asOf: on(3) })[0].body).toMatch(/^Your partner /);
  });
});

describe("dismissal and daily tips", () => {
  it("moves on to the next notice once one is dismissed, then to nothing", () => {
    const ctx = { profile, role: "self" as const, asOf: on(3) };
    const all = inAppNotices(ctx);
    const seen = new Set<string>();
    expect(nextInAppNotice(ctx, seen)?.id).toBe(all[0].id);
    seen.add(all[0].id);
    expect(nextInAppNotice(ctx, seen)?.kind).toBe("tip");
    for (const notice of all) seen.add(notice.id);
    expect(nextInAppNotice(ctx, seen)).toBeNull();
  });

  it("rotates the daily tip and has a complete, hedged library", () => {
    const tipIds = new Set([3, 4, 5, 6].map((day) => self(on(day)).find((n) => n.kind === "tip")!.id));
    expect(tipIds.size).toBe(4);
    expect(TIPS.length).toBeGreaterThanOrEqual(8);
    for (const tip of TIPS) expect(`${tip.title} ${tip.body}`).not.toMatch(/you will (feel|be)|always|guarantee/i);
  });
});
