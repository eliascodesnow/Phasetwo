/** Pure geometry for the app tour, kept separate from React so it can be tested on its own. */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Where the card sits relative to the highlighted element. */
export type CardSide = "below" | "above" | "docked" | "center";

export interface CardPlacement {
  left: number;
  top: number;
  width: number;
  side: CardSide;
  /** Horizontal position of the arrow inside the card, or null when the card has no arrow. */
  arrowX: number | null;
}

export const ARROW_INSET = 22;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The highlighted area: the target grown by `padding` and kept inside the viewport. */
export function spotlightBox(target: Box, viewport: Viewport, padding = 6): Box {
  const x = Math.max(0, target.x - padding);
  const y = Math.max(0, target.y - padding);
  const right = Math.min(viewport.width, target.x + target.width + padding);
  const bottom = Math.min(viewport.height, target.y + target.height + padding);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/**
 * Chooses where the explanation card goes. It prefers below the target, then above it. When the target
 * is too tall for either, the card docks to the bottom edge of the screen. It never leaves the viewport.
 */
export function placeCard(
  target: Box | null,
  card: { width: number; height: number },
  viewport: Viewport,
  options: { margin?: number; gap?: number } = {},
): CardPlacement {
  const margin = options.margin ?? 12;
  const gap = options.gap ?? 16;
  const width = Math.max(0, Math.min(card.width, viewport.width - margin * 2));
  const height = Math.max(0, Math.min(card.height, viewport.height - margin * 2));
  const centered: CardPlacement = {
    left: round((viewport.width - width) / 2),
    top: round((viewport.height - height) / 2),
    width,
    side: "center",
    arrowX: null,
  };
  if (!target) return centered;

  const spot = spotlightBox(target, viewport);
  if (spot.width <= 0 || spot.height <= 0) return centered;

  const targetCenter = spot.x + spot.width / 2;
  const left = clamp(targetCenter - width / 2, margin, viewport.width - width - margin);
  const arrowX = clamp(targetCenter - left, ARROW_INSET, width - ARROW_INSET);
  const roomBelow = viewport.height - (spot.y + spot.height) - gap - margin;
  const roomAbove = spot.y - gap - margin;

  if (roomBelow >= height) return { left: round(left), top: round(spot.y + spot.height + gap), width, side: "below", arrowX: round(arrowX) };
  if (roomAbove >= height) return { left: round(left), top: round(spot.y - gap - height), width, side: "above", arrowX: round(arrowX) };
  return { left: round((viewport.width - width) / 2), top: round(viewport.height - height - margin), width, side: "docked", arrowX: null };
}

/**
 * A CSS `clip-path` that covers the whole screen except a rounded rectangle, so a translucent
 * overlay can leave the highlighted element undimmed. Coordinates are relative to a full-screen layer.
 */
export function spotlightClipPath(box: Box, radius = 12): string {
  const r = Math.max(0, Math.min(radius, box.width / 2, box.height / 2));
  const x = round(box.x);
  const y = round(box.y);
  const x2 = round(box.x + box.width);
  const y2 = round(box.y + box.height);
  const outer = "M -100 -100 H 10000 V 10000 H -100 Z";
  const inner = [
    `M ${x + r} ${y}`,
    `H ${x2 - r}`,
    `A ${r} ${r} 0 0 1 ${x2} ${y + r}`,
    `V ${y2 - r}`,
    `A ${r} ${r} 0 0 1 ${x2 - r} ${y2}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y2 - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    "Z",
  ].join(" ");
  return `path(evenodd, "${outer} ${inner}")`;
}

export function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}
