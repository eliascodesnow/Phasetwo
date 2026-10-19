import { describe, expect, it } from "vitest";
import { dueReminder } from "./reminders";

const profile = {
  lastPeriodStart: "2026-10-01",
  cycleLength: 28,
  periodLength: 5,
  ownerLabel: "You",
  timezone: "UTC",
  city: "",
};

describe("period reminders", () => {
  it("fires two days before the predicted period", () => {
    // Next period is 2026-10-29, so 2026-10-27 is two days before.
    const reminder = dueReminder(profile, new Date(2026, 9, 27, 9));
    expect(reminder?.daysBefore).toBe(2);
    expect(reminder?.periodDate).toBe("2026-10-29");
  });

  it("fires one day before the predicted period", () => {
    const reminder = dueReminder(profile, new Date(2026, 9, 28, 9));
    expect(reminder?.daysBefore).toBe(1);
    expect(reminder?.periodDate).toBe("2026-10-29");
  });

  it("does not fire on other days", () => {
    expect(dueReminder(profile, new Date(2026, 9, 26, 9))).toBeNull();
    expect(dueReminder(profile, new Date(2026, 9, 29, 9))).toBeNull();
    expect(dueReminder(profile, new Date(2026, 9, 19, 9))).toBeNull();
  });

  it("uses a distinct key per reminder so each fires once", () => {
    const two = dueReminder(profile, new Date(2026, 9, 27, 9));
    const one = dueReminder(profile, new Date(2026, 9, 28, 9));
    expect(two?.key).not.toBe(one?.key);
  });

  it("respects a custom cycle length", () => {
    const longer = { ...profile, cycleLength: 30 };
    expect(dueReminder(longer, new Date(2026, 9, 29, 9))?.daysBefore).toBe(2);
    expect(dueReminder(longer, new Date(2026, 9, 27, 9))).toBeNull();
  });
});
