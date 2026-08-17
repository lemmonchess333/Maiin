/**
 * Body rig — animated exercise demos built from the REAL muscle-map figure.
 *
 * History: stock photos rejected; Gemini frames rejected twice; a hand-drawn
 * side-view rig rejected ("needs to look like THIS" — the muscle map). The
 * final insight: react-body-highlighter ships the professional figure as raw
 * polygon data, so we vendor it (bodyModelData.ts, MIT) and animate THE
 * ACTUAL ART — skeletal limb groups transformed about measured joint pivots.
 * The demo is literally the app's muscle-map body performing the movement,
 * with the working muscles filled in the same purples the Form view uses.
 *
 * Motion language (front/back view, like the reference):
 *  - arms rotate about the measured shoulder/elbow pivots (in-plane);
 *  - squats/hinges read via vertical compression about the knee/hip lines
 *    plus body drop — the standard stylization for frontal anatomy figures;
 *  - NO held weights. Barbells/dumbbells were built and removed: the
 *    figure has no hands, so a held prop always read detached (product
 *    owner call, 2026-07-03). The movement + muscle tint carry the
 *    meaning. Only STRUCTURAL equipment survives — the bar a pull-up
 *    hangs from, the pulldown cable — drawn as thin scene lines.
 *
 * Everything is deterministic data → testable, theme-consistent, zero assets.
 */

import { ANTERIOR, POSTERIOR, type BodyPoly } from "./bodyModelData";
import { SIDE_PIECES, SIDE_ANCHORS } from "./bodySideData";
import { THEME } from "./theme";

/* ── Palette (exactly what the Form view's Model renders) ─────── */

const BODY = "#B6BDC3"; // react-body-highlighter DEFAULT_BODY_COLOR
const PRIMARY = THEME.lifting; // #7B72E9
const SECONDARY = THEME.liftingLight; // #9590E0
const GEAR = "#4A4B52";
const GEAR_DARK = "#35363C";
/** The demo stage surface (--stage, #111113). Side-view pieces use it
 *  for their separation strokes, so the seams read as the stage showing
 *  through — identical language to the front/back facet gaps. */
const STAGE = "#111113";
/** Far-side limbs in the profile rig — ~12% darker so overlaps read. */
const BODY_FAR = "#9FA6AC";

/* ── Measured joint anchors (viewBox 0 0 100 200) ─────────────── */

const ANT = {
  shoulderL: [24, 48] as Pt,
  shoulderR: [76, 48] as Pt,
  elbowL: [20, 71] as Pt,
  elbowR: [80, 71] as Pt,
  handL: [10, 100] as Pt,
  handR: [89, 100] as Pt,
  hipY: 96,
  kneeL: [32, 148] as Pt,
  kneeR: [68, 148] as Pt,
  ankleY: 196,
};
const POST = {
  shoulderL: [23, 46] as Pt,
  shoulderR: [77, 46] as Pt,
  elbowL: [17, 78] as Pt,
  elbowR: [83, 78] as Pt,
  handL: [9, 106] as Pt,
  handR: [91, 106] as Pt,
  hipY: 100,
  // The posterior art runs past the anterior's 203 — soleus/heel reaches
  // y=220. Clipping at the anterior height amputated the lower legs.
  ankleY: 220,
};

type Pt = [number, number];

/* Arm segment lengths (per view) + the pull-up scene constants. */
const ANT_UPPER_LEN = Math.hypot(
  ANT.elbowL[0] - ANT.shoulderL[0],
  ANT.elbowL[1] - ANT.shoulderL[1]
);
const ANT_FORE_LEN = Math.hypot(
  ANT.handL[0] - ANT.elbowL[0],
  ANT.handL[1] - ANT.elbowL[1]
);
/* WHERE THE DIP BARS ARE, and it is not where the hands rest.
 *
 * Owner, on the shipped demo: "arms look so far apart on the dips".
 * `ANT.handL/handR` are the ARMS-HANGING-RELAXED hand positions of the
 * anterior figure — 89.6 apart against a 52.0 shoulder span, so using
 * them as grips put the hands at 1.72x shoulder width. That is not a
 * dip station; liftmanual's chest- and triceps-dip figures both stand on
 * bars at roughly shoulder width with the arms near-vertical at lockout.
 *
 * And the width was doing more damage than it looked. With the hands
 * pinned that far out, the IK has nowhere to put the elbows as the body
 * sinks except further out again — the old comment cheerfully described
 * this as "the elbows flare outward as the body sinks", which measured
 * at 20.8 units lateral of the shoulder at the bottom. liftmanual is
 * explicit that flare is the axis SEPARATING its two dip pages: the
 * chest dip is "slightly flared" with a forward lean, the triceps dip
 * keeps the elbows tucked. 20.8 units is neither.
 *
 * Derived, not dialled in. The grip sits where a STRAIGHT arm hanging
 * from the shoulder reaches when the bar is 1.2x shoulder width — so
 * lockout is a genuinely straight arm rather than a slightly bent one
 * that happens to look straight:
 *
 *   half-span   = 26.0 * 1.2                      = 31.2
 *   lateral off = 31.2 - 26.0                     =  5.2  from the shoulder
 *   drop        = sqrt(armLen^2 - 5.2^2)          = 53.4
 *
 * `armLen` is ANT_UPPER_LEN + ANT_FORE_LEN, so the numbers move with
 * the model rather than being pinned to today's art. */
const DIP_GRIP_RATIO = 1.2;
const DIP_HALF_SPAN =
  ((ANT.shoulderR[0] - ANT.shoulderL[0]) / 2) * DIP_GRIP_RATIO;
const DIP_CENTRE_X = (ANT.shoulderL[0] + ANT.shoulderR[0]) / 2;
/** How far outside the shoulder the grip sits — 5.2 at a 1.2x bar. */
const DIP_LATERAL = DIP_HALF_SPAN - (ANT.shoulderR[0] - ANT.shoulderL[0]) / 2;
const DIP_GRIP_DROP = Math.sqrt(
  (ANT_UPPER_LEN + ANT_FORE_LEN) ** 2 - DIP_LATERAL ** 2
);
const DIP_GRIP_L: Pt = [
  DIP_CENTRE_X - DIP_HALF_SPAN,
  ANT.shoulderL[1] + DIP_GRIP_DROP,
];
const DIP_GRIP_R: Pt = [
  DIP_CENTRE_X + DIP_HALF_SPAN,
  ANT.shoulderR[1] + DIP_GRIP_DROP,
];

/* HOW FAR THE BODY SINKS, from liftmanual's depth landmark rather than
 * from taste. Both its dip pages share one: at the bottom the
 * shoulder-to-elbow segment is roughly parallel to the floor, which with
 * a vertical forearm is a right angle at the elbow.
 *
 * A right angle fixes the shoulder-to-hand distance outright —
 * sqrt(U^2 + F^2) by Pythagoras — so the drop is the amount of sink that
 * closes the straight-arm reach down to it. No sweep, no eyeballing:
 *
 *   d90 = sqrt(24.26^2 + 29.39^2) = 38.11
 *   dy  = 53.40 - sqrt(38.11^2 - 5.2^2) = 15.65
 *
 * The old value was 13, which lands the elbow at 98 degrees — eight
 * degrees shy of parallel, invisible by eye and exactly the class of
 * partial this sweep keeps finding. */
const DIP_BOTTOM_DROP =
  DIP_GRIP_DROP -
  Math.sqrt(ANT_UPPER_LEN ** 2 + ANT_FORE_LEN ** 2 - DIP_LATERAL ** 2);

const POST_UPPER_LEN = Math.hypot(
  POST.elbowL[0] - POST.shoulderL[0],
  POST.elbowL[1] - POST.shoulderL[1]
);
const POST_FORE_LEN = Math.hypot(
  POST.handL[0] - POST.elbowL[0],
  POST.handL[1] - POST.elbowL[1]
);
const PULLUP_BAR_Y = -12;
/* GRIP WIDTH IS WHAT SEPARATES TWO EXERCISES, so it is derived from the
 * shoulders rather than typed in. These were [6] and [94] — 88.0 apart
 * against a 54.0 shoulder span, so 1.63x shoulder width. liftmanual's
 * standard Pull-Up page asks for hand spacing at roughly biacromial
 * width and puts 1.5x on a SEPARATE page, the Wide Grip Pull-Up. At 1.63
 * the demo was not a wide-ish pull-up; it was the other exercise.
 *
 * Same defect the dip had, from the same cause: a width nothing was
 * holding, inherited from wherever the figure's hands happened to sit.
 * 1.15 keeps the hands a touch outside the shoulders, which is what
 * "roughly shoulder width" looks like on a bar, and stays clear of the
 * wide-grip page's territory. */
const PULLUP_GRIP_RATIO = 1.15;
const PULLUP_HALF_SPAN =
  ((POST.shoulderR[0] - POST.shoulderL[0]) / 2) * PULLUP_GRIP_RATIO;
const PULLUP_CENTRE_X = (POST.shoulderL[0] + POST.shoulderR[0]) / 2;
const PULLUP_GRIP_L: Pt = [PULLUP_CENTRE_X - PULLUP_HALF_SPAN, PULLUP_BAR_Y];
const PULLUP_GRIP_R: Pt = [PULLUP_CENTRE_X + PULLUP_HALF_SPAN, PULLUP_BAR_Y];
/** Body drop that puts the shoulder exactly an arm's length from the
 *  grip — i.e. a real dead hang. See the pose for why it is solved. */
const PULLUP_HANG_DY =
  Math.sqrt(
    (POST_UPPER_LEN + POST_FORE_LEN) ** 2 -
      (POST.shoulderL[0] - PULLUP_GRIP_L[0]) ** 2
  ) -
  (POST.shoulderL[1] - PULLUP_BAR_Y);
/* Lowest vertex of the posterior head polygon in the UNPOSED model —
 * the jaw line, which is the chin in a from-behind view. Mirrored here
 * rather than derived, because bodyRig does not otherwise read the model
 * geometry; `pull-up chin reference` pins it against bodyModelData so it
 * cannot drift. */
const PULLUP_CHIN_REST_Y = 19.95;
/** Clear air between chin and bar at the top — liftmanual wants the chin
 *  "clearly over, not level". */
const PULLUP_CHIN_CLEARANCE = 3;
/** Body rise that puts the chin over the bar, rather than a round number
 *  that happened to look high enough. */
const PULLUP_TOP_DY = PULLUP_BAR_Y - PULLUP_CHIN_CLEARANCE - PULLUP_CHIN_REST_Y;

/* Side-view arm segment lengths. */
const SIDE_UPPER_LEN = Math.hypot(
  SIDE_ANCHORS.elbow[0] - SIDE_ANCHORS.shoulder[0],
  SIDE_ANCHORS.elbow[1] - SIDE_ANCHORS.shoulder[1]
);
const SIDE_FORE_LEN = Math.hypot(
  SIDE_ANCHORS.hand[0] - SIDE_ANCHORS.elbow[0],
  SIDE_ANCHORS.hand[1] - SIDE_ANCHORS.elbow[1]
);

/* Shoulder-to-hand reach of a STRAIGHT side-view arm, minus a hair.
 *
 * Two demos were setting this distance by eye and both landed short: the
 * bench "locked out" at 134 degrees and the row's "dead hang" started at
 * 130. Neither reads as wrong, because an arm 5 units short of extension
 * looks extended -- the elbow angle is brutally sensitive to reach near
 * full extension, which is the same singularity that makes `solveElbow`
 * clamp. That sensitivity cuts both ways: it is why the error hid, and
 * why the fix is a derived length rather than a bigger guess.
 *
 * 0.997 rather than 1.0 keeps the solve just inside the clamp. Sitting
 * ON the clamp is what let the pull-up's hang pass while over-extended,
 * so this stays deliberately short of it. */
const SIDE_ARM_REACH = (SIDE_UPPER_LEN + SIDE_FORE_LEN) * 0.997;

/** Balance rule (pose physics): mass stays over mid-foot, so as the
 *  torso hinges forward the hips travel BACK — implemented as the whole
 *  standing chain leaning back about the planted ankle, hips countering
 *  ~0.4× the shoulders' forward travel. Every standing hinge appends
 *  this op to every group. */
function hipsBack(hingeDeg: number): Extract<Op, { kind: "rotate" }> {
  const fwd = Math.sin((hingeDeg * Math.PI) / 180) * 55.5; // shoulder travel
  const lean = (Math.asin(Math.min(0.4 * fwd, 30) / 93) * 180) / Math.PI;
  return { kind: "rotate", deg: -lean, pivot: SIDE_ANCHORS.ankle };
}

/* Push-up scene constants (final space): where the hands plant and
 * where the tilted plank's toes rest. */
const PUSHUP_HAND: Pt = [100, 156];
const PUSHUP_TOE: Pt = [-61.6, 155.8];
/** Plank incline, about the planted hand. Named because the pose applies
 *  it and the inverse chain un-applies it, and two hand-typed 13s that
 *  must stay negatives of each other is a drift waiting to happen. */
const PUSHUP_TILT = -13;
/* PLANK ANGLE THAT ACTUALLY LOCKS THE ARM OUT.
 *
 * The top of a push-up is a straight arm, and this one sat at 145
 * degrees — the shoulder 52.5 from the planted hand against a 55.07 arm.
 * Same defect as the bench and the row, and hidden the same way: 2.5
 * units of shortfall buys 30 degrees of elbow and still reads straight.
 *
 * Which knob had to move is not obvious and is worth recording, because
 * the obvious one CANNOT work. `PUSHUP_TILT` rotates the body about the
 * planted HAND, and a rotation about a point cannot change the distance
 * from that point to the shoulder — measured, sweeping it -13 to -19
 * left the reach at exactly 52.51 and moved only the toes. `B` pivots
 * about the TOE, which raises the shoulder end while leaving the hand
 * plant untouched, so it is the only one that can straighten the arm
 * without unplanting anything.
 *
 * Solved rather than swept: the relation between a toe-pivot rotation
 * and the shoulder-to-hand reach has no tidy closed form, so bisect for
 * the angle that lands on SIDE_ARM_REACH. Deliberately just SHORT of the
 * clamp — every base past about -0.95 pins the reach at solveElbow's
 * ceiling, and a clamped solve draws a straight arm whether or not the
 * geometry earns one. That is precisely how the pull-up's dead hang
 * passed while over-extended. */
const PUSHUP_TOP_BETA = (() => {
  const reachAt = (beta: number) => {
    const S = applyToPoint(SIDE_ANCHORS.shoulder, [
      { kind: "rotate", deg: 90, pivot: [44, 100] },
      { kind: "rotate", deg: PUSHUP_TILT, pivot: PUSHUP_HAND },
      { kind: "rotate", deg: beta, pivot: PUSHUP_TOE },
    ]);
    return Math.hypot(S[0] - PUSHUP_HAND[0], S[1] - PUSHUP_HAND[1]);
  };
  let lo = -6; // more negative → longer reach
  let hi = 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (reachAt(mid) > SIDE_ARM_REACH) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
})();

/** Where the push-up's palms meet the world. Mirrors the demo's own
 *  `groundY`; `push-up plants its palm` pins the two equal. */
const PUSHUP_GROUND = 158.5;

/* The push-up hand's ONE transform: prone, flat, palm on the ground line.
 *
 * Built from the top-of-rep frame -- the arm is straight there, so the
 * forearm axis is the honest wrist orientation -- then dropped by however
 * far the palm's lowest vertex misses the floor. Measured off the real
 * `handL` outline rather than the wrist anchor, because the wrist anchor
 * is exactly what got this wrong: `PUSHUP_HAND` is the WRIST and the hand
 * piece overhangs it, so aiming the wrist at the plant buries the palm.
 * Same fix-class as a barbell grip -- the contact point is where the body
 * actually meets the world, never the joint above it. */
const PUSHUP_HAND_OPS: Op[] = (() => {
  const bodyOps: Op[] = [
    { kind: "rotate", deg: 90, pivot: [44, 100] },
    { kind: "rotate", deg: PUSHUP_TILT, pivot: PUSHUP_HAND },
    { kind: "rotate", deg: PUSHUP_TOP_BETA, pivot: PUSHUP_TOE },
  ];
  const hPre = applyToPoint(PUSHUP_HAND, [
    { kind: "rotate", deg: -PUSHUP_TOP_BETA, pivot: PUSHUP_TOE },
    { kind: "rotate", deg: -PUSHUP_TILT, pivot: PUSHUP_HAND },
    { kind: "rotate", deg: -90, pivot: [44, 100] },
  ]);
  const arm = aimArm(
    { S: SIDE_ANCHORS.shoulder, E: SIDE_ANCHORS.elbow, H: SIDE_ANCHORS.hand },
    solveElbow(SIDE_ANCHORS.shoulder, hPre, SIDE_UPPER_LEN, SIDE_FORE_LEN, -1),
    hPre,
    0
  );
  const base: Op[] = [...arm.fore, ...bodyOps];
  const outline =
    (SIDE_PIECES.find((piece) => piece.group === "handL")?.outline as Pt[]) ??
    [];
  const lowest = Math.max(...outline.map((q) => applyToPoint(q, base)[1]));
  return [...base, { kind: "translate", dx: 0, dy: PUSHUP_GROUND - lowest }];
})();

/* Muscle-aura rings — nested convex hulls at falling opacity (the
 * no-filter fake blur; see the glow block in the renderers). */
const GLOW_RINGS: [number, number][] = [
  [1.05, 0.2],
  [1.12, 0.12],
  [1.2, 0.06],
];

/* ── Skeletal grouping ────────────────────────────────────────── */

/* GroupName lives in bodyTypes.ts (audit batch 3 cycle break with
   bodySideData) — imported for local use and re-exported for the many
   existing importers. */
import type { GroupName } from "./bodyTypes";
export type { GroupName } from "./bodyTypes";

function groupOf(view: "anterior" | "posterior", p: BodyPoly): GroupName {
  const L = p.side === "left";
  if (p.muscle === "head") return "head";
  if (view === "anterior") {
    /* Deltoids ride the UPPER ARM, not the torso (2026-07-11 joint-
       alignment pass). Anatomically the deltoid caps the glenohumeral
       joint and moves with the humerus — it is the press/raise prime
       mover. Grouped with the torso it stayed welded to the ribcage
       while the arm rotated away, so every big shoulder movement
       (overhead press at 155°, lateral raise at 90°) showed the arm
       DETACHING from a static shoulder cap. With the deltoid in the
       arm group it pivots about the measured shoulder anchor —
       which sits in the deltoid mass — so the cap keeps covering the
       joint at every arm angle, matching the reference figures. */
    if (
      p.muscle === "biceps" ||
      p.muscle === "triceps" ||
      p.muscle === "front-deltoids"
    )
      return L ? "upperArmL" : "upperArmR";
    if (p.muscle === "forearm") return L ? "foreArmL" : "foreArmR";
    if (p.muscle === "quadriceps" || p.muscle === "abductors")
      return L ? "thighL" : "thighR";
    if (p.muscle === "knees" || p.muscle === "calves")
      return L ? "shankL" : "shankR";
    return "torso"; // chest, obliques, abs, neck
  }
  // Posterior: same deltoid-rides-the-arm rule (see anterior note).
  if (p.muscle === "triceps" || p.muscle === "back-deltoids")
    return L ? "upperArmL" : "upperArmR";
  if (p.muscle === "forearm") return L ? "foreArmL" : "foreArmR";
  if (
    p.muscle === "gluteal" ||
    p.muscle === "adductor" ||
    p.muscle === "hamstring"
  )
    return L ? "thighL" : "thighR";
  if (
    p.muscle === "knees" ||
    p.muscle === "calves" ||
    p.muscle === "left-soleus" ||
    p.muscle === "right-soleus"
  )
    return p.muscle === "left-soleus" || (L && p.muscle !== "right-soleus")
      ? "shankL"
      : "shankR";
  return "torso"; // trapezius, back-deltoids, upper-back, lower-back
}

/* ── Transform ops ────────────────────────────────────────────── */

export type Op =
  | { kind: "rotate"; deg: number; pivot: Pt }
  | { kind: "scaleY"; k: number; pivotY: number }
  /** Scale by k ALONG the axis at `deg` (same angle convention as rotate),
   *  through `pivot` — width across the limb is preserved. This is the 2D
   *  foreshortening cheat: a forearm flexing TOWARD the viewer shortens
   *  along its own length without getting thinner. */
  | { kind: "scaleAxis"; k: number; deg: number; pivot: Pt }
  | { kind: "translate"; dx: number; dy: number };

function applyOps(pts: Pt[], ops: Op[]): Pt[] {
  let out = pts;
  for (const op of ops) {
    if (op.kind === "translate") {
      out = out.map(([x, y]) => [x + op.dx, y + op.dy]);
    } else if (op.kind === "scaleY") {
      out = out.map(([x, y]) => [x, op.pivotY + (y - op.pivotY) * op.k]);
    } else if (op.kind === "scaleAxis") {
      // R(deg) · S_y(k) · R(-deg) about the pivot.
      const a = (op.deg * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const [px, py] = op.pivot;
      out = out.map(([x, y]) => {
        const dx = x - px;
        const dy = y - py;
        const rx = dx * c + dy * s; // rotate by -deg → axis is vertical
        const ry = (-dx * s + dy * c) * op.k; // scale along it
        return [px + rx * c - ry * s, py + rx * s + ry * c]; // rotate back
      });
    } else {
      const a = (op.deg * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const [px, py] = op.pivot;
      out = out.map(([x, y]) => {
        const dx = x - px;
        const dy = y - py;
        return [px + dx * c - dy * s, py + dx * s + dy * c];
      });
    }
  }
  return out;
}

/** Also run single points (bar anchors, test probes) through ops. */
export function applyToPoint(p: Pt, ops: Op[]): Pt {
  return applyOps([p], ops)[0];
}

/* ── Two-bone IK (pull-up / pulldown arms) ────────────────────────
 * When BOTH ends of the arm are constrained (shoulder rides the body,
 * hand grips a bar), the elbow must be SOLVED, not choreographed. */

/** Signed rotation (SVG convention) that turns vector `from` onto `to`. */
function angleBetween(from: Pt, to: Pt): number {
  const cross = from[0] * to[1] - from[1] * to[0];
  const dot = from[0] * to[0] + from[1] * to[1];
  return (Math.atan2(cross, dot) * 180) / Math.PI;
}

/** Elbow position for shoulder S → hand H with limb lengths L1/L2.
 *  `out` picks the bend side: +1 flares the elbow toward −x (left arm),
 *  −1 toward +x (right arm). Overlong reaches clamp to a straight arm. */
function solveElbow(S: Pt, H: Pt, L1: number, L2: number, out: 1 | -1): Pt {
  let dx = H[0] - S[0];
  let dy = H[1] - S[1];
  let d = Math.hypot(dx, dy);
  const max = (L1 + L2) * 0.999;
  const min = Math.abs(L1 - L2) * 1.001;
  const clamped = Math.min(Math.max(d, min), max);
  dx *= clamped / d;
  dy *= clamped / d;
  d = clamped;
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(L1 * L1 - a * a, 0));
  const ux = dx / d;
  const uy = dy / d;
  return [S[0] + a * ux + out * h * uy, S[1] + a * uy - out * h * ux];
}

/** Ops that aim a rest-posed arm (S/E/H anchors) so the elbow lands on
 *  `E` and the hand on `H`, with the body already translated by `dy`. */
function aimArm(
  rest: { S: Pt; E: Pt; H: Pt },
  E: Pt,
  H: Pt,
  dy: number
): { upper: Op[]; fore: Op[] } {
  const uaRest: Pt = [rest.E[0] - rest.S[0], rest.E[1] - rest.S[1]];
  const faRest: Pt = [rest.H[0] - rest.E[0], rest.H[1] - rest.E[1]];
  const S: Pt = [rest.S[0], rest.S[1] + dy]; // body carries the shoulder
  const ua = angleBetween(uaRest, [E[0] - S[0], E[1] - S[1]]);
  const fa = angleBetween(faRest, [H[0] - E[0], H[1] - E[1]]) - ua;
  const shift: Op = { kind: "translate", dx: 0, dy };
  return {
    upper: [{ kind: "rotate", deg: ua, pivot: rest.S }, shift],
    fore: [
      { kind: "rotate", deg: fa, pivot: rest.E },
      { kind: "rotate", deg: ua, pivot: rest.S },
      shift,
    ],
  };
}

/* ── Glow hull (working-muscle aura) ─────────────────────────────
 * The app's glow recipe (BodyMapGlow) is a static blurred layer whose
 * OPACITY animates — never a filter animation. Here the same idea with
 * zero filters at all: the convex hull of each primary muscle, drawn as
 * nested enlarged rings at falling opacity — a deterministic fake blur
 * that moves WITH the muscle and breathes with effort. */

/** Andrew monotone-chain convex hull. */
function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const pt of p) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0
    )
      lower.pop();
    lower.push(pt);
  }
  const upper: Pt[] = [];
  for (const pt of [...p].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0
    )
      upper.pop();
    upper.push(pt);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function scaleAboutCentroid(pts: Pt[], k: number): Pt[] {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

/* The library figure has no feet (its chart crops at the calves, which
 * reads amputee-ish in a full-body demo). Two small in-style wedges,
 * grouped with the shanks so they inherit leg transforms. */
const ANTERIOR_FEET: { group: GroupName; points: Pt[] }[] = [
  {
    group: "shankL",
    points: [
      [22, 195],
      [30, 195],
      [31, 199],
      [27, 203],
      [18, 203],
      [19, 198],
    ],
  },
  {
    group: "shankR",
    points: [
      [70, 195],
      [78, 195],
      [81, 198],
      [82, 203],
      [73, 203],
      [69, 199],
    ],
  },
];

/* ── Exercise definitions ─────────────────────────────────────── */

const easeInOutSine = (t: number) =>
  0.5 - 0.5 * Math.cos(Math.PI * Math.min(Math.max(t, 0), 1));

export interface BodyDemo {
  view: "anterior" | "posterior" | "side";
  /** muscle name → tint level (the SAME muscle names the Form view maps). */
  tint: Record<string, "primary" | "secondary">;
  /** Which end of t is the top of the CONCENTRIC (lifting) phase. Squats
   *  and hinges descend first (concentric drives back to 0); presses,
   *  curls and raises lift first (concentric drives to 1). The player
   *  uses this to put the slow eccentric on the right half of the rep,
   *  and the renderer to breathe the ground shadow with body depth. */
  concentricTo: 0 | 1;
  /** Movements whose envelope exceeds the body's column (e.g. a lateral
   *  raise at full span) declare a wider canvas. */
  viewBox?: string;
  /** Group transforms as a function of eased progress e ∈ [0,1]. */
  pose: (e: number) => Partial<Record<GroupName, Op[]>>;
  /** STRUCTURAL equipment only (no held weights — the figure has no
   *  hands): a fixed-bar is the overhead bar the body hangs from
   *  (pull-up); a cable-bar is the machine bar + cable (pulldown). */
  equip?: "fixed-bar" | "cable-bar" | "dip-bars" | "plate-end";
  /** plate-end disc radius (default 10). The deadlift draws a
   *  full-size 45 (r=26 ≈ 45 cm on a 175 cm figure) so the bottom
   *  frame reads bar-near-the-floor. */
  plateR?: number;
  /** Draw the equipment OVER the body (pushdown: the hands work in
   *  front of the torso, so a behind-the-body bar would vanish). */
  barInFront?: boolean;
  bar?: (_e: number, pose: Partial<Record<GroupName, Op[]>>) => [Pt, Pt] | null;
  /** Free scene furniture (a bench, a floor line) drawn behind the
   *  body — raw SVG in GEAR colours. Side-view demos use this. */
  scene?: (e: number, pose: Partial<Record<GroupName, Op[]>>) => string;
  /** Scene gear drawn OVER the body (side view only): the rope + cable a
   *  pushdown grips works in front of the figure, exactly like the
   *  plate-end barbell. Receives the solved pose, so attachments are
   *  drawn FROM the hand's constraint — never floating free of it. */
  sceneFront?: (e: number, pose: Partial<Record<GroupName, Op[]>>) => string;
  /** Ground line override (hanging demos float above a lower floor). */
  groundY?: number;
  /** Shadow centre override (lying scenes aren't centred on x=50). */
  shadowCx?: number;
  /** Shadow radius override (a lying body casts a long shadow). */
  shadowRx?: number;
}

const lerp = (a: number, b: number, e: number) => a + (b - a) * e;

export const BODY_DEMOS: Record<string, BodyDemo> = {
  squat: {
    view: "anterior",
    concentricTo: 0,
    tint: { quadriceps: "primary", abductors: "secondary", abs: "secondary" },
    pose: (e) => {
      const k = lerp(1, 0.6, e); // thigh compression about the knee line
      // The torso must track the moving thigh TOPS exactly (y≈92) or a
      // waist gap opens between the obliques and the quads.
      const drop = (1 - k) * (ANT.kneeL[1] - 92);
      const flare = lerp(0, 7, e);
      const dive: Op[] = [{ kind: "translate", dx: 0, dy: drop }];
      /* Arms ride down with the body. (A folded front-view grip was tried
         and read as broken polygons across the chest — rigid facets can't
         fold 150° gracefully. Hanging arms are the clean stylization.)
         2026-07-11 joint pass: hanging arms also ABDUCT a touch with
         depth — at the bottom the compressed thighs widened into the
         hands and the forearms clipped INTO the quads. ~10 deg of
         outward shoulder rotation keeps the hands clear of the thighs
         through the whole descent (mirrors how references drift the
         arms forward/out as the hips sink). */
      const armOut = lerp(0, 10, e);
      const armL: Op[] = [
        { kind: "rotate", deg: armOut, pivot: ANT.shoulderL },
        ...dive,
      ];
      const armR: Op[] = [
        { kind: "rotate", deg: -armOut, pivot: ANT.shoulderR },
        ...dive,
      ];
      return {
        thighL: [
          { kind: "scaleY", k, pivotY: ANT.kneeL[1] },
          { kind: "rotate", deg: -flare, pivot: ANT.kneeL },
        ],
        thighR: [
          { kind: "scaleY", k, pivotY: ANT.kneeR[1] },
          { kind: "rotate", deg: flare, pivot: ANT.kneeR },
        ],
        shankL: [
          {
            kind: "rotate",
            deg: -flare * 0.5,
            pivot: [ANT.kneeL[0], ANT.ankleY],
          },
        ],
        shankR: [
          {
            kind: "rotate",
            deg: flare * 0.5,
            pivot: [ANT.kneeR[0], ANT.ankleY],
          },
        ],
        torso: dive,
        head: dive,
        upperArmL: armL,
        upperArmR: armR,
        foreArmL: armL,
        foreArmR: armR,
      };
    },
  },

  "overhead-press": {
    view: "anterior",
    concentricTo: 1,
    tint: {
      "front-deltoids": "primary",
      triceps: "secondary",
      neck: "secondary",
    },
    pose: (e) => {
      /* Bar-path press (2026-07-27 owner feedback rebuild). The old
       * version choreographed a 170° whole-arm rotation, which swept the
       * hands through a wide pendulum arc ("comes up, tries the other
       * side, goes back down") and finished as splayed slabs detached
       * from the shoulders. A press is a CONSTRAINT movement: the hands
       * ride an (invisible) bar whose path is a straight vertical line
       * above the shoulders. So the hands are pinned to that path and
       * the elbows are IK-solved. Bottom = the placard front-view press
       * start (bar at chin height, forearms vertical, elbows down-out —
       * a clavicle-level rack folds through the DEPTH axis, which a 2D
       * solve can't represent); top = lockout with a slight barbell V.
       * Same both-ends-constrained machinery as the pull-up/dips. */
      const GRIP = 14; // grip offset outside each shoulder (bar width)
      const y = lerp(32, -5, e); // chin-height bottom → overhead lockout
      const hl: Pt = [ANT.shoulderL[0] - GRIP, y];
      const hr: Pt = [ANT.shoulderR[0] + GRIP, y];
      const L = aimArm(
        { S: ANT.shoulderL, E: ANT.elbowL, H: ANT.handL },
        solveElbow(ANT.shoulderL, hl, ANT_UPPER_LEN, ANT_FORE_LEN, 1),
        hl,
        0
      );
      const R = aimArm(
        { S: ANT.shoulderR, E: ANT.elbowR, H: ANT.handR },
        solveElbow(ANT.shoulderR, hr, ANT_UPPER_LEN, ANT_FORE_LEN, -1),
        hr,
        0
      );
      return {
        upperArmL: L.upper,
        foreArmL: L.fore,
        upperArmR: R.upper,
        foreArmR: R.fore,
      };
    },
  },

  "barbell-curl": {
    /* Side-view STRICT curl (Phase-4 repair, roadmap "strict curl
     * (two-hand bar)"). The gated front view had both defects the gate
     * names: no bar, and ~58% forearm foreshortening at lockout. Profile
     * dissolves both — the flexion arc lives entirely in-plane, and the
     * bar renders end-on at the hand exactly like the deadlift's plate
     * (both hands stack behind the near grip in profile). Torso, hips
     * and legs stay planted: a strict curl, no body english — the honest
     * named variant. Elbows drift a few degrees forward at the top, the
     * one allowance every reference shows. */
    view: "side",
    equip: "plate-end",
    plateR: 10,
    concentricTo: 1,
    tint: { biceps: "primary", forearm: "secondary" },
    pose: (e) => {
      const curl = lerp(0, 135, e); // elbow flexion, hanging → top
      /* NO ELBOW DRIFT. This used to swing the whole upper arm 8 degrees
       * forward at the top, moving the elbow 3.5 units, on the stated
       * grounds that it is "the one allowance every reference shows".
       *
       * liftmanual is a reference and shows the opposite — it names elbow
       * travel as the curl's defining error: "pin your elbows against
       * your sides… they should not move forward or backward during the
       * lift". So the drift was not a concession every reference makes;
       * it was the fault the exercise is defined against, and this demo
       * calls itself a STRICT curl three lines up, which is precisely the
       * variant that forbids it.
       *
       * With the upper arm still, the elbow is a fixed point and the
       * forearm is the only thing that rotates — which is the whole
       * movement, stated geometrically. */
      const fore: Op[] = [
        { kind: "rotate", deg: -curl, pivot: SIDE_ANCHORS.elbow },
      ];
      return {
        foreArmL: fore,
        handL: fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
  },

  "rope-tricep-pushdown": {
    /* Side-view rope pushdown (Phase-4 repair, roadmap "rope pushdown
     * cleanup"). The gated front view drew a straight BAR across the
     * body — contradicting the exercise's own rope instructions (the
     * misrepresentation the gate names). In profile the machine reads
     * honestly: a cable drops from the high pulley to a rope whose
     * knotted tail hangs BELOW the grip, and the forearm extends about
     * the pinned elbow from folded-up to lockout at the thigh. The
     * cable + rope are drawn FROM the solved hand point every frame —
     * gear as a constraint, never independent of the body. */
    view: "side",
    concentricTo: 1,
    tint: { triceps: "primary", forearm: "secondary" },
    pose: (e) => {
      /* BOTH ENDS OF THE REP COME FROM THE CUE, not from taste.
       *
       * The side rest arm is dead straight, so the drawn elbow angle is
       * exactly 180 - flex, which makes both of liftmanual's pushdown
       * endpoints directly expressible:
       *
       *   top     elbow ~90, CAPPED — "the rope must NOT return to full
       *           flexion near the shoulders". It was returning to 71,
       *           which is that fault, animated as the model rep.
       *   bottom  elbow ~180, full lockout. It stopped at 169.
       *
       * A pushdown that neither locks out nor stops at the cap is a
       * partial at both ends; 2 degrees of softness at the bottom keeps
       * the lockout from reading as a hyperextension. */
      const flex = lerp(90, 2, e); // capped top → full lockout
      const fore: Op[] = [
        { kind: "rotate", deg: -flex, pivot: SIDE_ANCHORS.elbow },
      ];
      return { foreArmL: fore, handL: fore };
    },
    sceneFront: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      /* High pulley: fixed at the top of the station, forward of the
       * face so the cable clears the head through the whole arc. */
      const pulley: Pt = [72, -10];
      const dx = h[0] - pulley[0];
      const dy = h[1] - pulley[1];
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      /* Yoke where the cable meets the rope, a touch above the grip;
       * the rope's knotted tail continues past the hand. */
      const yoke: Pt = [h[0] - ux * 7, h[1] - uy * 7];
      const tail: Pt = [h[0] + ux * 8, h[1] + uy * 8];
      return (
        `<line x1="${pulley[0]}" y1="${pulley[1]}" x2="${yoke[0].toFixed(1)}" y2="${yoke[1].toFixed(1)}" stroke="${GEAR}" stroke-width="1.1"/>` +
        `<circle cx="${pulley[0]}" cy="${pulley[1] + 2}" r="3.2" fill="${GEAR_DARK}" stroke="#565760" stroke-width="0.8"/>` +
        `<line x1="${yoke[0].toFixed(1)}" y1="${yoke[1].toFixed(1)}" x2="${tail[0].toFixed(1)}" y2="${tail[1].toFixed(1)}" stroke="${GEAR_DARK}" stroke-width="2.6" stroke-linecap="round"/>` +
        `<circle cx="${tail[0].toFixed(1)}" cy="${tail[1].toFixed(1)}" r="2" fill="${GEAR}"/>`
      );
    },
  },

  dips: {
    view: "anterior",
    equip: "dip-bars",
    concentricTo: 0,
    // The body hangs on the bars the whole time — feet never touch the
    // floor, so the scene extends below the figure.
    viewBox: "-8 -14 116 240",
    groundY: 222,
    tint: {
      triceps: "primary",
      chest: "secondary",
      "front-deltoids": "secondary",
    },
    pose: (e) => {
      /* Hands stay ON the grips while the body drops between them —
       * same both-ends-constrained problem as the pull-up, IK-solved.
       *
       * The grips are `DIP_GRIP_L/R`, NOT `ANT.handL/handR`: see the
       * derivation there. Reusing the relaxed-hang hand positions is
       * what made the arms read as far apart, and it also forced the
       * flare, because an over-wide grip leaves the IK nowhere to put
       * the elbow but further out still.
       *
       * DEPTH IS A CUE, not a number chosen by eye. liftmanual's shared
       * dip landmark is that the shoulder-to-elbow segment reaches
       * roughly parallel to the floor at the bottom; `dy` is solved for
       * that below rather than guessed, which is what moved it off 13. */
      const dy = lerp(0, DIP_BOTTOM_DROP, e);
      const L = aimArm(
        { S: ANT.shoulderL, E: ANT.elbowL, H: ANT.handL },
        solveElbow(
          [ANT.shoulderL[0], ANT.shoulderL[1] + dy],
          DIP_GRIP_L,
          ANT_UPPER_LEN,
          ANT_FORE_LEN,
          -1
        ),
        DIP_GRIP_L,
        dy
      );
      const R = aimArm(
        { S: ANT.shoulderR, E: ANT.elbowR, H: ANT.handR },
        solveElbow(
          [ANT.shoulderR[0], ANT.shoulderR[1] + dy],
          DIP_GRIP_R,
          ANT_UPPER_LEN,
          ANT_FORE_LEN,
          1
        ),
        DIP_GRIP_R,
        dy
      );
      const ride: Op[] = [{ kind: "translate", dx: 0, dy }];
      return {
        head: ride,
        torso: ride,
        thighL: ride,
        thighR: ride,
        shankL: ride,
        shankR: ride,
        upperArmL: L.upper,
        foreArmL: L.fore,
        upperArmR: R.upper,
        foreArmR: R.fore,
      };
    },
    // Grip anchor line for the posts (the hands never move).
    bar: () => [DIP_GRIP_L, DIP_GRIP_R],
  },

  deadlift: {
    view: "side",
    equip: "plate-end",
    plateR: 16,
    concentricTo: 0,
    // Wider left margin than the RDL: the deep-hinge hips travel far
    // enough back that the glutes cross x=0.
    viewBox: "-18 -2 186 212",
    groundY: 204,
    shadowCx: 58,
    shadowRx: 44,
    tint: {
      hamstring: "primary",
      gluteal: "primary",
      "lower-back": "secondary",
      forearm: "secondary",
    },
    pose: (e) => {
      /* Conventional deadlift, rebuilt as a SIDE hinge (2026-07-27).
       * The old posterior view faked the hinge by scaleY-compressing
       * the torso, which read as a figure SHRINKING (Gate-0 verdict +
       * device feedback). This is the RDL's proven hinge language plus
       * real knee bend, built ankle-up so the feet stay planted:
       * shank rotates about the planted ankle (knees travel forward),
       * thigh rotates about the moved knee (hips drop and travel
       * back), torso hinges about the moved hip, and the straight
       * arms hang to the bar. Plate r=16 splits the difference between
       * the stylized r=10 (floats absurdly mid-shin) and a true 45
       * (r=26 — swallows the whole pelvis in the standing frame); the
       * bottom frame reads bar-just-off-the-floor. */
      /* Shin tilt stays ≤8°: the foot is part of the shank piece, so
       * every degree of shin tilt tips the sole — at 8° the heel read
       * stays planted, at 14° it visibly lifted. The hip depth lost is
       * recovered in thighRel. */
      const shin = lerp(0, 8, e); // about the planted ankle
      const thighRel = lerp(0, -64, e); // about the knee → hips back+down
      const hinge = lerp(0, 70, e); // torso about the hip
      const legOps: Op[] = [
        { kind: "rotate", deg: shin, pivot: SIDE_ANCHORS.ankle },
      ];
      const thighOps: Op[] = [
        { kind: "rotate", deg: thighRel, pivot: SIDE_ANCHORS.knee },
        { kind: "rotate", deg: shin, pivot: SIDE_ANCHORS.ankle },
      ];
      const hipNew = applyToPoint(SIDE_ANCHORS.hip, thighOps);
      const shift: Op = {
        kind: "translate",
        dx: hipNew[0] - SIDE_ANCHORS.hip[0],
        dy: hipNew[1] - SIDE_ANCHORS.hip[1],
      };
      const T: Op = { kind: "rotate", deg: hinge, pivot: SIDE_ANCHORS.hip };
      const torsoOps: Op[] = [T, shift];
      /* Straight arms hang from the hinged shoulder. The x-offset
       * interpolates: standing lockout rests the bar against the FRONT
       * of the thigh (+8), the bottom pulls it back under the shoulder
       * blades toward mid-foot (−5, the lats-pull-the-bar-in line) so
       * the bar never drifts out past the toes. */
      const S = applyToPoint(SIDE_ANCHORS.shoulder, torsoOps);
      const hFinal: Pt = [S[0] + lerp(8, -5, e), S[1] + 54.8];
      const unpose: Op[] = [
        { kind: "translate", dx: -shift.dx, dy: -shift.dy },
        { kind: "rotate", deg: -hinge, pivot: SIDE_ANCHORS.hip },
      ];
      const hPre = applyToPoint(hFinal, unpose);
      const arm = aimArm(
        {
          S: SIDE_ANCHORS.shoulder,
          E: SIDE_ANCHORS.elbow,
          H: SIDE_ANCHORS.hand,
        },
        solveElbow(
          SIDE_ANCHORS.shoulder,
          hPre,
          SIDE_UPPER_LEN,
          SIDE_FORE_LEN,
          -1
        ),
        hPre,
        0
      );
      return {
        head: torsoOps,
        torso: torsoOps,
        pelvis: torsoOps,
        thighL: thighOps,
        thighR: thighOps,
        shankL: legOps,
        shankR: legOps,
        upperArmL: [...arm.upper, ...torsoOps],
        foreArmL: [...arm.fore, ...torsoOps],
        handL: [...arm.fore, ...torsoOps],
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
  },

  "pull-ups": {
    view: "posterior",
    equip: "fixed-bar",
    concentricTo: 1,
    /* Hanging scene: bar overhead, floor just below the dangling heels
       at the dead hang. The top edge is -42, not -24: solving the top of
       the rep from the chin rather than from a round number raised the
       head 11 units further, and the old frame cropped it. */
    viewBox: "-20 -42 140 272",
    groundY: 226,
    tint: {
      "upper-back": "primary",
      trapezius: "secondary",
      forearm: "secondary",
    },
    pose: (e) => {
      /* Both ends of each arm are constrained — hands stay ON the bar
       * while the body rises — so the elbows are IK-solved. The solution
       * naturally produces the real silhouette: straight-arm hang at the
       * bottom, wide "W" flare (elbows out at ear height) at the top. */
      /* THE DEAD HANG IS SOLVED, not set to 1.
       *
       * liftmanual asks for both endpoints and the bottom one is "elbow
       * ~180 in a full dead hang before the next rep starts". The old
       * value passed that test for the wrong reason: at a 1.63x grip the
       * hand sat 17 units lateral of the shoulder, so the reach to the
       * bar EXCEEDED the arm and `solveElbow` clamped it to straight. The
       * hang read as straight because the arm was over-extended, not
       * because the body was hanging at arm's length.
       *
       * Narrowing the grip to shoulder width removed that lateral offset
       * and with it the accidental clamp — the same pose measured 147
       * degrees, a third of a pull-up already done at the "hang". So the
       * hang distance now comes from the arm: drop the body until the
       * shoulder is exactly an arm's length from the grip. */
      const dy = lerp(PULLUP_HANG_DY, PULLUP_TOP_DY, e);
      const L = aimArm(
        { S: POST.shoulderL, E: POST.elbowL, H: POST.handL },
        solveElbow(
          [POST.shoulderL[0], POST.shoulderL[1] + dy],
          PULLUP_GRIP_L,
          POST_UPPER_LEN,
          POST_FORE_LEN,
          1
        ),
        PULLUP_GRIP_L,
        dy
      );
      const R = aimArm(
        { S: POST.shoulderR, E: POST.elbowR, H: POST.handR },
        solveElbow(
          [POST.shoulderR[0], POST.shoulderR[1] + dy],
          PULLUP_GRIP_R,
          POST_UPPER_LEN,
          POST_FORE_LEN,
          -1
        ),
        PULLUP_GRIP_R,
        dy
      );
      const ride: Op[] = [{ kind: "translate", dx: 0, dy }];
      return {
        head: ride,
        torso: ride,
        thighL: ride,
        thighR: ride,
        shankL: ride,
        shankR: ride,
        upperArmL: L.upper,
        foreArmL: L.fore,
        upperArmR: R.upper,
        foreArmR: R.fore,
      };
    },
    bar: () => [
      [-16, PULLUP_BAR_Y],
      [116, PULLUP_BAR_Y],
    ],
  },

  "lat-pulldown": {
    view: "posterior",
    equip: "cable-bar",
    concentricTo: 1,
    viewBox: "-20 -20 140 246",
    tint: {
      "upper-back": "primary",
      "back-deltoids": "secondary",
      forearm: "secondary",
    },
    pose: (e) => {
      /* Body stays put; the bar travels from full overhead reach down to
       * the collarbone while the elbows tuck in to the sides — the same
       * IK machinery as the pull-up with the constraints swapped.
       *
       * THE BAR IS RIGID. Its hands used to travel outward as it came
       * down — x from 12.2 to 6 on the left and 87.8 to 94 on the right,
       * so the grip spread 75.6 -> 88.0 across the rep. A lat pulldown
       * bar is a steel bar and the hands are ON it: that is not a form
       * fault, it is an impossible object, and it was the widening that
       * made the elbows look like they flared rather than tucked.
       *
       * The x's are now constants and only y animates, which is the only
       * degree of freedom the equipment has. Reachable throughout — at
       * the collarbone the shoulder-to-hand distance is 11.5 against an
       * arm that folds to 3.5 — so nothing was being bought by the
       * spread. */
      const hy = lerp(-14.5, 50, e);
      const hl: Pt = [12.2, hy];
      const hr: Pt = [87.8, hy];
      const L = aimArm(
        { S: POST.shoulderL, E: POST.elbowL, H: POST.handL },
        solveElbow(POST.shoulderL, hl, POST_UPPER_LEN, POST_FORE_LEN, 1),
        hl,
        0
      );
      const R = aimArm(
        { S: POST.shoulderR, E: POST.elbowR, H: POST.handR },
        solveElbow(POST.shoulderR, hr, POST_UPPER_LEN, POST_FORE_LEN, -1),
        hr,
        0
      );
      return {
        upperArmL: L.upper,
        foreArmL: L.fore,
        upperArmR: R.upper,
        foreArmR: R.fore,
      };
    },
    bar: (e) => {
      // Same rigidity as the grips above: only y moves.
      const y = lerp(-14.5, 50, e);
      return [
        [12.2 - 10, y],
        [87.8 + 10, y],
      ];
    },
  },

  "lateral-raise": {
    view: "anterior",
    concentricTo: 1,
    // A raise at full span is nearly two arm-lengths wide — this is the
    // one movement whose envelope genuinely needs a wider canvas.
    viewBox: "-36 -14 172 224",
    tint: { "front-deltoids": "primary", neck: "secondary" },
    pose: (e) => {
      // Whole arm sweeps out to shoulder height (proper form stops at
      // parallel); a constant soft elbow bend so the arm never reads
      // hyper-straight, hands trailing slightly under the elbows.
      // 72, not 78: the rest arm already sits ~10° outside vertical, so
      // 78 finished ABOVE parallel — a form error the demo was teaching.
      const arm = lerp(4, 72, e);
      /* THE SOFT BEND WAS SIGNED THE WRONG WAY, and the comment above is
       * how it survived: it states the intent ("so the arm never reads
       * hyper-straight"), and the code did the exact reverse. The rest
       * arm already carries a natural 171-degree bend; rotating the
       * forearm the wrong way about the elbow spent that bend and locked
       * the arm out at 179, so every frame of a lateral raise was drawn
       * with a dead-straight arm — which is liftmanual's named lateral-
       * raise fault, and its rule is "a slight bend at the start and the
       * SAME slight bend at the top… never drawn locked straight".
       *
       * Nothing caught it because nothing measured the elbow. A comment
       * asserting a property is not the property; this one had been
       * describing an arm the rig was not drawing.
       *
       * TWO CONSTRAINTS, and they want opposite signs — which is why the
       * obvious repair is wrong too. liftmanual asks for both a slight
       * constant bend AND "wrist y BELOW elbow y (elbow leads, hand
       * trails)". The interior angle is 171 - BEND, so a positive bend
       * softens the elbow; but positive also folds the forearm OUTWARD,
       * and outward becomes UPWARD once the arm is raised laterally.
       * Merely flipping the sign to +10 bought the 161-degree bend and
       * put the wrist 5.9 ABOVE the elbow — trading one named fault for
       * the other.
       *
       * -28 is where both hold: it reaches the same 161 degrees by
       * bending the elbow the other way, so the forearm folds inward and
       * the wrist finishes 13.9 BELOW the elbow. Solved against both
       * cues, not picked. */
      const BEND = -28;
      return {
        upperArmL: [{ kind: "rotate", deg: arm, pivot: ANT.shoulderL }],
        foreArmL: [
          { kind: "rotate", deg: BEND, pivot: ANT.elbowL },
          { kind: "rotate", deg: arm, pivot: ANT.shoulderL },
        ],
        upperArmR: [{ kind: "rotate", deg: -arm, pivot: ANT.shoulderR }],
        foreArmR: [
          { kind: "rotate", deg: -BEND, pivot: ANT.elbowR },
          { kind: "rotate", deg: -arm, pivot: ANT.shoulderR },
        ],
      };
    },
  },

  "calf-raise": {
    view: "anterior",
    concentricTo: 1,
    tint: { calves: "primary" },
    pose: (e) => {
      /* Heels drive the body straight up — but the FEET stay planted.
       * The shanks stretch from the ground line (tiptoe height is real:
       * floor→knee lengthens on plantarflexion), which lifts the knees
       * to meet the risen thighs while the foot wedges, sitting at the
       * bottom of the same group, barely move. Translating the shanks
       * instead floated the feet — a levitation, not a calf raise. */
      const rise = 6.5 * e;
      const lift: Op[] = [{ kind: "translate", dx: 0, dy: -rise }];
      const KNEE_TO_GROUND = 55; // knee line ~148 → ground 203
      const stretch: Op[] = [
        { kind: "scaleY", k: 1 + rise / KNEE_TO_GROUND, pivotY: 203 },
      ];
      return {
        head: lift,
        torso: lift,
        upperArmL: lift,
        upperArmR: lift,
        foreArmL: lift,
        foreArmR: lift,
        thighL: lift,
        thighR: lift,
        shankL: stretch,
        shankR: stretch,
      };
    },
  },

  "bench-press": {
    view: "side",
    equip: "plate-end",
    concentricTo: 1,
    viewBox: "-64 30 186 152",
    groundY: 172,
    shadowCx: 40,
    shadowRx: 68,
    tint: {
      chest: "primary",
      triceps: "secondary",
      "front-deltoids": "secondary",
    },
    pose: (e) => {
      /* Side view, lying on a bench face-up (whole body rotated −90°
       * about the hip line, head to the left). Knees bend so the feet
       * plant on the floor; the arm presses straight up with the elbow
       * IK-solved between the fixed shoulder and the hand's vertical
       * bar path. */
      const G: Op = { kind: "rotate", deg: -90, pivot: [44, 100] };
      const S = SIDE_ANCHORS.shoulder;
      /* Bar path (device feedback 2026-07-27: "the plate is over the
       * face"): bottom touches the LOWER chest (~22 toward the feet
       * from the shoulder joint), lockout finishes over the upper
       * chest — the real bench J-curve, and it keeps the plate disc
       * clear of the head at every frame. */
      /* LOCKOUT IS AN ARM'S LENGTH, not 50. The old endpoint put the
       * hand 50.6 from the shoulder against a 55.07 arm, which is a
       * 134-degree elbow -- a press that never finishes, invisible
       * because a nearly-straight arm looks straight. The direction of
       * the J-curve is unchanged; only its length is now derived, scaled
       * out along the same vector to a real extension. */
      const lockDir = Math.hypot(50, 8);
      const H: Pt = [
        S[0] + lerp(24, (50 / lockDir) * SIDE_ARM_REACH, e),
        S[1] + lerp(22, (8 / lockDir) * SIDE_ARM_REACH, e),
      ];
      const arm = aimArm(
        { S, E: SIDE_ANCHORS.elbow, H: SIDE_ANCHORS.hand },
        // out −1: the elbow tucks toward the feet/floor side, the real
        // bench groove (+1 folded it over the face).
        solveElbow(S, H, SIDE_UPPER_LEN, SIDE_FORE_LEN, -1),
        H,
        0
      );
      /* Legs (device feedback 2026-07-27: "knees almost straight,
       * sliding off the bench"): thigh drops 28° off the bench end and
       * the shank closes to 62° so the total leg rotation stays exactly
       * 90° — which is what makes the shin land screen-vertical AND the
       * foot (part of the shank piece) land sole-flat. 28° is solved
       * from the floor: hip pad-height + thigh + vertical shank + foot
       * puts the sole ON the ground line instead of 5 units through it
       * (the old 35°/55° split buried the feet and opened the knee to
       * ~125°). */
      const leg: Op[] = [
        { kind: "rotate", deg: 28, pivot: SIDE_ANCHORS.hip },
        G,
      ];
      const shank: Op[] = [
        { kind: "rotate", deg: 62, pivot: SIDE_ANCHORS.knee },
        { kind: "rotate", deg: 28, pivot: SIDE_ANCHORS.hip },
        G,
      ];
      return {
        head: [G],
        torso: [G],
        pelvis: [G],
        thighL: leg,
        thighR: leg,
        shankL: shank,
        shankR: shank,
        upperArmL: [...arm.upper, G],
        foreArmL: [...arm.fore, G],
        handL: [...arm.fore, G],
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    // Bench pad + legs + floor line, drawn behind the body.
    scene: () =>
      `<rect x="-64" y="109" width="136" height="7" rx="2.5" fill="${GEAR}"/>` +
      `<line x1="-50" y1="116" x2="-50" y2="170" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
      `<line x1="56" y1="116" x2="56" y2="170" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
      `<line x1="-58" y1="171" x2="118" y2="171" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "barbell-row": {
    view: "side",
    equip: "plate-end",
    concentricTo: 1,
    /* Top edge 30, not 38: the hinged head's crown sits at y=33 and the
       old frame cut 5 units off it in every frame. Pre-existing — the
       hang fix below does not move the head — but it turned up while
       measuring the bbox and is a clipped skull, so it goes with it. */
    viewBox: "-4 30 172 184",
    groundY: 204,
    shadowCx: 62,
    shadowRx: 40,
    tint: {
      "upper-back": "primary",
      biceps: "secondary",
      "lower-back": "secondary",
    },
    pose: (e) => {
      /* Bent-over row: a REAL hinge (the torso rotates about the hip —
       * the thing only a side view can show), soft knees, and the arm
       * rowing from a dead hang to the lower ribs, elbow driving up
       * past the back line. The arm is aimed in PRE-hinge space (rest
       * anchors) with the hinge composed LAST — same chain pattern as
       * the bench's global rotation. */
      const HINGE = 55; // constant torso incline, all frames
      const KNEE = 20; // constant soft knees
      const LEAN = hipsBack(HINGE); // balance rule: hips back
      const T: Op = { kind: "rotate", deg: HINGE, pivot: SIDE_ANCHORS.hip };
      const unpose: Op[] = [
        { kind: "rotate", deg: -LEAN.deg, pivot: LEAN.pivot },
        { kind: "rotate", deg: -HINGE, pivot: SIDE_ANCHORS.hip },
      ];
      const S = applyToPoint(SIDE_ANCHORS.shoulder, [T, LEAN]);
      // Bar path: a straight VERTICAL line below the shoulder joint —
      // below the knee at the bottom, lower ribs at the top with the
      // elbow driving past the torso line (IK bends it up-back).
      /* THE HANG IS AN ARM'S LENGTH. It started 50 below the shoulder
       * against a 55.07 arm -- a 130-degree elbow, so the row began with
       * a fifth of the pull already done and "dead hang" described
       * nothing in the drawing. The 1-unit forward offset is what keeps
       * the bar path just clear of the shins, so the drop is solved from
       * the reach with that offset taken out. */
      const hang = Math.sqrt(SIDE_ARM_REACH ** 2 - 1);
      const hFinal: Pt = [S[0] + 1, lerp(S[1] + hang, S[1] + 26, e)];
      const hPre = applyToPoint(hFinal, unpose);
      const arm = aimArm(
        {
          S: SIDE_ANCHORS.shoulder,
          E: SIDE_ANCHORS.elbow,
          H: SIDE_ANCHORS.hand,
        },
        solveElbow(
          SIDE_ANCHORS.shoulder,
          hPre,
          SIDE_UPPER_LEN,
          SIDE_FORE_LEN,
          -1
        ),
        hPre,
        0
      );
      const leg: Op[] = [
        { kind: "rotate", deg: KNEE, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      const shank: Op[] = [
        { kind: "rotate", deg: -KNEE, pivot: SIDE_ANCHORS.knee },
        { kind: "rotate", deg: KNEE, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      return {
        head: [T, LEAN],
        torso: [T, LEAN],
        pelvis: [T, LEAN],
        thighL: leg,
        thighR: leg,
        shankL: shank,
        shankR: shank,
        upperArmL: [...arm.upper, T, LEAN],
        foreArmL: [...arm.fore, T, LEAN],
        handL: [...arm.fore, T, LEAN],
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
  },

  "romanian-deadlift": {
    view: "side",
    equip: "plate-end",
    concentricTo: 0,
    // Camera must fit BOTH extremes: standing (full height) and hinged
    // (head reaching forward) — locked, so no framing jumps mid-rep.
    viewBox: "-4 -2 172 212",
    groundY: 204,
    shadowCx: 62,
    shadowRx: 40,
    tint: {
      hamstring: "primary",
      gluteal: "primary",
      "lower-back": "secondary",
    },
    pose: (e) => {
      /* The RDL is THE hinge: the torso rotates about the hip while the
       * arms hang plumb and the knees stay soft — the exact motion the
       * old posterior-compression stand-in could only fake. Same
       * pre-hinge aiming pattern as the row, but here the hinge itself
       * is the animation. */
      const hinge = lerp(0, 68, e);
      /* THE SOFT KNEE, AND THE SIGN THAT WAS SPENDING IT.
       *
       * This rotates the THIGH forward about the hip while the shank
       * keeps its rest orientation, so it does not ADD knee flexion --
       * it subtracts it. Measured across the knob, the joint angle is
       * 180 - |13.57 - KNEE|:
       *
       *     knob      0      5     10   13.57     15     20     25
       *     joint  166.4  171.4  176.4  180.0  178.6  173.6  168.6
       *
       * So the shipped 15 sat at 178.6 degrees -- a degree and a half
       * PAST dead straight, on the far side of the peak -- under a
       * comment reading "constant soft knees". Constant it was. Soft it
       * was not. Same shape as the lateral raise, where a wrongly-signed
       * rotation spent the rest arm's natural bend to lock the elbow out
       * at 179.
       *
       * 0 is derived, not chosen: the vendored figure is already DRAWN
       * standing with 13.57 degrees of knee flexion (the hip/knee/ankle
       * anchors subtend 166.44), which is mid soft-knee band. The
       * correct rotation is therefore none at all, and the RDL's real
       * signature is that the knee does not CHANGE -- which the pose
       * gets for free by applying one constant in every frame.
       *
       * It also re-plants the foot. The ankle had been sitting at
       * (33.0, 193.3), 13.6 units from SIDE_ANCHORS.ankle (46.6, 193) --
       * the point `hipsBack` pivots about -- and creeping across the rep.
       * The figure was leaning about a spot it was not standing on. At 0
       * the ankle lands on the pivot exactly, in every frame. */
      const KNEE = 0;
      const LEAN = hipsBack(hinge); // balance rule: hips travel back
      const T: Op = { kind: "rotate", deg: hinge, pivot: SIDE_ANCHORS.hip };
      const unpose: Op[] = [
        { kind: "rotate", deg: -LEAN.deg, pivot: LEAN.pivot },
        { kind: "rotate", deg: -hinge, pivot: SIDE_ANCHORS.hip },
      ];
      // Arms hang plumb from the hinged+leaned shoulder — the bar stays
      // against the legs on the way down.
      const S = applyToPoint(SIDE_ANCHORS.shoulder, [T, LEAN]);
      const hPre = applyToPoint([S[0] + 1.2, S[1] + 52], unpose);
      const arm = aimArm(
        {
          S: SIDE_ANCHORS.shoulder,
          E: SIDE_ANCHORS.elbow,
          H: SIDE_ANCHORS.hand,
        },
        solveElbow(
          SIDE_ANCHORS.shoulder,
          hPre,
          SIDE_UPPER_LEN,
          SIDE_FORE_LEN,
          -1
        ),
        hPre,
        0
      );
      const leg: Op[] = [
        { kind: "rotate", deg: KNEE, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      const shank: Op[] = [
        { kind: "rotate", deg: -KNEE, pivot: SIDE_ANCHORS.knee },
        { kind: "rotate", deg: KNEE, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      return {
        head: [T, LEAN],
        torso: [T, LEAN],
        pelvis: [T, LEAN],
        thighL: leg,
        thighR: leg,
        shankL: shank,
        shankR: shank,
        upperArmL: [...arm.upper, T, LEAN],
        foreArmL: [...arm.fore, T, LEAN],
        handL: [...arm.fore, T, LEAN],
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
  },

  "push-ups": {
    view: "side",
    concentricTo: 0,
    viewBox: "-72 84 216 84",
    groundY: 158.5,
    shadowCx: 20,
    shadowRx: 78,
    tint: { chest: "primary", triceps: "secondary", abs: "secondary" },
    pose: (e) => {
      /* Prone plank (global +90, face down, head right), tilted about
       * the planted hands so the toes meet the floor, then the whole
       * body pivots about the TOES as the chest drops — hands stay
       * planted, elbows IK-solved toward the feet. */
      const G: Op = { kind: "rotate", deg: 90, pivot: [44, 100] };
      const TILT: Op = { kind: "rotate", deg: PUSHUP_TILT, pivot: PUSHUP_HAND };
      const beta = lerp(PUSHUP_TOP_BETA, 9.5, e);
      const B: Op = { kind: "rotate", deg: beta, pivot: PUSHUP_TOE };
      const bodyOps: Op[] = [G, TILT, B];
      // Map the fixed hand plant back to standing space for the aim.
      const hPre = applyToPoint(PUSHUP_HAND, [
        { kind: "rotate", deg: -beta, pivot: PUSHUP_TOE },
        { kind: "rotate", deg: -PUSHUP_TILT, pivot: PUSHUP_HAND },
        { kind: "rotate", deg: -90, pivot: [44, 100] },
      ]);
      const arm = aimArm(
        {
          S: SIDE_ANCHORS.shoulder,
          E: SIDE_ANCHORS.elbow,
          H: SIDE_ANCHORS.hand,
        },
        solveElbow(
          SIDE_ANCHORS.shoulder,
          hPre,
          SIDE_UPPER_LEN,
          SIDE_FORE_LEN,
          -1
        ),
        hPre,
        0
      );
      return {
        head: bodyOps,
        torso: bodyOps,
        pelvis: bodyOps,
        thighL: bodyOps,
        thighR: bodyOps,
        shankL: bodyOps,
        shankR: bodyOps,
        upperArmL: [...arm.upper, ...bodyOps],
        foreArmL: [...arm.fore, ...bodyOps],
        /* THE HAND DOES NOT ROTATE. It used to ride `arm.fore`, so it
         * swung with the forearm and drove the palm 5.8 units through the
         * floor at the top, easing to 3.3 at the bottom -- and the
         * VARYING depth is the tell, since a merely mis-placed plant
         * would be off by a constant. Every other piece was clear; only
         * `handL` crossed.
         *
         * A push-up hand is flat on the floor for the whole rep and it is
         * the WRIST ANGLE that changes. So the hand takes one fixed
         * transform. Fixed also means it cannot drift off the plant,
         * which is the property the lockout work already pinned. */
        handL: PUSHUP_HAND_OPS,
      };
    },
    scene: () =>
      `<line x1="-70" y1="158.5" x2="120" y2="158.5" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },
};

/** Sibling exercises that share a demo's motion pattern.
 *
 * Alias hygiene (Motion Rig V2 roadmap, owner-decided 2026-07-16): an
 * alias is only legitimate when the variant genuinely shares the
 * canonical's grip, prop, and support geometry. `db-curl`/`hammer-curl`/
 * `ez-bar-curl`/`cable-curl` (different implement + grip semantics) and
 * `reverse-grip-cable-pushdown` (straight bar, not a rope attachment)
 * were removed — they fall back to the static reference until each has
 * its own prop/grip contract. */
const DEMO_ALIASES: Record<string, string> = {
  "db-shoulder-press": "overhead-press",
  "smith-shoulder-press": "overhead-press",
  "sumo-deadlift": "deadlift",
  "trap-bar-deadlift": "deadlift",
  "db-rdl": "romanian-deadlift",
  "front-squat": "squat",
  "goblet-squat": "squat",
  "bodyweight-squat": "squat",
  "smith-machine-squat": "squat",
  "cable-lateral-raise": "lateral-raise",
  "standing-calf-raise": "calf-raise",
  "chin-ups": "pull-ups",
  "tricep-dips": "dips",
  "weighted-chest-dip": "dips",
  "db-bench": "bench-press",
  "diamond-push-ups": "push-ups",
  "weighted-push-ups": "push-ups",
  "smith-bench-press": "bench-press",
  "pendlay-row": "barbell-row",
  "db-row": "barbell-row",
  "t-bar-row": "barbell-row",
};

/* Side-view demos ship since the Prompt-9 rig rebuild (canonical master
 * passing the D1-D5 spec, pelvis/hand/far-limb segments, poses as pure
 * transform data, end-on barbell plates, locked per-exercise camera).
 * Contact sheets live in docs/visual-audit/side-rig/. Flip off to fall
 * back to the photo/diagram ladder. */
export let SIDE_DEMOS_ENABLED = true;

/** Preview/QA hook: guarantees contact-sheet tooling renders side demos
 *  even if the flag is toggled off. Never called from app code. */
export function __unlockSideDemosForPreview(): void {
  SIDE_DEMOS_ENABLED = true;
}

/** Demos whose current rendering misrepresents the named exercise
 *  (Motion Rig V2 roadmap "open decision 2", owner-decided 2026-07-16).
 *  A gated id stays registered so preview tooling and mechanics tests
 *  can review the repair work, while production (the Form surface)
 *  shows the honest static reference. Remove an id here only with a
 *  replacement model that fixes the named defect, plus regenerated
 *  contact sheets for operator review (the 2026-07-27 precedent). */
const GATED_PENDING_REPAIR: ReadonlySet<string> = new Set([
  // 2026-08-15: barbell-curl and rope-tricep-pushdown left the gate —
  // both rebuilt as side-view models that fix the exact defect the gate
  // named (curl: real end-on bar, no foreshortening; pushdown: honest
  // rope + cable instead of a straight bar). Contact sheets regenerated
  // for the standing operator review.
]);

/** PRODUCTION lookup — what the Form surface may mount. Applies the
 *  alias map, the side-demo flag, and the misrepresentation gate. */
export function getBodyDemo(exerciseId: string): BodyDemo | null {
  const canonical = DEMO_ALIASES[exerciseId] ?? exerciseId;
  if (GATED_PENDING_REPAIR.has(canonical)) return null;
  const demo = BODY_DEMOS[canonical] ?? null;
  if (demo && demo.view === "side" && !SIDE_DEMOS_ENABLED) return null;
  return demo;
}

/** REVIEW lookup — alias-aware registry resolution with no production
 *  gates, so contact sheets and mechanics tests keep rendering gated
 *  demos while their repairs are iterated. */
function resolveDemoForReview(exerciseId: string): BodyDemo | null {
  return BODY_DEMOS[DEMO_ALIASES[exerciseId] ?? exerciseId] ?? null;
}

/* ── Rendering ────────────────────────────────────────────────── */

/**
 * Render the demo at progress t ∈ [0,1] (0 = start, 1 = deepest point).
 * Output matches the app's Model rendering exactly: naked polygons in the
 * library's body grey, working muscles in the Form view's two purples —
 * no strokes, natural facet gaps.
 *
 * `effort` ∈ [0,1] drives the highlight intensity — the pro-anatomy
 * convention (Muscle & Motion et al.): working muscles BRIGHTEN through
 * the concentric (lifting) phase and soften on the eccentric. Rendered as
 * fill-opacity over the same two purples, so the palette never changes.
 */
export function renderBodyDemo(
  exerciseId: string,
  t: number,
  effort = 1
): string {
  // Review resolution, NOT the production gate: previews and mechanics
  // tests must keep rendering gated demos (production mounting is decided
  // upstream by getBodyDemo in ExerciseFormContent).
  const demo = resolveDemoForReview(exerciseId);
  if (!demo) return "";
  if (demo.view === "side") return renderSideDemo(demo, t, effort);
  const e = easeInOutSine(t);
  const pose = demo.pose(e);
  // The side view returned above — narrow the view for the closures.
  const view = demo.view === "posterior" ? "posterior" : "anterior";
  const data = view === "anterior" ? ANTERIOR : POSTERIOR;
  const tintOpacity = (level: "primary" | "secondary") =>
    level === "primary" ? 0.72 + 0.28 * effort : 0.66 + 0.24 * effort;

  // Transformed points collected per primary (muscle, side) feed the
  // glow hulls below; the same pass emits the crisp polygons.
  const primaryPts = new Map<string, Pt[]>();
  /* Scapulohumeral rhythm (2026-07-11 joint pass): the deltoid rides
     the arm group but rotates at ~55% of the humerus angle about the
     same shoulder pivot — the 2D read of the real ~2:1 humerus/scapula
     rhythm every anatomy reference shows. Full-rate rotation flipped
     the cap off its clavicle footprint; zero-rate (old torso grouping)
     left the arm detaching from a static shoulder. Only shoulder-pivot
     ROTATES are damped — translations (squat dive, hang shifts) pass
     through so the deltoid always travels with the body. */
  const DELTOID_FOLLOW = 0.4;
  /** Cap on the cap: scapular upward rotation tops out (~60 deg of a
   *  180-deg reach), which reads as ~38 deg of deltoid tilt in this 2D
   *  stylization — beyond that the wedge visibly lifts off the traps. */
  const DELTOID_MAX_DEG = 38;
  const shoulders =
    view === "anterior"
      ? [ANT.shoulderL, ANT.shoulderR]
      : [POST.shoulderL, POST.shoulderR];
  const isShoulderPivot = (pt: Pt) =>
    shoulders.some((sp) => sp[0] === pt[0] && sp[1] === pt[1]);
  const deltoidOps = (ops: Op[]): Op[] =>
    ops.map((op) =>
      op.kind === "rotate" && isShoulderPivot(op.pivot)
        ? {
            ...op,
            deg:
              Math.sign(op.deg) *
              Math.min(Math.abs(op.deg) * DELTOID_FOLLOW, DELTOID_MAX_DEG),
          }
        : op
    );
  const polys = data
    .map((p) => {
      let ops = pose[groupOf(view, p)] ?? [];
      if (p.muscle === "front-deltoids" || p.muscle === "back-deltoids") {
        ops = deltoidOps(ops);
      }
      const pts = applyOps(p.points as Pt[], ops);
      const level = demo.tint[p.muscle];
      if (level === "primary") {
        const key = `${p.muscle}|${p.side}`;
        primaryPts.set(key, [...(primaryPts.get(key) ?? []), ...pts]);
      }
      const fill =
        level === "primary"
          ? PRIMARY
          : level === "secondary"
            ? SECONDARY
            : BODY;
      const op = level
        ? ` fill-opacity="${tintOpacity(level).toFixed(3)}"`
        : "";
      return `<polygon points="${pts
        .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
        .join(" ")}" fill="${fill}"${op}/>`;
    })
    .join("");

  /* Working-muscle aura: nested convex-hull rings behind the figure,
   * brightening with effort. Zero SVG filters (WKWebView glow rule) —
   * the falloff is faked with three enlarged hulls at falling opacity. */
  const glowStrength = 0.35 + 0.65 * effort;
  const glow =
    `<g class="glow">` +
    [...primaryPts.values()]
      .map((pts) => {
        const hull = convexHull(pts);
        return GLOW_RINGS.map(
          ([k, o]) =>
            `<polygon points="${scaleAboutCentroid(hull, k)
              .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
              .join(
                " "
              )}" fill="${PRIMARY}" opacity="${(o * glowStrength).toFixed(3)}"/>`
        ).join("");
      })
      .join("") +
    `</g>`;

  const feet =
    view === "anterior"
      ? ANTERIOR_FEET.map((f) => {
          const pts = applyOps(f.points, pose[f.group] ?? []);
          return `<polygon points="${pts
            .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
            .join(" ")}" fill="${BODY}"/>`;
        }).join("")
      : "";

  /* Structural equipment only. Held weights were removed — see the
     header. A bare line reads as NOTHING ("is that a treadmill?"), so
     every apparatus carries enough construction to be identifiable:
     the pull-up bar hangs from ceiling stems, cable machines get a
     pulley block feeding the cable, dip bars get base feet and a
     tube end-cap at each grip. Lines default to BEHIND the body; a
     pushdown bar draws in front (the hands work in front of the torso)
     while its cable stays behind, naturally occluded by the figure. */
  const viewTop = Number((demo.viewBox ?? "-8 -14 116 224").split(/\s+/)[1]);
  let barBehind = "";
  let barFront = "";
  const ends = demo.bar?.(e, pose);
  if (ends && demo.equip === "fixed-bar") {
    // Ceiling-mounted pull-up bar: two stems from the frame top down to
    // the bar, then the bar itself spanning the scene.
    const stem = (x: number) =>
      `<line x1="${x}" y1="${viewTop}" x2="${x}" y2="${ends[0][1]}" stroke="${GEAR_DARK}" stroke-width="2.2"/>`;
    barBehind =
      stem(0) +
      stem(100) +
      `<line x1="${ends[0][0]}" y1="${ends[0][1]}" x2="${ends[1][0]}" y2="${ends[1][1]}" stroke="${GEAR}" stroke-width="3.2" stroke-linecap="round"/>`;
  } else if (ends && demo.equip === "cable-bar") {
    // The machine: a pulley block at the frame top feeding the cable,
    // then the bar across the hands.
    const midX = (ends[0][0] + ends[1][0]) / 2;
    const y = (ends[0][1] + ends[1][1]) / 2;
    barBehind =
      `<rect x="${(midX - 3.4).toFixed(1)}" y="${viewTop + 1}" width="6.8" height="6.4" rx="2" fill="${GEAR_DARK}" stroke="#565760" stroke-width="0.8"/>` +
      `<line x1="${midX}" y1="${viewTop + 6}" x2="${midX}" y2="${y.toFixed(1)}" stroke="${GEAR_DARK}" stroke-width="1.4"/>`;
    const bar = `<line x1="${ends[0][0].toFixed(1)}" y1="${y.toFixed(1)}" x2="${ends[1][0].toFixed(1)}" y2="${y.toFixed(1)}" stroke="${GEAR}" stroke-width="2.8" stroke-linecap="round"/>`;
    if (demo.barInFront) barFront = bar;
    else barBehind += bar;
  } else if (ends && demo.equip === "plate-end") {
    // Profile barbell: the bar runs toward the viewer, so you see its
    // END — the near plate disc over the grip, a hub, and the bar tip.
    // Pinned to the wrist pivot, so it travels with every rep.
    const [x, y] = ends[0];
    barFront =
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" fill="${GEAR_DARK}" stroke="#565760" stroke-width="1"/>` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.4" fill="none" stroke="${GEAR}" stroke-width="1.2" opacity="0.7"/>` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" fill="${GEAR}"/>`;
  } else if (ends && demo.equip === "dip-bars") {
    // A dip STATION, not two floating lines: each upright gets a base
    // foot on the floor and a tube end-cap at the grip.
    const floor = (demo.groundY ?? 220) - 1;
    const post = ([x, y]: Pt) =>
      `<line x1="${x}" y1="${y}" x2="${x}" y2="${floor}" stroke="${GEAR}" stroke-width="2.6"/>` +
      `<line x1="${x - 7}" y1="${floor}" x2="${x + 7}" y2="${floor}" stroke="${GEAR_DARK}" stroke-width="2.4" stroke-linecap="round"/>` +
      `<circle cx="${x}" cy="${y}" r="2.8" fill="${GEAR_DARK}" stroke="#565760" stroke-width="0.9"/>`;
    barBehind = post(ends[0]) + post(ends[1]);
  }

  /* Joint caps: at big rotations a white wedge opens where a limb group
     pulls away from its neighbour (elbow fold, shoulder at lockout).
     A small body-grey disc at each MOVING joint, drawn behind the
     polygons, bridges the crack — invisible everywhere else. Only
     emitted when the joint actually articulates, so identity frames
     keep the untouched muscle-map look (its natural facet gaps ARE the
     style). */
  const articulates = (ops?: Op[]) =>
    !!ops?.some(
      (o) =>
        (o.kind === "rotate" && Math.abs(o.deg) > 8) || o.kind === "scaleAxis"
    );
  /* The wedge a joint opens grows with how far the limb rotated away
     from its rest orientation — a fixed 3.6 disc bridged a curl but
     left a dark pizza-slice gap at a press lockout (~170° of shoulder
     rotation) or a raised lateral (device feedback 2026-07-27:
     "detached sausage links"). Scale the cap with the group's total
     rotation so big strokes get real joint coverage. */
  const rotationOf = (ops?: Op[]) =>
    (ops ?? []).reduce(
      (sum, o) => sum + (o.kind === "rotate" ? Math.abs(o.deg) : 0),
      0
    );
  const capR = (base: number, ops?: Op[]) =>
    base + (3 * Math.min(rotationOf(ops), 180)) / 180;
  const A = demo.view === "anterior" ? ANT : POST;
  const capDefs: { pt: Pt; group: GroupName; r: number }[] = [
    { pt: A.shoulderL, group: "upperArmL", r: 3.6 },
    { pt: A.shoulderR, group: "upperArmR", r: 3.6 },
    { pt: A.elbowL, group: "foreArmL", r: 2.7 },
    { pt: A.elbowR, group: "foreArmR", r: 2.7 },
  ];
  if (demo.view === "anterior") {
    capDefs.push(
      { pt: ANT.kneeL, group: "thighL", r: 3 },
      { pt: ANT.kneeR, group: "thighR", r: 3 }
    );
  }
  const caps = capDefs
    .filter((c) => articulates(pose[c.group]))
    .map((c) => {
      const [x, y] = applyToPoint(c.pt, pose[c.group] ?? []);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${capR(c.r, pose[c.group]).toFixed(2)}" fill="${BODY}"/>`;
    })
    .join("");

  // Ground shadow: breathes with how LOW the body sits — bigger/darker at
  // the bottom of a squat, smaller/lighter at a press lockout or calf-
  // raise top. Depth is e for descend-first lifts, 1−e for lift-first.
  const depth = demo.concentricTo === 0 ? e : 1 - e;
  const shadowRx = 26 + 6 * depth;
  const groundY = demo.groundY ?? (demo.view === "anterior" ? 199 : 222);
  const shadow = `<ellipse cx="50" cy="${groundY}" rx="${shadowRx.toFixed(1)}" ry="2.6" fill="#000" opacity="${(0.16 + 0.1 * depth).toFixed(2)}"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${demo.viewBox ?? (demo.view === "anterior" ? "-8 -14 116 224" : "-12 -14 124 244")}" role="img">` +
    shadow +
    barBehind +
    glow +
    caps +
    polys +
    feet +
    barFront +
    `</svg>`
  );
}

/* ── Side-view renderer ──────────────────────────────────────────
 * The profile body is solid overlapping PIECES (bodySideData.ts), not a
 * facet mosaic: each piece paints as a filled outline with a stage-
 * coloured separation stroke, its tint regions, then its muscle seams —
 * so rotations never open cracks and the seams read exactly like the
 * front/back facet gaps on the dark stage. */
function renderSideDemo(demo: BodyDemo, t: number, effort: number): string {
  const e = easeInOutSine(t);
  const pose = demo.pose(e);
  const tintOpacity = (level: "primary" | "secondary") =>
    level === "primary" ? 0.72 + 0.28 * effort : 0.66 + 0.24 * effort;
  const P = (pts: Pt[]) =>
    pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

  const primaryPts = new Map<string, Pt[]>();
  const body = SIDE_PIECES.map((piece) => {
    const ops = pose[piece.group] ?? [];
    const outline = applyOps(piece.outline as Pt[], ops);
    const facets = piece.facets.map((f) => ({
      level: demo.tint[f.muscle],
      muscle: f.muscle,
      pts: applyOps(f.points as Pt[], ops),
    }));
    for (const f of facets)
      if (f.level === "primary")
        primaryPts.set(f.muscle, [
          ...(primaryPts.get(f.muscle) ?? []),
          ...f.pts,
        ]);
    // Underlay in the stage colour: shows through the facet gaps AS the
    // gaps, and keeps overlapped pieces below fully occluded.
    return (
      `<polygon points="${P(outline)}" fill="${STAGE}"/>` +
      facets
        .map((f) => {
          const fill =
            f.level === "primary"
              ? PRIMARY
              : f.level === "secondary"
                ? SECONDARY
                : piece.far
                  ? BODY_FAR
                  : BODY;
          const op = f.level
            ? ` fill-opacity="${tintOpacity(f.level).toFixed(3)}"`
            : "";
          return `<polygon points="${P(f.pts)}" fill="${fill}"${op}/>`;
        })
        .join("")
    );
  }).join("");

  const glowStrength = 0.35 + 0.65 * effort;
  const glow =
    `<g class="glow">` +
    [...primaryPts.values()]
      .map((pts) => {
        const hull = convexHull(pts);
        return GLOW_RINGS.map(
          ([k, o]) =>
            `<polygon points="${P(scaleAboutCentroid(hull, k))}" fill="${PRIMARY}" opacity="${(o * glowStrength).toFixed(3)}"/>`
        ).join("");
      })
      .join("") +
    `</g>`;

  const depth = demo.concentricTo === 0 ? e : 1 - e;
  const shadow = `<ellipse cx="${demo.shadowCx ?? 50}" cy="${demo.groundY ?? 204}" rx="${((demo.shadowRx ?? 26) + 6 * depth).toFixed(1)}" ry="2.6" fill="#000" opacity="${(0.16 + 0.1 * depth).toFixed(2)}"/>`;
  const scene = demo.scene?.(e, pose) ?? "";

  // Profile barbell: bar runs toward the viewer, so its END shows — the
  // near plate over the grip. Pinned to the wrist, travels with the rep.
  let plate = "";
  const ends = demo.bar?.(e, pose);
  if (ends && demo.equip === "plate-end") {
    const [x, y] = ends[0];
    const r = demo.plateR ?? 10;
    // Collar + protruding bar stub behind the disc: reads as a barbell
    // end, not a floating disc. Proportions scale with the disc.
    plate =
      `<rect x="${(x + r * 0.7).toFixed(1)}" y="${(y - 2.6).toFixed(1)}" width="5" height="5.2" rx="1.4" fill="${GEAR}"/>` +
      `<rect x="${(x + r * 0.7 + 4.4).toFixed(1)}" y="${(y - 1.6).toFixed(1)}" width="4.6" height="3.2" rx="1" fill="${GEAR_DARK}" stroke="#565760" stroke-width="0.6"/>` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${GEAR_DARK}" stroke="#565760" stroke-width="1"/>` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.64).toFixed(1)}" fill="none" stroke="${GEAR}" stroke-width="1.2" opacity="0.7"/>` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.22).toFixed(1)}" fill="${GEAR}"/>`;
  }

  const sceneFront = demo.sceneFront?.(e, pose) ?? "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${demo.viewBox ?? "-8 -14 116 224"}" role="img">` +
    shadow +
    scene +
    glow +
    body +
    plate +
    sceneFront +
    `</svg>`
  );
}
