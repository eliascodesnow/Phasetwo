import { describe, expect, it } from "vitest";
import { CX, CY, FACE, FACE_START, HOLD_LEAF, LEAF, R, TOTAL, lerp, progress } from "./loaderGeometry";

describe("loader geometry", () => {
  it("shows the unaltered leaf at progress 0", () => {
    expect(lerp(LEAF, FACE, 0)).toEqual(LEAF);
  });

  it("puts every on-curve point of the face on the circle at progress 1", () => {
    const body = lerp(LEAF, FACE, 1);
    const points = [[body[0], body[1]]];
    for (let i = 6; i < body.length; i += 6) points.push([body[i], body[i + 1]]);
    for (const [x, y] of points) expect(Math.hypot(x - CX, y - CY)).toBeCloseTo(R, 6);
  });

  it("starts and ends the loop on the leaf, so the loop is seamless", () => {
    expect(progress(0, 0, 150)).toBe(0);
    expect(progress(TOTAL - 1, 0, 150)).toBeCloseTo(0, 5);
    expect(progress(FACE_START + 10, 0, 150)).toBe(1);
  });

  it("holds the leaf before moving", () => {
    expect(progress(HOLD_LEAF - 1, 0, 150)).toBe(0);
  });
});
