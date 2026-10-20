import { describe, expect, it } from "vitest";
import { placeCard, sameBox, spotlightBox, spotlightClipPath, type Box, type Viewport } from "./tourLayout";

const phone: Viewport = { width: 360, height: 740 };
const card = { width: 380, height: 280 };

function inside(placement: { left: number; top: number; width: number }, height: number, viewport: Viewport) {
  expect(placement.left).toBeGreaterThanOrEqual(0);
  expect(placement.top).toBeGreaterThanOrEqual(0);
  expect(placement.left + placement.width).toBeLessThanOrEqual(viewport.width);
  expect(placement.top + height).toBeLessThanOrEqual(viewport.height);
}

describe("spotlightBox", () => {
  it("grows the target and keeps it inside the viewport", () => {
    expect(spotlightBox({ x: 0, y: 0, width: 100, height: 40 }, phone, 6)).toEqual({ x: 0, y: 0, width: 106, height: 46 });
    const bottomRight = spotlightBox({ x: 300, y: 690, width: 60, height: 50 }, phone, 6);
    expect(bottomRight.x + bottomRight.width).toBeLessThanOrEqual(phone.width);
    expect(bottomRight.y + bottomRight.height).toBeLessThanOrEqual(phone.height);
  });
});

describe("placeCard", () => {
  it("centres the card when there is nothing to point at", () => {
    const placement = placeCard(null, card, phone);
    expect(placement.side).toBe("center");
    expect(placement.arrowX).toBeNull();
    inside(placement, card.height, phone);
  });

  it("shrinks the card to fit a narrow phone", () => {
    const placement = placeCard({ x: 20, y: 100, width: 100, height: 44 }, card, { width: 320, height: 640 });
    expect(placement.width).toBe(296);
    inside(placement, card.height, { width: 320, height: 640 });
  });

  it("puts the card below a target near the top and points up at it", () => {
    const target: Box = { x: 200, y: 140, width: 150, height: 44 };
    const placement = placeCard(target, card, phone);
    expect(placement.side).toBe("below");
    expect(placement.top).toBeGreaterThan(target.y + target.height);
    inside(placement, card.height, phone);
    // The arrow lands under the middle of the target.
    expect(placement.left + (placement.arrowX ?? 0)).toBeCloseTo(target.x + target.width / 2, 0);
  });

  it("puts the card above a target at the bottom, like the Ask Bella bubble, and points down at it", () => {
    const bubble: Box = { x: 288, y: 668, width: 56, height: 56 };
    const placement = placeCard(bubble, card, phone);
    expect(placement.side).toBe("above");
    expect(placement.top + card.height).toBeLessThan(bubble.y);
    inside(placement, card.height, phone);
    expect(placement.left + (placement.arrowX ?? 0)).toBeCloseTo(bubble.x + bubble.width / 2, 0);
  });

  it("keeps the arrow inside the card even for a target at the far edge", () => {
    const placement = placeCard({ x: 330, y: 120, width: 24, height: 24 }, card, phone);
    expect(placement.arrowX).toBeGreaterThanOrEqual(22);
    expect(placement.arrowX).toBeLessThanOrEqual(placement.width - 22);
  });

  it("docks the card to the bottom when the target leaves no room above or below", () => {
    const tall: Box = { x: 16, y: 120, width: 328, height: 560 };
    const placement = placeCard(tall, card, phone);
    expect(placement.side).toBe("docked");
    expect(placement.arrowX).toBeNull();
    inside(placement, card.height, phone);
  });

  it("falls back to a centred card when the target is off screen", () => {
    const placement = placeCard({ x: 10, y: 2000, width: 100, height: 40 }, card, phone);
    expect(placement.side).toBe("center");
  });

  it("works on a very short landscape phone by staying on screen", () => {
    const landscape: Viewport = { width: 740, height: 340 };
    const placement = placeCard({ x: 20, y: 20, width: 80, height: 40 }, { width: 380, height: 400 }, landscape);
    expect(placement.top).toBeGreaterThanOrEqual(0);
    expect(placement.left + placement.width).toBeLessThanOrEqual(landscape.width);
  });
});

describe("spotlightClipPath", () => {
  it("cuts a rounded hole out of a full-screen layer", () => {
    const path = spotlightClipPath({ x: 10, y: 20, width: 100, height: 40 }, 12);
    expect(path.startsWith('path(evenodd, "')).toBe(true);
    expect(path).toContain("M 22 20");
    expect(path).toContain("A 12 12 0 0 1 110 32");
  });

  it("never rounds more than half of the smallest side", () => {
    expect(spotlightClipPath({ x: 0, y: 0, width: 20, height: 20 }, 40)).toContain("A 10 10 0 0 1");
  });
});

describe("sameBox", () => {
  it("ignores sub-pixel jitter but notices real movement", () => {
    const base: Box = { x: 10, y: 10, width: 100, height: 40 };
    expect(sameBox(base, { ...base, x: 10.2 })).toBe(true);
    expect(sameBox(base, { ...base, y: 12 })).toBe(false);
    expect(sameBox(null, null)).toBe(true);
    expect(sameBox(base, null)).toBe(false);
  });
});
