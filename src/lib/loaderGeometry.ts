// Geometry and timeline for the PhaseTwo loader: a leaf that travels into a smiling face and back.
// Pure functions only, so the animation can be unit-tested without a browser.

export const CX = 630;
export const CY = 670;
export const R = 380;

// The leaf (traced from the brand mark, stroke centre-line). Not altered by the animation at progress 0.
const leafStart: [number, number] = [935, 287];
const leafSegs: Array<[[number, number], [number, number], [number, number]]> = [
  [[975, 370], [1012, 520], [1012, 640]],
  [[1012, 830], [790, 1040], [600, 1040]],
  [[480, 1040], [385, 990], [322, 915]],
  [[295, 870], [285, 810], [300, 750]],
  [[310, 620], [450, 515], [600, 482]],
  [[750, 465], [850, 380], [935, 287]],
];
export const LEAF: number[] = [...leafStart, ...leafSegs.flat(2)];

// The face circle uses the same six nodes, each placed on the circle at its own angle, so every part
// of the leaf slides along the circle instead of cross-fading into a different shape.
function buildFace(): number[] {
  const nodes = [leafStart, ...leafSegs.map((s) => s[2])];
  const angles: number[] = [];
  let previous = -Infinity;
  for (const [x, y] of nodes) {
    let a = Math.atan2(y - CY, x - CX);
    while (a <= previous) a += Math.PI * 2;
    angles.push((previous = a));
  }
  const point = (a: number) => [CX + R * Math.cos(a), CY + R * Math.sin(a)];
  const tangent = (a: number) => [-Math.sin(a), Math.cos(a)];
  const out = [...point(angles[0])];
  for (let i = 0; i < 6; i++) {
    const a1 = angles[i], a2 = angles[i + 1];
    const k = (4 / 3) * Math.tan((a2 - a1) / 4) * R;
    const p1 = point(a1), p2 = point(a2), t1 = tangent(a1), t2 = tangent(a2);
    out.push(p1[0] + k * t1[0], p1[1] + k * t1[1], p2[0] - k * t2[0], p2[1] - k * t2[1], p2[0], p2[1]);
  }
  return out;
}
export const FACE: number[] = buildFace();

export const STALK = [218, 1075, 225, 990, 265, 935, 320, 905, 430, 870, 515, 815, 592, 752];
export const SMILE = [440, 760, 480, 850, 550, 905, 630, 905, 710, 905, 780, 850, 820, 760];

export const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function toPath(p: number[]): string {
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length; i += 6) d += `C${p[i]} ${p[i + 1]} ${p[i + 2]} ${p[i + 3]} ${p[i + 4]} ${p[i + 5]}`;
  return d;
}

// Timeline (ms)
export const HOLD_LEAF = 700;
export const GO = 1500;
export const LAG = 150;
export const HOLD_FACE = 2200;
export const BACK = 1500;
export const SWING = 25;
export const TOTAL = HOLD_LEAF + GO + LAG + HOLD_FACE + BACK + LAG;
export const FACE_START = HOLD_LEAF + GO + LAG;
export const FACE_END = FACE_START + HOLD_FACE;

/** fo / bo: start delay going in / going back. The mouth trails the body in and leaves first on the way out. */
export function progress(t: number, fo: number, bo: number): number {
  if (t < HOLD_LEAF) return 0;
  t -= HOLD_LEAF;
  if (t < GO + LAG) return ease(clamp((t - fo) / GO));
  t -= GO + LAG;
  if (t < HOLD_FACE) return 1;
  t -= HOLD_FACE;
  return 1 - ease(clamp((t - bo) / BACK));
}
