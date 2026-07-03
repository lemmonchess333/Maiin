/**
 * Exercise demo rig (D-LIFT-20 final form, 2026-07-04).
 *
 * The product owner rejected BOTH prior demo sources: stock photos
 * (free-exercise-db) and Gemini-generated coach illustrations (#1448's
 * objection, upheld by the owner). The demos must be in the app's OWN
 * visual language — the flat faceted grey vector figure with purple
 * muscle fills (react-body-highlighter's aesthetic).
 *
 * The only way to guarantee that style is to not generate raster images
 * at all: this module IS the figure — a side-view 2D vector puppet built
 * from faceted polygon segments, posed by joint angles (degrees), with
 * forward kinematics from the ankle up. An exercise demo is a set of
 * pose keyframes; the component interpolates between them (ping-pong)
 * for smooth deterministic motion.
 *
 * Why this wins over image-gen for THIS app:
 *  - pixel-exact brand match by construction (same palette, facet look);
 *  - joint angles are DATA — reviewable, testable, no hallucinated limbs;
 *  - muscle tint is assigned by US per exercise (honest, not cosmetic);
 *  - ~4KB of code + zero assets vs megabytes of frames;
 *  - light/dark theming via fill variables, reduced-motion trivially.
 *
 * Convention: the figure faces +x (right). All angles are degrees from
 * the VERTICAL (+y up), positive tilting the segment's upper end toward
 * +x — so a standing figure is all zeros. Arm angles are relative to the
 * torso; elbow flexion is relative to the upper arm.
 */

/* ── Types ────────────────────────────────────────────────────── */

export interface Pose {
  /** Shank tilt (knee travels forward = positive). */
  shank: number;
  /** Thigh tilt: angle of knee→hip direction from vertical (hip drops
   *  behind the knee = negative / backward). */
  thigh: number;
  /** Torso lean from vertical (forward = positive). */
  torso: number;
  /** Upper-arm angle relative to the torso line (0 = hanging along the
   *  torso; positive raises the arm forward/up). */
  shoulder: number;
  /** Elbow flexion relative to the upper arm (0 = straight). */
  elbow: number;
}

export type MuscleRegion =
  | "quad"
  | "hamstring"
  | "glute"
  | "calf"
  | "erectors"
  | "lat"
  | "chest"
  | "delt"
  | "biceps"
  | "triceps"
  | "forearm"
  | "abs"
  | "trap";

export type Equipment = "barbell-back" | "barbell-hands" | "none";

export interface RigDemo {
  /** Ordered keyframes top→bottom of the range of motion. The player
   *  ping-pongs them (top→bottom→top = one rep). 2+ required. */
  keyframes: Pose[];
  /** Regions filled purple — assigned by us from the exercise's primary
   *  muscles, NOT model-guessed. */
  tint: MuscleRegion[];
  equipment: Equipment;
}

/* ── Palette (mirrors the muscle-map look; overridable via CSS vars) ── */

const BODY_A = "var(--rig-body-a, #C6C9D0)";
const BODY_B = "var(--rig-body-b, #B5B9C2)";
const SEAM = "var(--rig-seam, #2A2A31)";
const PURPLE_A = "var(--rig-muscle-a, #7B72E9)";
const PURPLE_B = "var(--rig-muscle-b, #9590E0)";
const GEAR = "var(--rig-gear, #4A4B52)";
const GEAR_DARK = "var(--rig-gear-dark, #35363C)";

/* ── Geometry constants (viewBox units; ground at y=290) ─────── */

const GROUND_Y = 288;
const FOOT_X = 120; // ankle x
const L_SHANK = 62;
const L_THIGH = 66;
const L_TORSO = 78;
const L_HEAD = 26;
const L_UPPER_ARM = 44;
const L_FOREARM = 40;

const rad = (d: number) => (d * Math.PI) / 180;

/** Point along a segment from `from`, tilted `deg` from vertical, length L. */
function up(from: [number, number], deg: number, L: number): [number, number] {
  return [from[0] + Math.sin(rad(deg)) * L, from[1] - Math.cos(rad(deg)) * L];
}

/* ── Forward kinematics ───────────────────────────────────────── */

export interface RigPoints {
  ankle: [number, number];
  knee: [number, number];
  hip: [number, number];
  neck: [number, number];
  headTop: [number, number];
  shoulderPt: [number, number];
  elbowPt: [number, number];
  hand: [number, number];
}

export function solve(pose: Pose): RigPoints {
  const ankle: [number, number] = [FOOT_X, GROUND_Y - 8];
  const knee = up(ankle, pose.shank, L_SHANK);
  const hip = up(knee, pose.thigh, L_THIGH);
  const neck = up(hip, pose.torso, L_TORSO);
  const headTop = up(neck, pose.torso, L_HEAD);
  // Shoulder sits just below the neck on the torso line.
  const shoulderPt = up(hip, pose.torso, L_TORSO - 10);
  const armWorld = pose.torso + 180 + pose.shoulder; // 180 = hanging down
  const elbowPt = up(shoulderPt, armWorld, L_UPPER_ARM);
  const hand = up(elbowPt, armWorld + pose.elbow, L_FOREARM);
  return { ankle, knee, hip, neck, headTop, shoulderPt, elbowPt, hand };
}


/* ── Two-link arm IK ──────────────────────────────────────────── */

/** Solve elbow position so the hand lands on `target` (law of cosines).
 *  `elbowForward` picks which of the two solutions to use. */
export function solveArmIK(
  shoulder: [number, number],
  target: [number, number],
  elbowForward: boolean
): { elbow: [number, number]; hand: [number, number] } {
  const dx = target[0] - shoulder[0];
  const dy = target[1] - shoulder[1];
  let d = Math.hypot(dx, dy);
  const maxReach = L_UPPER_ARM + L_FOREARM - 1;
  if (d > maxReach) d = maxReach;
  if (d < 6) d = 6;
  const sx = shoulder[0] + (dx / Math.hypot(dx, dy)) * d;
  const sy = shoulder[1] + (dy / Math.hypot(dx, dy)) * d;
  const a =
    (L_UPPER_ARM * L_UPPER_ARM - L_FOREARM * L_FOREARM + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(L_UPPER_ARM * L_UPPER_ARM - a * a, 0));
  const mx = shoulder[0] + (a * (sx - shoulder[0])) / d;
  const my = shoulder[1] + (a * (sy - shoulder[1])) / d;
  const ox = (-(sy - shoulder[1]) / d) * h;
  const oy = ((sx - shoulder[0]) / d) * h;
  const e1: [number, number] = [mx + ox, my + oy];
  const e2: [number, number] = [mx - ox, my - oy];
  const elbow = (e1[0] > e2[0]) === elbowForward ? e1 : e2;
  return { elbow, hand: [sx, sy] };
}

/* ── Pose interpolation (easeInOutSine) ───────────────────────── */

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const e = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(Math.max(t, 0), 1));
  const mix = (x: number, y: number) => x + (y - x) * e;
  return {
    shank: mix(a.shank, b.shank),
    thigh: mix(a.thigh, b.thigh),
    torso: mix(a.torso, b.torso),
    shoulder: mix(a.shoulder, b.shoulder),
    elbow: mix(a.elbow, b.elbow),
  };
}

/** Sample the keyframe track at t ∈ [0,1] (0 = first, 1 = last frame). */
export function samplePose(keyframes: Pose[], t: number): Pose {
  if (keyframes.length === 1) return keyframes[0];
  const scaled = Math.min(Math.max(t, 0), 1) * (keyframes.length - 1);
  const i = Math.min(Math.floor(scaled), keyframes.length - 2);
  return lerpPose(keyframes[i], keyframes[i + 1], scaled - i);
}

/* ── Rendering ────────────────────────────────────────────────── */

type Pt = [number, number];

/**
 * Segment-space mapper. Artwork is authored in a local frame where the
 * segment's LOWER joint is (0,0), its upper joint is (0,L), +x is the
 * figure's front. `place` rotates by the segment's world angle and drops
 * the points into world coordinates.
 */
function place(
  lower: Pt,
  angleDeg: number,
  pts: [number, number][]
): Pt[] {
  const a = rad(angleDeg);
  const dirX = Math.sin(a); // toward upper joint
  const dirY = -Math.cos(a);
  const perpX = Math.cos(a); // segment "front"
  const perpY = Math.sin(a);
  const W = 1.18; // stocky build — reference figure is broad
  return pts.map(([x, y]) => [
    lower[0] + perpX * x * W + dirX * y,
    lower[1] + perpY * x * W + dirY * y,
  ]);
}


/** Simple tapered quad between two joints (neck link etc.). */
function limb2(a: Pt, b: Pt, wA: number, wB: number): Pt[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return [
    [a[0] + nx * wA, a[1] + ny * wA],
    [b[0] + nx * wB, b[1] + ny * wB],
    [b[0] - nx * wB, b[1] - ny * wB],
    [a[0] - nx * wA, a[1] - ny * wA],
  ];
}

const poly = (pts: Pt[], fill: string, sw = 1.5) =>
  `<polygon points="${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}" fill="${fill}" stroke="${SEAM}" stroke-width="${sw}" stroke-linejoin="round"/>`;

function fillFor(
  region: MuscleRegion,
  tint: Set<MuscleRegion>,
  base: string
): string {
  return tint.has(region) ? (base === BODY_A ? PURPLE_A : PURPLE_B) : base;
}

/* ── Hand-authored segment art (side view, local frames) ─────────
   Points are sculpted to echo the muscle-map's anatomical facets:
   calf bulge, quad sweep, glute wedge, lat sweep, delt cap. Facets
   share edges so seams read as one figure, not stacked tubes.     */

// Shank, L=62: shin front, calf bulge back.
const SHIN: [number, number][] = [
  [1, 0], [7, 6], [8, 22], [6, 44], [5, 58], [0, 62], [-2, 44], [-2, 20], [-3, 6],
];
const CALF: [number, number][] = [
  [-3, 6], [-2, 20], [-2, 44], [0, 62], [-8, 56], [-12, 40], [-11, 22], [-8, 9],
];
// Thigh, L=66: quad sweep front, hamstring back.
const QUAD: [number, number][] = [
  [2, 0], [10, 8], [14, 24], [14, 44], [11, 60], [4, 66], [-1, 48], [-1, 24], [0, 8],
];
const HAM: [number, number][] = [
  [0, 8], [-1, 24], [-1, 48], [4, 66], [-8, 64], [-12, 46], [-11, 24], [-7, 8],
];
// Torso, L=78 (hip→neck): chest/abs front, lat/erector back, obliques mid.
const TORSO_FRONT: [number, number][] = [
  [3, 0], [12, 6], [15, 20], [16, 40], [15, 58], [11, 72], [5, 78], [2, 60], [2, 30], [2, 10],
];
const TORSO_ABS: [number, number][] = [
  [3, 0], [2, 10], [2, 30], [2, 60], [5, 78], [-1, 74], [-3, 52], [-3, 26], [-2, 8],
];
const TORSO_ERECTOR: [number, number][] = [
  [-2, 8], [-3, 26], [-3, 52], [-1, 74], [-7, 70], [-10, 50], [-10, 26], [-8, 8],
];
const TORSO_LAT: [number, number][] = [
  [-8, 8], [-10, 26], [-10, 50], [-7, 70], [-14, 62], [-17, 44], [-15, 24], [-11, 10],
];
// Glute: attached behind the hip, below the lat sweep.
const GLUTE: [number, number][] = [
  [1, 8], [-12, 12], [-19, 3], [-18, -10], [-9, -16], [0, -11],
];
// Upper arm, L=44 (shoulder→elbow, authored downward: lower joint = ELBOW).
const TRICEP: [number, number][] = [
  [-1, 4], [-2, 18], [-2, 34], [0, 44], [-7, 40], [-9, 26], [-7, 10],
];
const BICEP: [number, number][] = [
  [1, 0], [7, 8], [8, 22], [6, 36], [0, 44], [-2, 34], [-2, 18], [-1, 4],
];
// Forearm, L=40 (elbow→hand; lower joint = HAND).
const FOREARM_ART: [number, number][] = [
  [1, 0], [5, 8], [7, 20], [5, 32], [1, 40], [-4, 34], [-6, 20], [-4, 8],
];

async function noop() {} // keep tree-shaken builds honest about async-free module
void noop;

export function renderRigSvg(
  pose: Pose,
  tintList: MuscleRegion[],
  equipment: Equipment
): string {
  const tint = new Set(tintList);
  const p = solve(pose);

  // Equipment target → IK arm (the hand must actually reach the bar).
  const elbowPt = p.elbowPt;
  const hand = p.hand;
  let barCenter: Pt | null = null;
  if (equipment === "barbell-back") {
    // Bar rides the traps; the arm is authored in the pose (a tucked grip —
    // IK degenerates here because the hand-to-shoulder distance is tiny).
    const b = up(p.neck, pose.torso, -8);
    barCenter = [b[0] - 6, b[1]];
  } else if (equipment === "barbell-hands") {
    barCenter = hand;
  }

  const armAngle =
    (Math.atan2(elbowPt[0] - p.shoulderPt[0], -(elbowPt[1] - p.shoulderPt[1])) *
      180) /
    Math.PI;
  const foreAngle =
    (Math.atan2(hand[0] - elbowPt[0], -(hand[1] - elbowPt[1])) * 180) /
    Math.PI;

  const parts: string[] = [];
  const joint = (c: Pt, r: number, fill: string) =>
    `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${r}" fill="${fill}" stroke="${SEAM}" stroke-width="1.5"/>`;

  const shade = (pts: Pt[]) => poly(pts, "var(--rig-far, #9CA0AA)", 1.2);

  /* Far leg (single-tone, offset for depth). */
  const off = (pt: Pt): Pt => [pt[0] - 9, pt[1] - 4];
  parts.push(shade(place(off(p.ankle), pose.shank, SHIN)));
  parts.push(shade(place(off(p.ankle), pose.shank, CALF)));
  parts.push(shade(place(off(p.knee), pose.thigh, QUAD)));
  parts.push(shade(place(off(p.knee), pose.thigh, HAM)));
  {
    const fa = off(p.ankle);
    parts.push(
      shade([
        [fa[0] - 8, fa[1] + 1],
        [fa[0] + 20, fa[1] + 4],
        [fa[0] + 21, fa[1] + 9],
        [fa[0] - 9, fa[1] + 9],
      ])
    );
  }

  /* Far arm (hands-equipment only). */
  if (equipment === "barbell-hands") {
    const fe = off(elbowPt);
    const fh = off(hand);
    parts.push(shade(place(fe, armAngle + 180, TRICEP)));
    parts.push(shade(place(fe, armAngle + 180, BICEP)));
    parts.push(shade(place(fh, foreAngle + 180, FOREARM_ART)));
  }

  /* Torso stack: lat sweep → erectors → abs → chest, then glute. */
  parts.push(poly(place(p.hip, pose.torso, TORSO_LAT), fillFor("lat", tint, BODY_B)));
  parts.push(
    poly(place(p.hip, pose.torso, TORSO_ERECTOR), fillFor("erectors", tint, BODY_B))
  );
  parts.push(poly(place(p.hip, pose.torso, TORSO_ABS), fillFor("abs", tint, BODY_A)));
  parts.push(
    poly(place(p.hip, pose.torso, TORSO_FRONT), fillFor("chest", tint, BODY_A))
  );
  parts.push(poly(place(p.hip, pose.torso, GLUTE), fillFor("glute", tint, BODY_B)));
  parts.push(joint(p.hip, 9, BODY_B));

  /* Near leg. */
  parts.push(poly(place(p.ankle, pose.shank, CALF), fillFor("calf", tint, BODY_B)));
  parts.push(poly(place(p.ankle, pose.shank, SHIN), BODY_A));
  parts.push(joint(p.knee, 8, BODY_A));
  parts.push(poly(place(p.knee, pose.thigh, HAM), fillFor("hamstring", tint, BODY_B)));
  parts.push(poly(place(p.knee, pose.thigh, QUAD), fillFor("quad", tint, BODY_A)));
  parts.push(
    poly(
      [
        [p.ankle[0] - 9, p.ankle[1] + 2],
        [p.ankle[0] + 23, p.ankle[1] + 5],
        [p.ankle[0] + 24, p.ankle[1] + 11],
        [p.ankle[0] - 10, p.ankle[1] + 11],
      ],
      BODY_A
    )
  );

  /* Neck + head (featureless, follows torso line). */
  {
    const tr = up(p.neck, pose.torso, 7);
    parts.push(
      poly(
        [p.neck, tr, [tr[0] - 12, tr[1] + 7], [p.neck[0] - 11, p.neck[1] + 5]],
        fillFor("trap", tint, BODY_B)
      )
    );
    const headAngle = pose.torso * 0.35;
    const headBase = up(p.neck, headAngle, 6);
    const c = up(headBase, headAngle, 12);
    const r = 14.5;
    // Neck link (fills any gap between trap wedge and head).
    const nl = limb2(p.neck, headBase, 6.5, 5.5);
    parts.push(poly(nl, BODY_B));
    const hex: Pt[] = Array.from({ length: 8 }, (_, i) => {
      const a = rad(45 * i - 90 + headAngle);
      return [c[0] + Math.cos(a) * r * 0.92, c[1] + Math.sin(a) * r * 1.15];
    });
    parts.push(poly(hex, BODY_A));
  }

  /* Bar behind the near arm (back squat). */
  const drawBar = (b: Pt) => {
    parts.push(
      `<rect x="${(b[0] - 30).toFixed(1)}" y="${(b[1] - 3).toFixed(1)}" width="60" height="6" rx="3" fill="${GEAR}" stroke="${SEAM}" stroke-width="1.2"/>`,
      `<circle cx="${b[0].toFixed(1)}" cy="${b[1].toFixed(1)}" r="16" fill="${GEAR_DARK}" stroke="${SEAM}" stroke-width="1.5"/>`,
      `<circle cx="${b[0].toFixed(1)}" cy="${b[1].toFixed(1)}" r="10.5" fill="none" stroke="${SEAM}" stroke-width="1" opacity="0.5"/>`,
      `<circle cx="${b[0].toFixed(1)}" cy="${b[1].toFixed(1)}" r="4" fill="${GEAR}" stroke="${SEAM}" stroke-width="1.2"/>`
    );
  };
  if (equipment === "barbell-back" && barCenter) drawBar(barCenter);

  /* Near arm: authored from the elbow/hand up (pivot frames). */
  parts.push(
    poly(place(elbowPt, armAngle + 180, TRICEP), fillFor("triceps", tint, BODY_B))
  );
  parts.push(
    poly(place(elbowPt, armAngle + 180, BICEP), fillFor("biceps", tint, BODY_A))
  );
  parts.push(joint(elbowPt, 5.5, BODY_A));
  parts.push(
    poly(place(hand, foreAngle + 180, FOREARM_ART), fillFor("forearm", tint, BODY_A))
  );
  parts.push(joint(hand, 4.5, BODY_A));

  /* Delt cap over the shoulder. */
  {
    const sp = p.shoulderPt;
    parts.push(
      poly(
        [
          [sp[0] - 10, sp[1] - 4],
          [sp[0] - 2, sp[1] - 11],
          [sp[0] + 8, sp[1] - 9],
          [sp[0] + 12, sp[1] - 1],
          [sp[0] + 8, sp[1] + 8],
          [sp[0] - 4, sp[1] + 9],
        ],
        fillFor("delt", tint, BODY_A)
      )
    );
  }

  /* Bar in front of the hands. */
  if (equipment === "barbell-hands" && barCenter) drawBar(barCenter);

  const shadow = `<ellipse cx="${FOOT_X + 4}" cy="${GROUND_Y + 4}" rx="52" ry="6" fill="${SEAM}" opacity="0.25"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300" role="img">` +
    shadow +
    parts.join("") +
    `</svg>`
  );
}

/* ── Exercise registry (pilot) ────────────────────────────────── */

export const RIG_DEMOS: Record<string, RigDemo> = {
  squat: {
    equipment: "barbell-back",
    tint: ["quad", "glute", "erectors"],
    keyframes: [
      // Top: standing tall, bar on traps, hands up beside shoulders.
      { shank: 2, thigh: -2, torso: 4, shoulder: 8, elbow: 167 },
      // Quarter: knees travel, hips back.
      { shank: 12, thigh: -30, torso: 18, shoulder: 8, elbow: 167 },
      // Bottom: below parallel, torso leant, bar over midfoot.
      { shank: 26, thigh: -78, torso: 38, shoulder: 8, elbow: 167 },
    ],
  },
  deadlift: {
    equipment: "barbell-hands",
    tint: ["glute", "hamstring", "erectors", "lat", "forearm"],
    keyframes: [
      // Lockout: standing, bar at thighs, arms hanging straight.
      { shank: 0, thigh: 0, torso: 2, shoulder: 4, elbow: 0 },
      // Mid hinge: hips back, bar sliding down the thigh.
      { shank: 6, thigh: -32, torso: 42, shoulder: 8, elbow: 0 },
      // Bottom: bar below knees, flat back.
      { shank: 14, thigh: -55, torso: 62, shoulder: 12, elbow: 0 },
    ],
  },
  "overhead-press": {
    equipment: "barbell-hands",
    tint: ["delt", "triceps", "trap", "abs"],
    keyframes: [
      // Lockout overhead: arm straight up.
      { shank: 0, thigh: 0, torso: -2, shoulder: 178, elbow: -2 },
      // Mid press: bar at forehead height.
      { shank: 0, thigh: 0, torso: 2, shoulder: 150, elbow: -70 },
      // Rack: bar at the clavicle, elbows down-forward.
      { shank: 0, thigh: 0, torso: 4, shoulder: 120, elbow: -125 },
    ],
  },
  "barbell-curl": {
    equipment: "barbell-hands",
    tint: ["biceps", "forearm"],
    keyframes: [
      // Top of the curl: bar at the shoulders.
      { shank: 0, thigh: 0, torso: -3, shoulder: 10, elbow: -135 },
      // Mid: forearm horizontal.
      { shank: 0, thigh: 0, torso: 0, shoulder: 6, elbow: -90 },
      // Bottom: arms hanging.
      { shank: 0, thigh: 0, torso: 2, shoulder: 4, elbow: -5 },
    ],
  },
};

/** Demo lookup — the Form view's FIRST-choice source (above media/photos). */
export function getRigDemo(exerciseId: string): RigDemo | null {
  return RIG_DEMOS[exerciseId] ?? null;
}
