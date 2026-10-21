import { describe, expect, it } from "vitest";
import { swipeTarget } from "./swipeNav";

const order = ["today", "calendar", "planner", "history", "settings"] as const;
const quick = (dx: number, dy = 0, durationMs = 200) => ({ dx, dy, durationMs });

describe("swipeTarget", () => {
  it("moves forward on a left swipe and back on a right swipe", () => {
    expect(swipeTarget(order, "today", quick(-120))).toBe("calendar");
    expect(swipeTarget(order, "calendar", quick(-120))).toBe("planner");
    expect(swipeTarget(order, "planner", quick(120))).toBe("calendar");
  });

  it("stops at either end of the nav", () => {
    expect(swipeTarget(order, "today", quick(120))).toBeNull();
    expect(swipeTarget(order, "settings", quick(-120))).toBeNull();
  });

  it("reaches settings from history", () => {
    expect(swipeTarget(order, "history", quick(-90))).toBe("settings");
  });

  it("ignores short, slow or mostly vertical drags", () => {
    expect(swipeTarget(order, "calendar", quick(-30))).toBeNull();
    expect(swipeTarget(order, "calendar", quick(-120, 0, 1200))).toBeNull();
    expect(swipeTarget(order, "calendar", quick(-100, 90))).toBeNull();
    expect(swipeTarget(order, "calendar", quick(-100, 40))).toBe("planner");
  });

  it("ignores views that are not tabs", () => {
    expect(swipeTarget(order as readonly string[], "report", quick(-120))).toBeNull();
  });
});
