import { getReleasedFormArtwork } from "./formArtwork";
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
 *  - squats and hinges are SIDE-view demos on a planted-ankle chain
 *    (deadlift 2026-07-27, squat family + calf raise 2026-09-02). The
 *    frontal "vertical compression" stylization they replaced read as
 *    a figure shrinking — depth lives in the sagittal plane, and the
 *    frontal camera cannot see it;
 *  - Held weights follow the HANDS. They were built and removed on
 *    2026-07-03 (product owner) because "the figure has no hands, so a
 *    held prop always read detached" — and that premise was tracked,
 *    not frozen: the profile rig grew a `handL` group and held gear
 *    returned there (deadlift plate, curl bar, pushdown rope); the
 *    anterior/posterior figures got corrected wrist anchors and fists
 *    on 2026-08-17, and the press barbell and lateral-raise dumbbells
 *    followed. A view earns held gear by having a grip to put it in.
 *
 * Props themselves live in `bodyProps.ts` — typed state, one pure
 * resolver, both renderers going through it.
 *
 * Everything is deterministic data → testable, theme-consistent, zero assets.
 */

import { ANTERIOR, POSTERIOR, type BodyPoly } from "./bodyModelData";
import type { RepStart } from "./exerciseTempo";
import { FAR_ARM_SHIFT, SIDE_PIECES, SIDE_ANCHORS } from "./bodySideData";
import {
  GEAR,
  GEAR_DARK,
  GEAR_EDGE,
  GEAR_FAR,
  renderProp,
  type PropLayers,
  type PropState,
} from "./bodyProps";
import { THEME } from "./theme";

/* ── Palette (exactly what the Form view's Model renders) ─────── */

const BODY = "#B6BDC3"; // react-body-highlighter DEFAULT_BODY_COLOR
const PRIMARY = THEME.lifting; // #7B72E9
const SECONDARY = THEME.liftingLight; // #9590E0
/** Seam tone under the PROFILE pieces (owner device review 2026-09-02:
 *  "the black space between the body looks odd").
 *
 *  The profile figure is solid overlapping slabs, so its handful of
 *  facet seams are long unbroken lines. Painted in the stage colour
 *  they read as cracks THROUGH the body onto the background — the
 *  front figure gets away with the same trick only because its mosaic
 *  gaps are short and numerous. A tone between body and stage turns
 *  every seam into a shadowed groove and keeps the silhouette solid,
 *  including the 0.45 inset that now reads as the figure's own dark
 *  edge.
 *
 *  It replaces the stage colour (#111113) the pieces used to paint. The
 *  front/back figures are untouched: their gaps are short and numerous,
 *  the mosaic reads as definition rather than as damage, and that is the
 *  muscle-map language the app already ships. */
const SEAM = "#33363D";
/** Far-side limbs in the profile rig — ~12% darker so overlaps read. */
const BODY_FAR = "#9FA6AC";
/** Tint opacity multiplier on far-side pieces — shadowed, not lit. */
const FAR_TINT = 0.62;

/* ── Measured joint anchors (viewBox 0 0 100 200) ─────────────── */

const ANT = {
  shoulderL: [24, 48] as Pt,
  shoulderR: [76, 48] as Pt,
  elbowL: [20, 71] as Pt,
  elbowR: [80, 71] as Pt,
  /* ON the art's wrist, not beside it. These were [10,100] / [89,100] —
   * ~6.5 units inboard of where the forearm polygons actually end
   * (their terminal edge spans x 0→6.9, centre 3.47, at y 101.2).
   * Nothing had ever been DRAWN at a hand, so nothing exercised the
   * gap; `aimArm` derives its rotation from the rest vector H−E, so an
   * off-art H landed a phantom point on the target while the real wrist
   * went elsewhere — and by a varying amount through a rep, which is
   * why the art slid along bars the anchors held still. Art is
   * symmetric (implied mirror axis 49.80 vs a figure centre of 50). */
  handL: [3.5, 101.2] as Pt,
  handR: [96.1, 101.2] as Pt,
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
  /* Same correction, posterior art: terminal edge centre 3.40 at
   * y 108.5 (mirror axis 50.00 exactly). Was [9,106] / [91,106]. */
  handL: [3.4, 108.5] as Pt,
  handR: [96.6, 108.9] as Pt,
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
const POST_UPPER_LEN = Math.hypot(
  POST.elbowL[0] - POST.shoulderL[0],
  POST.elbowL[1] - POST.shoulderL[1]
);
const POST_FORE_LEN = Math.hypot(
  POST.handL[0] - POST.elbowL[0],
  POST.handL[1] - POST.elbowL[1]
);
const PULLUP_BAR_Y = -12;
const PULLUP_GRIP_L: Pt = [6, PULLUP_BAR_Y];
const PULLUP_GRIP_R: Pt = [94, PULLUP_BAR_Y];

/* Side-view arm segment lengths. */
const SIDE_UPPER_LEN = Math.hypot(
  SIDE_ANCHORS.elbow[0] - SIDE_ANCHORS.shoulder[0],
  SIDE_ANCHORS.elbow[1] - SIDE_ANCHORS.shoulder[1]
);
const SIDE_FORE_LEN = Math.hypot(
  SIDE_ANCHORS.hand[0] - SIDE_ANCHORS.elbow[0],
  SIDE_ANCHORS.hand[1] - SIDE_ANCHORS.elbow[1]
);
/** A straight hanging arm, written ONCE as a fraction of the measured
 *  reach — the 2026-09-02 re-row lengthened the arm ~20%, and every
 *  hard-coded "S[1] + 52" would have left the bar floating a hand's
 *  width below the fist. 0.99 keeps the elbow just off the clamp. */
const STRAIGHT_ARM = 0.99 * (SIDE_UPPER_LEN + SIDE_FORE_LEN);
/** Bench lockout: 99.2% of reach — near-straight, off the clamp. */
const BENCH_LOCKOUT = Math.sqrt(
  (0.992 * (SIDE_UPPER_LEN + SIDE_FORE_LEN)) ** 2 - 4 ** 2
);
/** Bench thigh droop (deg of rotation about the hip) solved so that,
 *  with the shin vertical (shank rotates 90 − this) and the foot flat,
 *  the sole lands ON the 171 floor line: hip screen height + thigh·sinθ
 *  + shank + foot = floor. */
const BENCH_THIGH = (() => {
  const hipScreenY = 100 - (SIDE_ANCHORS.hip[0] - 44) + 0; // after G(−90) about [44,100]
  const thigh = Math.hypot(
    SIDE_ANCHORS.knee[0] - SIDE_ANCHORS.hip[0],
    SIDE_ANCHORS.knee[1] - SIDE_ANCHORS.hip[1]
  );
  const shank = Math.hypot(
    SIDE_ANCHORS.ankle[0] - SIDE_ANCHORS.knee[0],
    SIDE_ANCHORS.ankle[1] - SIDE_ANCHORS.knee[1]
  );
  const FOOT = 9.4; // ankle → sole
  const FLOOR = 171;
  const lean =
    (Math.atan2(
      SIDE_ANCHORS.knee[0] - SIDE_ANCHORS.hip[0],
      SIDE_ANCHORS.knee[1] - SIDE_ANCHORS.hip[1]
    ) *
      180) /
    Math.PI; // the thigh's standing forward lean
  const droop =
    (Math.asin((FLOOR - FOOT - shank - hipScreenY) / thigh) * 180) / Math.PI;
  return droop + lean;
})();

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
/* Push-up plank geometry, DERIVED (2026-09-02 re-row) instead of the
 * hand-tuned constants it replaces — those encoded the old arm length
 * and went stale the moment the skeleton changed. Prone (+90 about
 * [44,100]), the body is a rigid line from the toe to the shoulder; at
 * the top of a push-up the arms are straight (98% reach, leaning ~8°
 * back toward the feet), so the shoulder sits at a known height above
 * the hand plant. That fixes the plank's angle (asin of height over
 * body length), which fixes where the toe rests on the floor and where
 * the hands plant. Nothing here is a free constant. */
const PU_G: Op = { kind: "rotate", deg: 90, pivot: [44, 100] };
const PU_FLOOR = 158.5;
const PU_TOE_STANDING: Pt = [64.2, 199.8]; // front tip of the FOOT facet
const PU_TOE_G = applyToPoint(PU_TOE_STANDING, [PU_G]);
const PU_SH_G = applyToPoint(SIDE_ANCHORS.shoulder, [PU_G]);
const PU_BODY_LEN = Math.hypot(
  PU_SH_G[0] - PU_TOE_G[0],
  PU_SH_G[1] - PU_TOE_G[1]
);
const PU_REACH = 0.98 * (SIDE_UPPER_LEN + SIDE_FORE_LEN);
const PU_ARM_LEAN = (8 * Math.PI) / 180;
const PU_SH_HEIGHT = PU_REACH * Math.cos(PU_ARM_LEAN);
/** Body axis angle after G (toe → shoulder), then the angle it must
 *  have for the shoulder to sit PU_SH_HEIGHT above the plant. */
const PU_AXIS_G =
  (Math.atan2(PU_SH_G[1] - PU_TOE_G[1], PU_SH_G[0] - PU_TOE_G[0]) * 180) /
  Math.PI;
const PU_AXIS_TARGET =
  (-Math.asin(Math.min(1, PU_SH_HEIGHT / PU_BODY_LEN)) * 180) / Math.PI;
const PU_TILT = PU_AXIS_TARGET - PU_AXIS_G;
/** Rotate about the (post-G) toe, then drop the whole plank so that toe
 *  sits on the floor line. */
const PU_SHIFT: Op = { kind: "translate", dx: 0, dy: PU_FLOOR - PU_TOE_G[1] };
const PUSHUP_TOE: Pt = [PU_TOE_G[0], PU_FLOOR];
const PU_SH_TOP = applyToPoint(PU_SH_G, [
  { kind: "rotate", deg: PU_TILT, pivot: PU_TOE_G },
  PU_SHIFT,
]);
const PUSHUP_HAND: Pt = [
  PU_SH_TOP[0] + PU_REACH * Math.sin(PU_ARM_LEAN),
  PU_SH_TOP[1] + PU_SH_HEIGHT,
];

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
/** The inverse of an op list — applying `ops` then `invertOps(ops)` is
 *  the identity — so a WORLD target can be pulled back into a piece's
 *  pre-pose space for `aimArm`. */
function invertOps(ops: Op[]): Op[] {
  return [...ops]
    .reverse()
    .map((op) =>
      op.kind === "translate"
        ? { kind: "translate", dx: -op.dx, dy: -op.dy }
        : op.kind === "rotate"
          ? { kind: "rotate", deg: -op.deg, pivot: op.pivot }
          : op.kind === "scaleY"
            ? { kind: "scaleY", k: 1 / op.k, pivotY: op.pivotY }
            : { kind: "scaleAxis", k: 1 / op.k, deg: op.deg, pivot: op.pivot }
    );
}

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

/* The library figure has no hands either — the arm chain stops at the
 * forearm. That absence was load-bearing: held weights were built and
 * removed on 2026-07-03 BECAUSE "the figure has no hands, so a held
 * prop always read detached", which is why every front/back demo has
 * shown structural equipment only. The profile rig grew a `handL`
 * group and held gear came back there; these close the same gap for
 * the other two cameras (operator approved 2026-08-17).
 *
 * A first attempt shipped and was reverted on sight: it was a
 * symmetric hexagon at a hand anchor that sat ~6.5 units off the end
 * of the arm, so it read as a rock balanced beside the limb. The
 * anchors were fixed first (PR1); this is the shape, rebuilt from the
 * operator's reference photographs of a real fist.
 *
 * Two facets, because the KNUCKLE LINE is what makes a fist read — the
 * feature the dorsal reference leads with. The rig's own gap draws it,
 * the same device the side rig uses to split the upper arm at the
 * biceps/triceps boundary, so it costs no new visual language. And
 * TAPERED: 5.4 units across at the wrist opening to 7.0 at the
 * knuckles, where the hexagon was the same width at both ends.
 *
 * Finger detail was tried and rejected — see the proposal. At ~7 units
 * the features land at or below the facet-gap width, so a scalloped
 * knuckle edge reads as a serrated tear and finger columns read as
 * bristles. A shape this size carries about ONE structural seam
 * legibly; it is spent on the knuckles.
 */
function fistFacets(wrist: Pt, elbow: Pt): Pt[][] {
  const dx = wrist[0] - elbow[0];
  const dy = wrist[1] - elbow[1];
  const len = Math.hypot(dx, dy) || 1;
  const u: Pt = [dx / len, dy / len]; // down the arm
  const q: Pt = [-u[1], u[0]]; // across it
  /* Built on the FOREARM axis, not screen-vertical, so the fist caps
     the limb it belongs to at every arm angle. */
  const P = (along: number, across: number): Pt => [
    wrist[0] + u[0] * along + q[0] * across,
    wrist[1] + u[1] * along + q[1] * across,
  ];
  return [
    // Main mass. Starts just BEHIND the wrist so it overlaps the
    // forearm the way a fist does — invisible, both being BODY grey.
    [P(-1.2, 2.7), P(4.4, 3.5), P(4.4, -3.5), P(-1.2, -2.7)],
    // Knuckle band, rounded off at the far end.
    [P(5.0, 3.5), P(6.6, 2.6), P(7.1, 0.6), P(6.6, -1.6), P(5.0, -3.5)],
  ];
}

const handParts = (wrist: Pt, elbow: Pt, group: GroupName) =>
  fistFacets(wrist, elbow).map((points) => ({ group, points }));

/** Derived from the joint anchors rather than restated, so a future
 *  anchor move carries the fists with it instead of stranding them. */
const ANTERIOR_HANDS: { group: GroupName; points: Pt[] }[] = [
  ...handParts(ANT.handL, ANT.elbowL, "foreArmL"),
  ...handParts(ANT.handR, ANT.elbowR, "foreArmR"),
];
const POSTERIOR_HANDS: { group: GroupName; points: Pt[] }[] = [
  ...handParts(POST.handL, POST.elbowL, "foreArmL"),
  ...handParts(POST.handR, POST.elbowR, "foreArmR"),
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
  /** Where the rep BEGINS. Defaults to "lockout" — the finished
   *  position — which is right for a squat, a bench press or a push-up.
   *  Nine demos start at the stretched end instead (every pull, press,
   *  curl, raise and the calf raise): a deadlift begins with the bar on
   *  the floor, not standing with it at the hips. Not derivable from
   *  `concentricTo`, which only says which end is the finish. */
  startsAt?: RepStart;
  /** A CYCLE: the pose at t=1 is the pose at t=0 and the movement never
   *  runs backwards (a gait, a pedal stroke, a stair step, a jump and
   *  step-down). The player advances t monotonically and wraps instead
   *  of playing the eccentric as the drive reversed. `startsAt` and
   *  `concentricTo` are moot for a cycle. */
  cycle?: true;
  /** Period of one cycle in ms (default `CYCLE_MS_DEFAULT`). */
  cycleMs?: number;
  /** Movements whose envelope exceeds the body's column (e.g. a lateral
   *  raise at full span) declare a wider canvas. */
  viewBox?: string;
  /** Group transforms as a function of eased progress e ∈ [0,1]. */
  pose: (e: number) => Partial<Record<GroupName, Op[]>>;
  /** STRUCTURAL equipment only (no held weights — the figure has no
   *  hands): a fixed-bar is the overhead bar the body hangs from
   *  (pull-up); a cable-bar is the machine bar + cable (pulldown). */
  equip?:
    | "fixed-bar"
    | "cable-bar"
    | "dip-bars"
    | "plate-end"
    | "rope"
    | "barbell"
    | "back-barbell"
    | "dumbbell"
    | "goblet-bell"
    | "cable-handle"
    | "kettlebell"
    | "landmine"
    | "lever-handle"
    | "frontal-cables"
    | "frontal-levers";
  /** plate-end disc radius (default 10). The deadlift draws a
   *  full-size 45 (r=26 ≈ 45 cm on a 175 cm figure) so the bottom
   *  frame reads bar-near-the-floor. */
  plateR?: number;
  /** Which side the profile barbell's sleeve tip protrudes. Default 1
   *  (forward), which is right wherever the bar hangs in front of the
   *  body; -1 where it sits BEHIND (a back squat), so the stub cannot
   *  cross the face. */
  sleeveDir?: -1 | 1;
  /** `rope` / `cable-handle`: the pulley anchor, fixed at the station. The
   *  cable is solved from it to the grip every frame, so the gear is
   *  never positioned independently of the body. */
  pulley?: Pt;
  /** `landmine` / `lever-handle`: the fixed pivot the bar or lever arm
   *  swings about — a floor sleeve, a machine's hinge. */
  pivot?: Pt;
  /** `frontal-cables` / `frontal-levers`: the two anchors (pulleys or
   *  lever hinges) a front-on pair of cables or levers runs from. */
  pivots?: [Pt, Pt];
  bar?: (_e: number, pose: Partial<Record<GroupName, Op[]>>) => [Pt, Pt] | null;
  /** Free scene furniture (a bench, a floor line) drawn behind the
   *  body — raw SVG in GEAR colours. Side-view demos use this. */
  scene?: (e: number, pose: Partial<Record<GroupName, Op[]>>) => string;
  /** Ground line override (hanging demos float above a lower floor). */
  groundY?: number;
  /** Shadow centre override (lying scenes aren't centred on x=50). */
  shadowCx?: number;
  /** Shadow radius override (a lying body casts a long shadow). */
  shadowRx?: number;
}

const lerp = (a: number, b: number, e: number) => a + (b - a) * e;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Smoothstep — used to stagger joints inside one rep without velocity
 *  kinks at the hand-over points. */
const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

/**
 * Overhead-press bar path — ONE definition, read both by the pose (which
 * solves the arms onto it) and by `bar` (which declares where the bar
 * is). Two copies would be precisely the mirrored-constant drift this
 * codebase keeps paying for.
 *
 * `PRESS_GRIP` is the offset outside each shoulder, so `2×GRIP + 52` is
 * the bar width. It was 14 — an 80-unit span on a 52-unit shoulder
 * width, 1.54× biacromial, where the exercise's own instruction is
 * "grip just outside your shoulders" and every reference locks out with
 * the arms close beside the ears.
 *
 * 14 also put the top of the path OUT OF REACH: hypot(14, 53) = 54.82
 * against a 54.02-unit arm. `solveElbow` clamps at 0.999 of extension
 * rather than failing, so the frame still rendered — with the hand
 * ~0.85 short of the bar it was supposed to be holding, and the
 * divergence-scaled joint caps covering an impossible target instead of
 * an ordinary seam. The ceiling is hypot(GRIP, 53) ≤ 54.02, i.e.
 * GRIP ≤ 10.45; widen the grip and the lockout must come down with it.
 * The "hands stay ON the declared bar path" test pins exactly that.
 */
const PRESS_GRIP = 10;

/**
 * Acromion elevation at lockout.
 *
 * The shoulder used to be PINNED: the point travelled 0.00 across a
 * 55°→166° humerus swing. What the rig modelled was the deltoid CAP
 * tilting at 40% of the humerus angle, so the scapula's ROTATION was
 * stylised and its ELEVATION was absent — the shrug at the top of a
 * press simply did not happen.
 *
 * Scapulohumeral rhythm is ~2:1 and the acromion rises ~3 cm at full
 * overhead reach. The figure is 200 units for ~175 cm, so 1 unit ≈
 * 0.875 cm and ~57° of scapular rotation buys ~3.2 units.
 */
const PRESS_RISE = 3.2;
const pressShoulderRise = (e: number) => -PRESS_RISE * e;

/* Lockout height. The shoulder rising and the arm getting longer BOTH
 * feed this one number, which is why they had to land together: with
 * the girdle up 3.2 and the corrected forearm at 34.41 (was 30.68), the
 * old -5 left the elbow 43° short of straight. -10.9 puts the hand
 * 98% of the way out — and it is physically the same statement, since
 * shoulders that shrug finish the bar higher. */
const pressBarPath = (e: number): [Pt, Pt] => {
  const y = lerp(32, -10.9, e); // chin-height rack → overhead lockout
  return [
    [ANT.shoulderL[0] - PRESS_GRIP, y],
    [ANT.shoulderR[0] + PRESS_GRIP, y],
  ];
};

/* ── Side-view squat chain (2026-09-02 evaluation rebuild) ──────
 * ONE copy shared by the back squat and the goblet squat (the July
 * one-copy rule kept — the load and the arms differ, the squat does
 * not). Built ankle-up like the deadlift so the feet stay planted: the
 * shin tilts about the planted ankle (≤10° — the foot is part of the
 * shank piece, so more visibly lifts the heel), the thigh rotates about
 * the MOVED knee down to just above parallel, and the torso hinges
 * about the MOVED hip. Knees forward, hips back and down, torso
 * inclined — the entire shape of a squat, none of which a frontal
 * orthographic projection can show (the anterior version scaleY-
 * compressed the thighs and read as a figure shrinking: the 2026-09-02
 * evaluation's worst grade). `hingeDeg` is the bottom-frame torso
 * incline: a back squat leans further than a goblet, whose front load
 * keeps the torso upright. */
/** How much of the torso's hinge the PELVIS takes. The pelvis piece used
 *  to be welded to the torso, so at the bottom of a hinge it swung the
 *  full angle while the thigh rotated the other way — and the glute
 *  wedge lifted clear of the thigh ("the glutes pop out", owner review
 *  2026-09-02). A real pelvis tilts less than the trunk; the lumbar
 *  spine absorbs the rest. 0.6 keeps the glute seated on the thigh at
 *  every hinge depth; the torso/pelvis overlap at the lumbar joint
 *  (y 86-94 in bodySideData) hides the differential. */
const PELVIS_FOLLOW = 0.6;
/** How much of a hinge the HEAD keeps out of. Welded to the torso, the
 *  head stared at the floor at the bottom of every hinge; a lifter
 *  extends the neck so the gaze stays forward-down. The head
 *  counter-rotates about the neck by this fraction of the hinge. */
const HEAD_LIFT = 0.4;

/* The strict curl's pose, shared by the barbell and dumbbell curls: the
 * flexion arc lives in-plane, the elbow pins to the side (3 degrees of
 * drift, per instruction 2), nothing else moves. */
function strictCurlPose(e: number): Partial<Record<GroupName, Op[]>> {
  const curl = lerp(0, 135, e);
  const drift = lerp(0, 3, e);
  const armDrift: Op[] = [
    { kind: "rotate", deg: -drift, pivot: SIDE_ANCHORS.shoulder },
  ];
  const fore: Op[] = [
    { kind: "rotate", deg: -curl, pivot: SIDE_ANCHORS.elbow },
    ...armDrift,
  ];
  return {
    upperArmL: armDrift,
    foreArmL: fore,
    handL: fore,
    upperArmR: armDrift,
    foreArmR: fore,
    handR: fore,
  };
}

/* One leg, planted: two-bone IK from a MOVING hip to a FIXED ankle —
 * the same solve the arms use. Rotations pivot on the rest anchors and
 * a body translate lands the rest hip on `hipWorld`, so the returned ops
 * fully place the piece. `pick` chooses the knee branch: forward for a
 * lunge's front leg, low for its back leg, high for a bent knee with the
 * foot flat on the floor (bridge, incline seat). */
function plantedLeg(
  hipWorld: Pt,
  ankleWorld: Pt,
  pick: (a: Pt, b: Pt) => Pt
): { thigh: Op[]; shank: Op[] } {
  const hip0 = SIDE_ANCHORS.hip;
  const thighLen = Math.hypot(
    SIDE_ANCHORS.knee[0] - hip0[0],
    SIDE_ANCHORS.knee[1] - hip0[1]
  );
  const shankLen = Math.hypot(
    SIDE_ANCHORS.ankle[0] - SIDE_ANCHORS.knee[0],
    SIDE_ANCHORS.ankle[1] - SIDE_ANCHORS.knee[1]
  );
  const dx = hipWorld[0] - hip0[0];
  const dy = hipWorld[1] - hip0[1];
  const body: Op = { kind: "translate", dx, dy };
  const A: Pt = [ankleWorld[0] - dx, ankleWorld[1] - dy];
  const K = pick(
    solveElbow(hip0, A, thighLen, shankLen, 1),
    solveElbow(hip0, A, thighLen, shankLen, -1)
  );
  const restThigh: Pt = [
    SIDE_ANCHORS.knee[0] - hip0[0],
    SIDE_ANCHORS.knee[1] - hip0[1],
  ];
  const restShank: Pt = [
    SIDE_ANCHORS.ankle[0] - SIDE_ANCHORS.knee[0],
    SIDE_ANCHORS.ankle[1] - SIDE_ANCHORS.knee[1],
  ];
  const th = angleBetween(restThigh, [K[0] - hip0[0], K[1] - hip0[1]]);
  const sh = angleBetween(restShank, [A[0] - K[0], A[1] - K[1]]) - th;
  return {
    thigh: [{ kind: "rotate", deg: th, pivot: hip0 }, body],
    shank: [
      { kind: "rotate", deg: sh, pivot: SIDE_ANCHORS.knee },
      { kind: "rotate", deg: th, pivot: hip0 },
      body,
    ],
  };
}
const KNEE_FORWARD = (a: Pt, b: Pt): Pt => (a[0] > b[0] ? a : b);
const KNEE_LOW = (a: Pt, b: Pt): Pt => (a[1] > b[1] ? a : b);
const KNEE_HIGH = (a: Pt, b: Pt): Pt => (a[1] < b[1] ? a : b);

/* Split-stance (lunge) chain. The near leg is the FRONT leg, the far
 * leg the BACK leg — which is what the far-leg pieces exist for.
 *
 * Both feet are PLANTED and the hips move: that is what a lunge is, and
 * it is the constraint the first draft got wrong (it rotated the front
 * thigh and let the foot slide forward 33 units through the rep). Each
 * leg is `plantedLeg`, front knee on the forward branch and back knee on
 * the low one, so the back knee travels toward the floor as the hips
 * drop. The Bulgarian split squat is the same chain with the back ankle
 * raised onto a bench. */
const LUNGE_FRONT_ANKLE: Pt = [84, 196];
const LUNGE_BACK_ANKLE: Pt = [2, 196];
function lungeChain(
  e: number,
  backAnkle: Pt = LUNGE_BACK_ANKLE
): {
  body: Op[];
  frontThigh: Op[];
  frontShank: Op[];
  backThigh: Op[];
  backShank: Op[];
} {
  const hip: Pt = [lerp(42, 47, e), lerp(112, 141, e)];
  const body: Op[] = [
    {
      kind: "translate",
      dx: hip[0] - SIDE_ANCHORS.hip[0],
      dy: hip[1] - SIDE_ANCHORS.hip[1],
    },
  ];
  const front = plantedLeg(hip, LUNGE_FRONT_ANKLE, KNEE_FORWARD);
  const back = plantedLeg(hip, backAnkle, KNEE_LOW);
  return {
    body,
    frontThigh: front.thigh,
    frontShank: front.shank,
    backThigh: back.thigh,
    backShank: back.shank,
  };
}

/* Supine hip hinge — glute bridge (shoulders on the floor) and hip
 * thrust (upper back on a bench). Lying head-left like the bench chain,
 * the torso+pelvis rotate about the SHOULDER to lift the hips, and each
 * leg is planted-foot IK from the rising hip to its fixed ankle, knee
 * on the high branch. The head stays down (a quarter of the lift, so
 * the neck does not separate). */
function supineHinge(
  e: number,
  shoulderY: number,
  fromDeg: number,
  toDeg: number
): {
  torso: Op[];
  head: Op[];
  hipWorld: Pt;
  leg: { thigh: Op[]; shank: Op[] };
  ankle: Pt;
} {
  const G: Op = { kind: "rotate", deg: -90, pivot: [44, 100] };
  const sG = applyToPoint(SIDE_ANCHORS.shoulder, [G]);
  const T0: Op = { kind: "translate", dx: 0, dy: shoulderY - sG[1] };
  const Sw: Pt = [sG[0], shoulderY];
  // Positive = hips DOWN (clockwise about the shoulder, head-left).
  const deg = lerp(fromDeg, toDeg, e);
  const lift: Op = { kind: "rotate", deg, pivot: Sw };
  const torso: Op[] = [G, T0, lift];
  const head: Op[] = [G, T0, { kind: "rotate", deg: deg * 0.25, pivot: Sw }];
  const hipWorld = applyToPoint(SIDE_ANCHORS.hip, torso);
  const hipTop = applyToPoint(SIDE_ANCHORS.hip, [
    G,
    T0,
    { kind: "rotate", deg: toDeg, pivot: Sw },
  ]);
  // Feet well forward of the hips (a foot and a half), so the shin
  // stands vertical at the top and the thigh angles up to it; closer in
  // and both legs fold straight up like a crunch.
  const ankle: Pt = [hipTop[0] + 42, SUPINE_FLOOR - 6];
  const leg = plantedLeg(hipWorld, ankle, KNEE_HIGH);
  return { torso, head, hipWorld, leg, ankle };
}
const SUPINE_FLOOR = 172;

/* Incline press — the bench chain at 30 degrees. Torso rotated -60
 * (head up-left), hips on a seat, feet flat on the floor with the knees
 * on the high branch, and the bar pressed PERPENDICULAR to the trunk
 * from the upper chest to lockout. Shared by the barbell and dumbbell
 * versions. */
function inclinePressPose(e: number): Partial<Record<GroupName, Op[]>> {
  return benchAnglePose(e, -60, INCLINE_SEAT_Y, [-3, -8], "planted");
}
/* Decline press — the same chain tipped the other way: trunk rotated
 * -115 (head DOWN 19.5 degrees, feet up), the legs hooked over the high
 * end of the bench with the shins hanging under the rollers, and the
 * bar pressed perpendicular to the trunk from the LOWER chest — which,
 * with the trunk declined, is "up and slightly back" (instruction 4).
 * Shared by the barbell and dumbbell versions. */
function declinePressPose(e: number): Partial<Record<GroupName, Op[]>> {
  return benchAnglePose(e, DECLINE_DEG, DECLINE_HIP_Y, [8, 2], "hooked");
}
const DECLINE_DEG = -115;
const DECLINE_HIP_Y = 118;
/* One angled-bench press. `gDeg` rotates the lying body about [44,100]
 * (-90 = flat, head-left; -60 = 30-degree incline; -115 = decline),
 * `hipY` parks the hip, `chestY` is the bar's body-space y offset from
 * the shoulder at [bottom, lockout] (negative = toward the head, the
 * upper chest; positive = toward the hip, the lower chest). Legs are
 * either planted-foot IK to the floor (incline seat) or hooked over
 * the bench end with the shins hanging (decline rollers). */
function benchAnglePose(
  e: number,
  gDeg: number,
  hipY: number,
  chestY: [number, number],
  legs: "planted" | "hooked"
): Partial<Record<GroupName, Op[]>> {
  const G: Op = { kind: "rotate", deg: gDeg, pivot: [44, 100] };
  const hipG = applyToPoint(SIDE_ANCHORS.hip, [G]);
  const T0: Op = { kind: "translate", dx: 0, dy: hipY - hipG[1] };
  const body: Op[] = [G, T0];
  const S = SIDE_ANCHORS.shoulder;
  // Body-space bar path: perpendicular to the trunk (+x), from the
  // chest to lockout over the shoulder line.
  const H: Pt = [
    S[0] + lerp(30, BENCH_LOCKOUT, e),
    S[1] + lerp(chestY[0], chestY[1], e),
  ];
  const arm = aimArm(
    { S, E: SIDE_ANCHORS.elbow, H: SIDE_ANCHORS.hand },
    solveElbow(S, H, SIDE_UPPER_LEN, SIDE_FORE_LEN, -1),
    H,
    0
  );
  const hipWorld = applyToPoint(SIDE_ANCHORS.hip, body);
  const leg =
    legs === "planted"
      ? plantedLeg(hipWorld, [hipWorld[0] + 36, SUPINE_FLOOR - 6], KNEE_HIGH)
      : {
          // Thigh along the bench (rest hang, rotated with the body),
          // shin folded 90 under the roller.
          thigh: body,
          shank: [
            { kind: "rotate" as const, deg: 90, pivot: SIDE_ANCHORS.knee },
            ...body,
          ],
        };
  return {
    head: body,
    torso: body,
    pelvis: body,
    thighL: leg.thigh,
    thighR: leg.thigh,
    shankL: leg.shank,
    shankR: leg.shank,
    upperArmL: [...arm.upper, ...body],
    foreArmL: [...arm.fore, ...body],
    handL: [...arm.fore, ...body],
    upperArmR: [...arm.upper, ...body],
    foreArmR: [...arm.fore, ...body],
    handR: [...arm.fore, ...body],
  };
}
/* Seat 52 above the floor: at 24 the legs had nowhere to go but folded
   up past the hip. A real incline bench seats at roughly knee height. */
const INCLINE_SEAT_Y = 120;
const inclineScene = (): string => {
  // Seat, the inclined back pad along the trunk, a post, and the floor.
  return (
    `<rect x="-6" y="${INCLINE_SEAT_Y + 4}" width="40" height="6" rx="2.2" fill="${GEAR}"/>` +
    `<rect x="-74" y="${INCLINE_SEAT_Y - 8}" width="78" height="7" rx="2.5" fill="${GEAR}" transform="rotate(-30 4 ${INCLINE_SEAT_Y - 5})"/>` +
    `<line x1="10" y1="${INCLINE_SEAT_Y + 10}" x2="10" y2="${SUPINE_FLOOR - 1}" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
    `<line x1="-40" y1="${INCLINE_SEAT_Y + 20}" x2="-40" y2="${SUPINE_FLOOR - 1}" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
    `<line x1="-70" y1="${SUPINE_FLOOR}" x2="118" y2="${SUPINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
  );
};

/* Seated machine chain — the hips parked on a seat, thigh forward along
 * it, shank swinging about the knee. `thighDeg` is the thigh's rotation
 * from hanging (about -85 lays it along a seat), `shankRel` the shank's
 * rotation RELATIVE to the thigh (0 = straight leg, +90 = hanging
 * vertical off the seat edge). `lean` reclines the trunk against a
 * backrest (negative = back). The body translate lands the rest hip on
 * `seat`, so the hips never leave it — which is the one thing every
 * seated-machine instruction insists on ("keep your hips pressed into
 * the seat"). Arms hold the side handles beside the seat. */
function seatedChain(
  seat: Pt,
  thighDeg: number,
  shankRel: number,
  lean: number
): {
  body: Op[];
  torso: Op[];
  head: Op[];
  thigh: Op[];
  shank: Op[];
  arm: { upper: Op[]; fore: Op[] };
} {
  const body: Op[] = [
    {
      kind: "translate",
      dx: seat[0] - SIDE_ANCHORS.hip[0],
      dy: seat[1] - SIDE_ANCHORS.hip[1],
    },
  ];
  const torso: Op[] = [
    { kind: "rotate", deg: lean, pivot: SIDE_ANCHORS.hip },
    ...body,
  ];
  // The head stays level against the recline.
  const head: Op[] = [
    { kind: "rotate", deg: -lean, pivot: SIDE_ANCHORS.neck },
    ...torso,
  ];
  const thigh: Op[] = [
    { kind: "rotate", deg: thighDeg, pivot: SIDE_ANCHORS.hip },
    ...body,
  ];
  const shank: Op[] = [
    { kind: "rotate", deg: shankRel, pivot: SIDE_ANCHORS.knee },
    ...thigh,
  ];
  // Hands on the side handles at the seat edge: the arm hangs a touch
  // forward with a bent elbow.
  const upper: Op[] = [
    { kind: "rotate", deg: -6, pivot: SIDE_ANCHORS.shoulder },
    ...torso,
  ];
  const fore: Op[] = [
    { kind: "rotate", deg: -28, pivot: SIDE_ANCHORS.elbow },
    ...upper,
  ];
  return { body, torso, head, thigh, shank, arm: { upper, fore } };
}
/** Machine seat height: the hip 138 down, which leaves a hanging shank's
 *  foot ~10 clear of the floor — a leg-extension seat, not a chair. */
const MACHINE_SEAT: Pt = [44, 138];
const MACHINE_FLOOR = 204;
/** Row bench: lower than the machine seat, so the legs stretch forward
 *  to a footplate at floor level rather than hanging. */
const ROW_SEAT: Pt = [44, 142];
/** A plain bench (preacher, concentration curl): low enough that a
 *  hanging shank puts the foot flat on the floor. */
const PREACHER_SEAT: Pt = [44, 144];
/** Preacher pad: the upper arm rests 45 degrees forward of hanging. */
const PREACHER_PAD_DEG = -45;
const INCLINE_CURL_SEAT: Pt = [44, 140];
const AB_WHEEL_R = 7;
const SWING_HINGE = 74;
/** Zercher: torso upright — 26 against the back squat's 43. */
const ZERCHER_HINGE = 26;
/** Prone: the hip sits its own front depth above the floor. */
const PRONE_HIP_Y = SUPINE_FLOOR - 20;
/** Seat block + reclined backrest + post + floor, for the seated
 *  machines. The lever arm and pads are per-demo (they follow the shank). */
function machineSeatScene(seat: Pt, lean: number): string {
  return (
    `<rect x="${(seat[0] - 26).toFixed(1)}" y="${(seat[1] + 6).toFixed(1)}" width="62" height="8" rx="2.6" fill="${GEAR}"/>` +
    `<rect x="${(seat[0] - 20).toFixed(1)}" y="${(seat[1] - 78).toFixed(1)}" width="8" height="86" rx="2.6" fill="${GEAR}" transform="rotate(${lean} ${(seat[0] - 12).toFixed(1)} ${(seat[1] + 4).toFixed(1)})"/>` +
    `<line x1="${(seat[0] + 4).toFixed(1)}" y1="${(seat[1] + 14).toFixed(1)}" x2="${(seat[0] + 4).toFixed(1)}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
    `<line x1="-26" y1="${MACHINE_FLOOR + 1}" x2="140" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
  );
}
/** A roller pad on the shank: `side` +1 puts it on the FRONT of the
 *  shin (leg extension), -1 on the calf (leg curl). Drawn with the
 *  machine's lever from the knee. */
function shankPad(
  pose: Partial<Record<GroupName, Op[]>>,
  side: 1 | -1
): string {
  const k = applyToPoint(SIDE_ANCHORS.knee, pose.shankL ?? []);
  const a = applyToPoint(SIDE_ANCHORS.ankle, pose.shankL ?? []);
  const len = Math.hypot(a[0] - k[0], a[1] - k[1]) || 1;
  const ux = (a[0] - k[0]) / len;
  const uy = (a[1] - k[1]) / len;
  // Perpendicular that points to the FRONT of the shin for any swing.
  const px = uy * side;
  const py = -ux * side;
  const c: Pt = [a[0] - ux * 5 + px * 6.4, a[1] - uy * 5 + py * 6.4];
  return (
    `<line x1="${k[0].toFixed(1)}" y1="${k[1].toFixed(1)}" x2="${c[0].toFixed(1)}" y2="${c[1].toFixed(1)}" stroke="${GEAR_DARK}" stroke-width="3.2"/>` +
    `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="5.2" fill="${GEAR}" stroke="${GEAR_EDGE}" stroke-width="0.8"/>`
  );
}

/* Standing cable demos share a station: a post at the pulley's x from
 * the top of the frame to the floor, and the floor. */
function cableStationScene(postX: number, top: number): string {
  return (
    `<line x1="${postX}" y1="${top}" x2="${postX}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
    `<line x1="-26" y1="${MACHINE_FLOOR + 1}" x2="140" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
  );
}

const declineScene = (
  _e: number,
  pose: Partial<Record<GroupName, Op[]>>
): string => {
  // The pad runs the trunk-and-thigh line from below the head to the
  // knee; rollers hold the ankles at the high end; posts to the floor.
  const hip = applyToPoint(SIDE_ANCHORS.hip, pose.pelvis ?? []);
  const knee = applyToPoint(SIDE_ANCHORS.knee, pose.thighL ?? []);
  const ankle = applyToPoint(SIDE_ANCHORS.ankle, pose.shankL ?? []);
  const tilt = 180 + DECLINE_DEG + 90; // pad angle, degrees (head down-left)
  return (
    `<rect x="${(hip[0] - 88).toFixed(1)}" y="${(hip[1] + 10).toFixed(1)}" width="142" height="7" rx="2.5" fill="${GEAR}" transform="rotate(${-tilt} ${hip[0].toFixed(1)} ${(hip[1] + 13).toFixed(1)})"/>` +
    `<circle cx="${(ankle[0] + 7).toFixed(1)}" cy="${(ankle[1] - 3).toFixed(1)}" r="5" fill="${GEAR}" stroke="${GEAR_EDGE}" stroke-width="0.8"/>` +
    `<line x1="${(knee[0] + 4).toFixed(1)}" y1="${(knee[1] + 8).toFixed(1)}" x2="${(knee[0] + 4).toFixed(1)}" y2="${SUPINE_FLOOR - 1}" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
    `<line x1="${(hip[0] - 50).toFixed(1)}" y1="${(hip[1] + 28).toFixed(1)}" x2="${(hip[0] - 50).toFixed(1)}" y2="${SUPINE_FLOOR - 1}" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
    `<line x1="-70" y1="${SUPINE_FLOOR}" x2="150" y2="${SUPINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
  );
};

/* Sled chains — the leg press and the hack squat are the same machine
 * seen two ways: a 45-degree track, a reclined trunk, and a leg that
 * closes from near-straight to deep. On the LEG PRESS the body is fixed
 * on the seat and the platform slides away; on the HACK SQUAT the feet
 * are fixed on the platform and the body slides down the pad. Both are
 * `plantedLeg` between a hip and an ankle, one of which moves. */
const SLED_DIR: Pt = [Math.cos(Math.PI / 4), -Math.sin(Math.PI / 4)]; // up-forward
const LEG_PRESS_HIP: Pt = [40, 150];
/** Reach along the track at [lockout, bottom]: the platform sits at
 *  one leg length minus a soft knee at the top, and "thighs near your
 *  ribs" at the bottom. */
const LEG_PRESS_REACH: [number, number] = [90, 50];
function legPressChain(e: number): {
  body: Op[];
  torso: Op[];
  head: Op[];
  leg: { thigh: Op[]; shank: Op[] };
  ankle: Pt;
} {
  const chain = seatedChain(LEG_PRESS_HIP, 0, 0, -50);
  const reach = lerp(LEG_PRESS_REACH[0], LEG_PRESS_REACH[1], e);
  const ankle: Pt = [
    LEG_PRESS_HIP[0] + SLED_DIR[0] * reach,
    LEG_PRESS_HIP[1] + SLED_DIR[1] * reach,
  ];
  const leg = plantedLeg(LEG_PRESS_HIP, ankle, KNEE_HIGH);
  return { body: chain.body, torso: chain.torso, head: chain.head, leg, ankle };
}
const HACK_ANKLE: Pt = [86, 194];
/** Hip path down the pad at [top, bottom]. */
const HACK_HIP: [Pt, Pt] = [
  [37, 115],
  [58, 142],
];
function hackSquatChain(e: number): {
  body: Op[];
  torso: Op[];
  head: Op[];
  leg: { thigh: Op[]; shank: Op[] };
  hip: Pt;
} {
  const hip: Pt = [
    lerp(HACK_HIP[0][0], HACK_HIP[1][0], e),
    lerp(HACK_HIP[0][1], HACK_HIP[1][1], e),
  ];
  const chain = seatedChain(hip, 0, 0, -45);
  const leg = plantedLeg(hip, HACK_ANKLE, KNEE_FORWARD);
  return { body: chain.body, torso: chain.torso, head: chain.head, leg, hip };
}

/** The rack pull is the deadlift's hinge stopped early: the bar starts
 *  "just below your knees" on the pins. Same construction (`hingeLift`),
 *  shallower full-depth angles — a modest knee bend so the shoulders
 *  stay over the bar and the bar stays at the shin, which the deadlift's
 *  own mid-rep does not do (its knees trail its hinge). The bar height
 *  at the bottom is pinned just under the knee. */
const RACK_HINGE = 62;
const RACK_THIGH = -38;
const RACK_SHIN = 5;
function rackPullPose(e: number): Partial<Record<GroupName, Op[]>> {
  return hingeLift(e, e, RACK_HINGE, RACK_THIGH, RACK_SHIN, lerp(8, -14, e));
}

/* Lying flat on the back — the bridge's body placement with no lift:
 * head-left, back on the floor. Returns the body ops and the world hip
 * so a demo can add its own curl or leg action on top. */
function supineFlat(): { body: Op[]; hip: Pt; shoulder: Pt } {
  const c = supineHinge(0, SUPINE_FLOOR - 9, 0, 0);
  const body = c.torso.slice(0, 2);
  return {
    body,
    hip: applyToPoint(SIDE_ANCHORS.hip, body),
    shoulder: applyToPoint(SIDE_ANCHORS.shoulder, body),
  };
}
/** A crunch bends the trunk, not the hip: the shoulders lift while the
 *  lower back stays down. The rigid torso piece approximates that by
 *  pivoting about a point part-way up the trunk from the hip. */
const CRUNCH_PIVOT_UP = 18;
function crunchOps(body: Op[], hip: Pt, shoulder: Pt, deg: number): Op[] {
  const len = Math.hypot(shoulder[0] - hip[0], shoulder[1] - hip[1]);
  const pivot: Pt = [
    hip[0] + ((shoulder[0] - hip[0]) / len) * CRUNCH_PIVOT_UP,
    hip[1] + ((shoulder[1] - hip[1]) / len) * CRUNCH_PIVOT_UP,
  ];
  return [...body, { kind: "rotate", deg, pivot }];
}
/** Hands behind the head: the rest arm aimed (in its own frame) so the
 *  hand lands at the back of the skull, elbow forward. */
const BACK_OF_HEAD: Pt = [40, 12];
function handsBehindHead(): { upper: Op[]; fore: Op[] } {
  const S = SIDE_ANCHORS.shoulder;
  const a = solveElbow(S, BACK_OF_HEAD, SIDE_UPPER_LEN, SIDE_FORE_LEN, 1);
  const b = solveElbow(S, BACK_OF_HEAD, SIDE_UPPER_LEN, SIDE_FORE_LEN, -1);
  const E = a[0] > b[0] ? a : b; // elbow forward of the face
  return aimArm(
    { S, E: SIDE_ANCHORS.elbow, H: SIDE_ANCHORS.hand },
    E,
    BACK_OF_HEAD,
    0
  );
}
const ARMS_CROSSED = { upper: -22, fore: -138 } as const;

/* Kneeling — the shins flat on the floor pointing back, thighs up from
 * the knee. The body is translated so the knee sits a shin's thickness
 * off the floor; everything else hangs off the standing anchors. */
const KNEEL_KNEE: Pt = [50, 192];
function kneelingBase(): { body: Op[]; shank: Op[]; knee: Pt } {
  const body: Op[] = [
    {
      kind: "translate",
      dx: KNEEL_KNEE[0] - SIDE_ANCHORS.knee[0],
      dy: KNEEL_KNEE[1] - SIDE_ANCHORS.knee[1],
    },
  ];
  const shank: Op[] = [
    { kind: "rotate", deg: 90, pivot: SIDE_ANCHORS.knee },
    ...body,
  ];
  return { body, shank, knee: KNEEL_KNEE };
}
const kneelScene = (extra = ""): string =>
  extra +
  `<line x1="-26" y1="${MACHINE_FLOOR + 1}" x2="150" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`;

/* Hanging from a bar overhead, side-on: arms straight up to the bar, the
 * whole body translated down so the hands meet it. */
const HANG_BAR_Y = 10;
function hangingBase(): { body: Op[]; arm: Op[]; hand: Pt } {
  const S = SIDE_ANCHORS.shoulder;
  const reach = STRAIGHT_ARM;
  // Hands directly above the shoulder at the bar.
  const dy = HANG_BAR_Y - (S[1] - reach);
  const body: Op[] = [{ kind: "translate", dx: 0, dy }];
  const arm: Op[] = [
    { kind: "rotate", deg: 180, pivot: SIDE_ANCHORS.shoulder },
    ...body,
  ];
  return { body, arm, hand: [S[0], HANG_BAR_Y] };
}

/* Rigid straight body about the planted heel (inverted row): the
 * standing figure rotated about its ankle to `degAboveFloor` and
 * translated so the ankle lands on `ankle`. "One straight line from
 * heels to head" is literally the standing figure tilted. */
function rigidLean(degAboveFloor: number, ankle: Pt): Op[] {
  return [
    { kind: "rotate", deg: -(90 - degAboveFloor), pivot: SIDE_ANCHORS.ankle },
    {
      kind: "translate",
      dx: ankle[0] - SIDE_ANCHORS.ankle[0],
      dy: ankle[1] - SIDE_ANCHORS.ankle[1],
    },
  ];
}
const INV_ROW_ANKLE: Pt = [122, 196];
/** Body angle above the floor at [stretch, top]. */
const INV_ROW_LEAN: [number, number] = [31, 49];
/** Where the bar sits: just off the chest at the TOP position. */
function invertedRowBar(): Pt {
  const top = rigidLean(INV_ROW_LEAN[1], INV_ROW_ANKLE);
  const S = applyToPoint(SIDE_ANCHORS.shoulder, top);
  const chest = applyToPoint(
    [SIDE_ANCHORS.shoulder[0] + 14, SIDE_ANCHORS.shoulder[1] + 6],
    top
  );
  return [
    chest[0] + (chest[0] - S[0]) * 0.3,
    chest[1] + (chest[1] - S[1]) * 0.3,
  ];
}
/** Aim the rest arm at a WORLD hand target for a body already placed by
 *  `bodyOps`; `pick` chooses the elbow branch in world space. */
function armToWorld(
  bodyOps: Op[],
  target: Pt,
  pick: (a: Pt, b: Pt) => Pt
): { upper: Op[]; fore: Op[] } {
  const hPre = applyToPoint(target, invertOps(bodyOps));
  const S = SIDE_ANCHORS.shoulder;
  const a = solveElbow(S, hPre, SIDE_UPPER_LEN, SIDE_FORE_LEN, 1);
  const b = solveElbow(S, hPre, SIDE_UPPER_LEN, SIDE_FORE_LEN, -1);
  const aW = applyToPoint(a, bodyOps);
  const bW = applyToPoint(b, bodyOps);
  const E = pick(aW, bW) === aW ? a : b;
  const arm = aimArm(
    { S, E: SIDE_ANCHORS.elbow, H: SIDE_ANCHORS.hand },
    E,
    hPre,
    0
  );
  return {
    upper: [...arm.upper, ...bodyOps],
    fore: [...arm.fore, ...bodyOps],
  };
}
const ELBOW_LOW = (a: Pt, b: Pt): Pt => (a[1] > b[1] ? a : b);
const ELBOW_BACK = (a: Pt, b: Pt): Pt => (a[0] < b[0] ? a : b);

const DIP_BENCH_HAND: Pt = [24, 148];
const DIP_BENCH_ANKLE: Pt = [112, 196];

/* Kneeling with the thigh and trunk rigid about the knee (Nordic curl,
 * glute-ham raise): `tilt` degrees forward of vertical, arms crossed. */
function kneelHingeChain(
  knee: Pt,
  tilt: number
): { body: Op[]; thigh: Op[]; shank: Op[]; upper: Op[]; fore: Op[] } {
  const body: Op[] = [
    {
      kind: "translate",
      dx: knee[0] - SIDE_ANCHORS.knee[0],
      dy: knee[1] - SIDE_ANCHORS.knee[1],
    },
  ];
  const shank: Op[] = [
    { kind: "rotate", deg: 90, pivot: SIDE_ANCHORS.knee },
    ...body,
  ];
  const thigh: Op[] = [
    { kind: "rotate", deg: tilt, pivot: SIDE_ANCHORS.knee },
    ...body,
  ];
  const upper: Op[] = [
    { kind: "rotate", deg: ARMS_CROSSED.upper, pivot: SIDE_ANCHORS.shoulder },
    ...thigh,
  ];
  const fore: Op[] = [
    { kind: "rotate", deg: ARMS_CROSSED.fore, pivot: SIDE_ANCHORS.elbow },
    ...upper,
  ];
  return { body, thigh, shank, upper, fore };
}
const GHD_KNEE: Pt = [60, 150];
const SISSY_RAIL: Pt = [88, 90];

/* Rigid straight body leaning FORWARD about the planted heel (a chest-
 * supported row's incline): the mirror of `rigidLean`. */
function rigidLeanForward(degAboveFloor: number, ankle: Pt): Op[] {
  return [
    { kind: "rotate", deg: 90 - degAboveFloor, pivot: SIDE_ANCHORS.ankle },
    {
      kind: "translate",
      dx: ankle[0] - SIDE_ANCHORS.ankle[0],
      dy: ankle[1] - SIDE_ANCHORS.ankle[1],
    },
  ];
}
const CSR_ANKLE: Pt = [26, 196];
const CSR_LEAN = 48;

/* The standing calf raise's rise — shin about the ball of the foot,
 * everything above carried by the knee's displacement — as a reusable
 * pair, so the single-leg and donkey variants share the pivot. */
function calfRise(e: number): { legOps: Op[]; rise: Op[] } {
  const pitch = lerp(-8, 15, e);
  const legOps: Op[] = [{ kind: "rotate", deg: pitch, pivot: CALF_BALL }];
  const kneeNew = applyToPoint(SIDE_ANCHORS.knee, legOps);
  const rise: Op[] = [
    {
      kind: "translate",
      dx: kneeNew[0] - SIDE_ANCHORS.knee[0],
      dy: kneeNew[1] - SIDE_ANCHORS.knee[1],
    },
  ];
  return { legOps, rise };
}
const CALF_RAIL: Pt = [74, 92];
const DONKEY_RAIL: Pt = [128, 100];

const STEP_BOX_TOP = 149;
const STEP_FRONT_ANKLE: Pt = [84, STEP_BOX_TOP - 5];
const STEP_BACK_ANKLE_FLOOR: Pt = [30, 196];
const STEP_BACK_ANKLE_BOX: Pt = [70, STEP_BOX_TOP - 5];

const PISTOL_FAR_LEG = -86;

/** Front-rack hand (thruster, front squat catch), in TORSO space: just
 *  ahead of the shoulder, elbows high. */
const FRONT_RACK: Pt = [
  SIDE_ANCHORS.shoulder[0] + 9,
  SIDE_ANCHORS.shoulder[1] - 1,
];
const OVERHEAD: Pt = [
  SIDE_ANCHORS.shoulder[0] + 2,
  SIDE_ANCHORS.shoulder[1] - 0.996 * (SIDE_UPPER_LEN + SIDE_FORE_LEN),
];

/* Standing with a slight forward hinge and a staggered stance — the
 * cable station's "stagger your stance and lean slightly forward"
 * (overhead cable extension, Bayesian curl): the whole body leans about
 * the planted heel by `hipsBack`, the trunk hinges `deg` at the hip, the
 * near leg steps a little forward and the far leg a little back. */
function staggeredStance(deg: number): {
  torso: Op[];
  head: Op[];
  pelvis: Op[];
  nearLeg: Op[];
  farLeg: Op[];
} {
  const LEAN = hipsBack(deg);
  const torso: Op[] = [{ kind: "rotate", deg, pivot: SIDE_ANCHORS.hip }, LEAN];
  const head: Op[] = [
    { kind: "rotate", deg: -deg * HEAD_LIFT, pivot: SIDE_ANCHORS.neck },
    ...torso,
  ];
  const pelvis: Op[] = [
    { kind: "rotate", deg: deg * PELVIS_FOLLOW, pivot: SIDE_ANCHORS.hip },
    LEAN,
  ];
  const nearLeg: Op[] = [
    { kind: "rotate", deg: -7, pivot: SIDE_ANCHORS.hip },
    LEAN,
  ];
  const farLeg: Op[] = [
    { kind: "rotate", deg: 12, pivot: SIDE_ANCHORS.hip },
    LEAN,
  ];
  return { torso, head, pelvis, nearLeg, farLeg };
}
/** The high-pulley pushdown's forearm arc (folded at the chest →
 *  lockout at the thigh), elbow pinned at the side. Shared by the rope,
 *  straight-bar and single-handle versions — the grip is what differs,
 *  and the grip is the prop's business. */
function pushdownFore(e: number): Op[] {
  const flex = lerp(120, 10, e);
  return [{ kind: "rotate", deg: -flex, pivot: SIDE_ANCHORS.elbow }];
}
const HIGH_PULLEY: Pt = [72, -10];
const LOW_PULLEY_BEHIND: Pt = [-22, 190];
const KICKBACK_PULLEY: Pt = [112, 190];
const PULLDOWN_SEAT: Pt = [44, 142];
const PULLDOWN_PULLEY: Pt = [84, -14];

/** The flat bench — pad, legs, floor — drawn behind the body. Shared by
 *  the bench press and the JM press. */
const flatBenchScene = (): string =>
  `<rect x="-64" y="109" width="136" height="7" rx="2.5" fill="${GEAR}"/>` +
  `<line x1="-50" y1="116" x2="-50" y2="170" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
  `<line x1="56" y1="116" x2="56" y2="170" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
  `<line x1="-58" y1="171" x2="118" y2="171" stroke="${GEAR_DARK}" stroke-width="1.6"/>`;

/* Place the trunk between a WORLD hip and a WORLD shoulder: rotate the
 * rest trunk about the rest hip onto the hip→shoulder direction, then
 * translate the hip. The pieces the trunk carries (head, arms) append
 * these ops. Used wherever the body is a link in a solved chain (pike
 * push-up). */
function trunkBetween(hipWorld: Pt, shoulderWorld: Pt): Op[] {
  const rest: Pt = [
    SIDE_ANCHORS.shoulder[0] - SIDE_ANCHORS.hip[0],
    SIDE_ANCHORS.shoulder[1] - SIDE_ANCHORS.hip[1],
  ];
  const deg = angleBetween(rest, [
    shoulderWorld[0] - hipWorld[0],
    shoulderWorld[1] - hipWorld[1],
  ]);
  return [
    { kind: "rotate", deg, pivot: SIDE_ANCHORS.hip },
    {
      kind: "translate",
      dx: hipWorld[0] - SIDE_ANCHORS.hip[0],
      dy: hipWorld[1] - SIDE_ANCHORS.hip[1],
    },
  ];
}
const TRUNK_LEN = Math.hypot(
  SIDE_ANCHORS.shoulder[0] - SIDE_ANCHORS.hip[0],
  SIDE_ANCHORS.shoulder[1] - SIDE_ANCHORS.hip[1]
);
const LEG_LEN =
  Math.hypot(
    SIDE_ANCHORS.knee[0] - SIDE_ANCHORS.hip[0],
    SIDE_ANCHORS.knee[1] - SIDE_ANCHORS.hip[1]
  ) +
  Math.hypot(
    SIDE_ANCHORS.ankle[0] - SIDE_ANCHORS.knee[0],
    SIDE_ANCHORS.ankle[1] - SIDE_ANCHORS.knee[1]
  );
/** Skull top above the shoulder, along the trunk (for "head to the
 *  floor" pins and placements). */
const HEAD_ABOVE_SHOULDER = 38;

const PIKE_ANKLE: Pt = [12, 196];
const PIKE_HAND: Pt = [94, 200];
const HSPU_HAND: Pt = [50, 200];
const HSPU_WALL_X = 64;
const LANDMINE_PIVOT: Pt = [150, 200];
const LANDMINE_SQUAT_PIVOT: Pt = [156, 200];
const CHEST_PRESS_PIVOT: Pt = [122, 64];
const SHOULDER_PRESS_PIVOT: Pt = [124, 26];
const DRAGON_BENCH_Y = 150;
const ELBOW_HIGH = (a: Pt, b: Pt): Pt => (a[1] < b[1] ? a : b);
const ELBOW_FRONT = (a: Pt, b: Pt): Pt => (a[0] > b[0] ? a : b);

/* Forearm plank set-up — the shoulder fixed over the elbow on the
 * floor, the feet extending back as the hips lift from a sag into one
 * line. The hip is the apex of a leg-and-trunk pair between the fixed
 * shoulder and the (sliding) ankle, low branch, so it sags when the
 * feet are in and lies on the line when they are out. */
const PLANK_SHOULDER: Pt = [86, 164];
/** Body line above the floor at the hold. */
const PLANK_LINE_DEG = 11;
/** How far the feet start in (the sag) before extending back. */
const PLANK_FEET_IN = 3;
function plankPose(e: number): Partial<Record<GroupName, Op[]>> {
  const S = PLANK_SHOULDER;
  const total = (LEG_LEN + TRUNK_LEN) * 0.998;
  const rad = (PLANK_LINE_DEG * Math.PI) / 180;
  const A1: Pt = [S[0] - total * Math.cos(rad), S[1] + total * Math.sin(rad)];
  const A: Pt = [lerp(A1[0] + PLANK_FEET_IN, A1[0], e), A1[1]];
  const hip = ELBOW_LOW(
    solveElbow(A, S, LEG_LEN, TRUNK_LEN, 1),
    solveElbow(A, S, LEG_LEN, TRUNK_LEN, -1)
  );
  const torso = trunkBetween(hip, S);
  const leg = plantedLeg(hip, A, KNEE_LOW);
  // Forearm flat on the floor ahead of the elbow, elbow under the shoulder.
  const arm = armToWorld(torso, [S[0] + 30, MACHINE_FLOOR - 2], ELBOW_LOW);
  return {
    head: torso,
    torso,
    pelvis: torso,
    thighL: leg.thigh,
    thighR: leg.thigh,
    shankL: leg.shank,
    shankR: leg.shank,
    upperArmL: arm.upper,
    foreArmL: arm.fore,
    handL: arm.fore,
    upperArmR: arm.upper,
    foreArmR: arm.fore,
    handR: arm.fore,
  };
}

const LSIT_HIP: Pt = [44, 178];
const LSIT_HAND: Pt = [55.5, 188];

/** The muscle-up's shoulder path: a straight-arm hang, up to the bar
 *  (chest at it, shoulder just below and behind), over it, to one
 *  straight arm ABOVE it. Hands never leave the bar. */
const MUSCLE_UP_BAR: Pt = [50, 10];
function muscleUpShoulder(e: number): Pt {
  const B = MUSCLE_UP_BAR;
  const hang: Pt = [B[0] - 4, B[1] + STRAIGHT_ARM];
  const atBar: Pt = [B[0] - 10, B[1] + 10];
  const over: Pt = [B[0] + 4, B[1] - 12];
  const top: Pt = [B[0] - 2, B[1] - STRAIGHT_ARM];
  if (e < 0.5) {
    const k = smooth(e * 2);
    return [lerp(hang[0], atBar[0], k), lerp(hang[1], atBar[1], k)];
  }
  if (e < 0.65) {
    const k = (e - 0.5) / 0.15;
    return [lerp(atBar[0], over[0], k), lerp(atBar[1], over[1], k)];
  }
  const k = smooth((e - 0.65) / 0.35);
  return [lerp(over[0], top[0], k), lerp(over[1], top[1], k)];
}

/* ── Batch 13 helpers: the high plank, the rower, the side plank ── */

/** High plank: the standing figure leaned forward about its heels onto
 *  straight arms, hands on the floor under the shoulders. */
const HIGH_PLANK_ANKLE: Pt = [-36, 196];
const HIGH_PLANK_DEG = 19;
const MC_HIP_LIFT = 8;
const MC_FAR_ANKLE: Pt = [HIGH_PLANK_ANKLE[0] + 3, HIGH_PLANK_ANKLE[1]];
function highPlankBase(): { body: Op[]; shoulder: Pt; hand: Pt } {
  const body = rigidLeanForward(HIGH_PLANK_DEG, HIGH_PLANK_ANKLE);
  const S = applyToPoint(SIDE_ANCHORS.shoulder, body);
  return { body, shoulder: S, hand: [S[0] + 2, MACHINE_FLOOR - 2] };
}

/** Rowing machine geometry: the footplate, the seat rail height. */
const ROWER_ANKLE: Pt = [128, 178];
const ROWER_SEAT_Y = 150;
/** Hip x at [catch, finish] along the rail. */
/** The finish keeps the hip within a leg's reach of the plate (a soft
 *  knee at the finish, never a locked one — and a planted foot). */
const ROWER_HIP_X: [number, number] = [78, 38];
const ROWER_PULLEY: Pt = [172, 122];
const SKI_ERG_PULLEY: Pt = [118, -40];
const BATTLE_ANCHOR: Pt = [156, 196];
const JUMP_ROPE_R = 53;
const JUMP_HOP = 8;

/* Anterior figure laid on its SIDE (a side plank): the front faces the
 * viewer, the head to the right, the floor below. The trunk is placed
 * between a world pelvis centre and a world neck base, the stacked
 * legs between the pelvis and a world ankle, so a sag at the hip and
 * the straight line are the same construction. */
const ANT_PELVIS: Pt = [50, 96];
const ANT_NECK: Pt = [50, 48];
const ANT_ANKLE_MID: Pt = [50, 196];
const ANT_TRUNK_LEN = ANT_PELVIS[1] - ANT_NECK[1];
const ANT_LEG_LEN = ANT_ANKLE_MID[1] - ANT_PELVIS[1];
function antSidePlank(e: number): Partial<Record<GroupName, Op[]>> {
  // The supporting shoulder sits half a shoulder-width below the body's
  // axis once the figure is on its side; its elbow rests on the floor
  // one upper arm below it. So the AXIS passes that much higher.
  const S: Pt = [
    88,
    MACHINE_FLOOR - 4 - ANT_UPPER_LEN - (ANT.shoulderR[0] - ANT_NECK[0]),
  ];
  const total = (ANT_TRUNK_LEN + ANT_LEG_LEN) * 0.998;
  const rad = Math.asin((MACHINE_FLOOR - 22 - S[1]) / total);
  // Feet on the floor to the left, extending a touch as the hips lift.
  const A1: Pt = [S[0] - total * Math.cos(rad), MACHINE_FLOOR - 22];
  const A: Pt = [lerp(A1[0] + 3, A1[0], e), A1[1]];
  const hip = ELBOW_LOW(
    solveElbow(A, S, ANT_LEG_LEN, ANT_TRUNK_LEN, 1),
    solveElbow(A, S, ANT_LEG_LEN, ANT_TRUNK_LEN, -1)
  );
  // Trunk: rest axis pelvis→neck points UP; rotate it onto hip→S.
  const trunkDeg = angleBetween([0, -1], [S[0] - hip[0], S[1] - hip[1]]);
  const trunk: Op[] = [
    { kind: "rotate", deg: trunkDeg, pivot: ANT_PELVIS },
    {
      kind: "translate",
      dx: hip[0] - ANT_PELVIS[0],
      dy: hip[1] - ANT_PELVIS[1],
    },
  ];
  // Legs: rest axis pelvis→ankle points DOWN; rotate onto hip→A.
  const legDeg = angleBetween([0, 1], [A[0] - hip[0], A[1] - hip[1]]);
  const legs: Op[] = [
    { kind: "rotate", deg: legDeg, pivot: ANT_PELVIS },
    {
      kind: "translate",
      dx: hip[0] - ANT_PELVIS[0],
      dy: hip[1] - ANT_PELVIS[1],
    },
  ];
  // The trunk turns `trunkDeg`; the figure's screen-right side ("R")
  // ends on the floor side. That arm supports: upper arm straight DOWN
  // to the elbow on the floor, forearm flat along the floor toward the
  // head. Aim in the arm's own frame by pulling the world directions
  // back through the trunk's turn. The top ("L") arm lies along the
  // body. Both legs stack: the far leg is translated onto the near one.
  const pre = (d: Pt): Pt =>
    applyToPoint(d, [{ kind: "rotate", deg: -trunkDeg, pivot: [0, 0] }]);
  const armDown = angleBetween(
    [ANT.elbowR[0] - ANT.shoulderR[0], ANT.elbowR[1] - ANT.shoulderR[1]],
    pre([0, 1])
  );
  const foreFlat =
    angleBetween(
      [ANT.handR[0] - ANT.elbowR[0], ANT.handR[1] - ANT.elbowR[1]],
      pre([1, 0])
    ) - armDown;
  const upperR: Op[] = [
    { kind: "rotate", deg: armDown, pivot: ANT.shoulderR },
    ...trunk,
  ];
  const foreR: Op[] = [
    { kind: "rotate", deg: foreFlat, pivot: ANT.elbowR },
    { kind: "rotate", deg: armDown, pivot: ANT.shoulderR },
    ...trunk,
  ];
  // Stack onto the floor-side ("R") leg, so the pair rests on the floor.
  const stack: Op = {
    kind: "translate",
    dx: ANT.kneeR[0] - ANT.kneeL[0],
    dy: 0,
  };
  return {
    head: trunk,
    torso: trunk,
    upperArmL: trunk,
    foreArmL: trunk,
    upperArmR: upperR,
    foreArmR: foreR,
    thighL: [stack, ...legs],
    thighR: legs,
    shankL: [stack, ...legs],
    shankR: legs,
  };
}

/* ── Batch 14: the burpee — a keyframed chain ──
 * Six positions on one e: squat with the hands down, high plank, chest
 * to the floor, plank, squat, jump. Each keyframe is a world hip, a
 * trunk angle, a world ankle and a world hand; the trunk is placed by
 * `trunkBetween`, the legs by `plantedLeg`, the arms by `armToWorld`,
 * and the frames interpolate. The two-way player reverses it into the
 * same sequence in the other order — a burpee's own second rep. */
interface BurpeeKey {
  e: number;
  hip: Pt;
  /** Trunk angle, degrees, screen convention (−90 = upright). */
  trunk: number;
  ankle: Pt;
  hand: Pt;
}
const BURPEE_HAND: Pt = [111, MACHINE_FLOOR - 2];
const BURPEE_KEYS: BurpeeKey[] = (() => {
  const plankAnkle = HIGH_PLANK_ANKLE;
  const plank = highPlankBase();
  const plankHip = applyToPoint(SIDE_ANCHORS.hip, plank.body);
  const plankTrunk =
    (Math.atan2(
      plank.shoulder[1] - plankHip[1],
      plank.shoulder[0] - plankHip[0]
    ) *
      180) /
    Math.PI;
  // Push-up bottom: the same rigid line lowered about the heels until
  // the shoulder sits a bent arm above the hands.
  const lowDeg = Math.asin(
    (plankAnkle[1] - (MACHINE_FLOOR - 2 - 39)) / (LEG_LEN + TRUNK_LEN)
  );
  const lowHip: Pt = [
    plankAnkle[0] + LEG_LEN * Math.cos(lowDeg),
    plankAnkle[1] - LEG_LEN * Math.sin(lowDeg),
  ];
  const squat: BurpeeKey = {
    e: 0,
    hip: [49.5, 160],
    trunk: -20,
    ankle: [60, 196],
    hand: BURPEE_HAND,
  };
  const plankKey: BurpeeKey = {
    e: 0.3,
    hip: plankHip,
    trunk: plankTrunk,
    ankle: plankAnkle,
    hand: BURPEE_HAND,
  };
  return [
    squat,
    plankKey,
    {
      e: 0.5,
      hip: lowHip,
      trunk: (-lowDeg * 180) / Math.PI,
      ankle: plankAnkle,
      hand: BURPEE_HAND,
    },
    { ...plankKey, e: 0.7 },
    { ...squat, e: 0.85 },
    {
      e: 1,
      hip: [42, 86],
      trunk: -90 + 5.4,
      ankle: [46.6, 183],
      hand: [50, -34],
    },
  ];
})();
function burpeePose(e: number): Partial<Record<GroupName, Op[]>> {
  const keys = BURPEE_KEYS;
  let i = 0;
  while (i < keys.length - 2 && e > keys[i + 1].e) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const k = smooth((e - a.e) / (b.e - a.e));
  const hip: Pt = [lerp(a.hip[0], b.hip[0], k), lerp(a.hip[1], b.hip[1], k)];
  const trunk = lerp(a.trunk, b.trunk, k);
  const ankle: Pt = [
    lerp(a.ankle[0], b.ankle[0], k),
    lerp(a.ankle[1], b.ankle[1], k),
  ];
  const hand: Pt = [
    lerp(a.hand[0], b.hand[0], k),
    lerp(a.hand[1], b.hand[1], k),
  ];
  const rad = (trunk * Math.PI) / 180;
  const S: Pt = [
    hip[0] + TRUNK_LEN * Math.cos(rad),
    hip[1] + TRUNK_LEN * Math.sin(rad),
  ];
  const torso = trunkBetween(hip, S);
  // The high branch: forward in the crouch, and above the hip-ankle
  // line while the feet travel — the forward branch dipped the knee
  // through the floor mid-kick.
  const leg = plantedLeg(hip, ankle, KNEE_HIGH);
  const arm = armToWorld(torso, hand, ELBOW_BACK);
  return {
    head: torso,
    torso,
    pelvis: torso,
    thighL: leg.thigh,
    thighR: leg.thigh,
    shankL: leg.shank,
    shankR: leg.shank,
    upperArmL: arm.upper,
    foreArmL: arm.fore,
    handL: arm.fore,
    upperArmR: arm.upper,
    foreArmR: arm.fore,
    handR: arm.fore,
  };
}

/* ── Gait (batch 15) — a stride cycle on a treadmill belt ──
 * The figure stays put and the belt moves under it, which is exactly
 * what a treadmill is and what a walking demo in a fixed frame needs.
 * Each ankle rides a closed path: stance (φ 0→0.5) slides straight back
 * along the belt, swing (0.5→1) lifts and comes forward. The far leg is
 * the near leg half a cycle later. Legs are `plantedLeg` from the
 * (bobbing) hip to each ankle; the arms counter-swing. */
const GAIT_STRIDE = 20;
const GAIT_LIFT = 11;
const GAIT_BELT_Y = 193;
const GAIT_CX = 48;
const GAIT_HIP_Y = 100;
function gaitAnkle(phi: number, cx: number, beltY: number): Pt {
  const p = ((phi % 1) + 1) % 1;
  if (p < 0.5) {
    const k = p / 0.5;
    return [cx + GAIT_STRIDE * (1 - 2 * k), beltY];
  }
  const k = (p - 0.5) / 0.5;
  return [
    cx + GAIT_STRIDE * (-1 + 2 * k),
    beltY - GAIT_LIFT * Math.sin(Math.PI * k),
  ];
}
interface GaitOpts {
  /** Trunk lean forward, degrees. */
  lean?: number;
  /** Arm swing amplitude about the shoulder (0 = arms still). */
  armSwing?: number;
  /** Elbow bend held through the swing. */
  elbow?: number;
  /** World hand targets instead of a swing (hands on a sled, a rail). */
  hands?: Pt;
  beltY?: number;
  /** Tilt the BELT (the ankle paths) about a pivot — an incline. The
   *  body stays upright; the legs reach the tilted belt. */
  beltTilt?: { deg: number; pivot: Pt };
}
function gaitChain(
  phi: number,
  opts: GaitOpts = {}
): Partial<Record<GroupName, Op[]>> & { hip: Pt; near: Pt; far: Pt } {
  const beltY = opts.beltY ?? GAIT_BELT_Y;
  const lean = opts.lean ?? 0;
  // The hips ride highest at mid-stance, lowest at the step-over.
  const bob = 1.2 * (0.5 - 0.5 * Math.cos(4 * Math.PI * phi));
  const hip: Pt = [GAIT_CX - 6, GAIT_HIP_Y + bob];
  const tilt: Op[] = opts.beltTilt
    ? [{ kind: "rotate", deg: opts.beltTilt.deg, pivot: opts.beltTilt.pivot }]
    : [];
  const near = applyToPoint(gaitAnkle(phi, GAIT_CX, beltY), tilt);
  const far = applyToPoint(gaitAnkle(phi + 0.5, GAIT_CX, beltY), tilt);
  const body: Op[] = [
    {
      kind: "translate",
      dx: hip[0] - SIDE_ANCHORS.hip[0],
      dy: hip[1] - SIDE_ANCHORS.hip[1],
    },
  ];
  const torso: Op[] = [
    { kind: "rotate", deg: lean, pivot: SIDE_ANCHORS.hip },
    ...body,
  ];
  const head: Op[] = [
    { kind: "rotate", deg: -lean * HEAD_LIFT, pivot: SIDE_ANCHORS.neck },
    ...torso,
  ];
  const pelvis: Op[] = [
    { kind: "rotate", deg: lean * PELVIS_FOLLOW, pivot: SIDE_ANCHORS.hip },
    ...body,
  ];
  const nearLeg = plantedLeg(hip, near, KNEE_FORWARD);
  const farLeg = plantedLeg(hip, far, KNEE_FORWARD);
  let arms: Partial<Record<GroupName, Op[]>>;
  if (opts.hands) {
    const a = armToWorld(torso, opts.hands, ELBOW_LOW);
    arms = {
      upperArmL: a.upper,
      foreArmL: a.fore,
      handL: a.fore,
      upperArmR: a.upper,
      foreArmR: a.fore,
      handR: a.fore,
    };
  } else {
    const A = opts.armSwing ?? 24;
    const E = opts.elbow ?? 0;
    // The near arm swings against the near leg: back when the near foot
    // is forward (φ = 0).
    const nearUp: Op[] = [
      {
        kind: "rotate",
        deg: A * Math.cos(2 * Math.PI * phi),
        pivot: SIDE_ANCHORS.shoulder,
      },
      ...torso,
    ];
    const farUp: Op[] = [
      {
        kind: "rotate",
        deg: -A * Math.cos(2 * Math.PI * phi),
        pivot: SIDE_ANCHORS.shoulder,
      },
      ...torso,
    ];
    const bend: Op = { kind: "rotate", deg: -E, pivot: SIDE_ANCHORS.elbow };
    arms = {
      upperArmL: nearUp,
      foreArmL: [bend, ...nearUp],
      handL: [bend, ...nearUp],
      upperArmR: farUp,
      foreArmR: [bend, ...farUp],
      handR: [bend, ...farUp],
    };
  }
  return {
    head,
    torso,
    pelvis,
    thighL: nearLeg.thigh,
    shankL: nearLeg.shank,
    thighR: farLeg.thigh,
    shankR: farLeg.shank,
    ...arms,
    hip,
    near,
    far,
  };
}
/** Strip the chain's bookkeeping fields into a plain pose. */
function gaitPose(
  c: ReturnType<typeof gaitChain>
): Partial<Record<GroupName, Op[]>> {
  const { hip: _h, near: _n, far: _f, ...pose } = c;
  return pose;
}
const treadmillScene = (): string =>
  `<rect x="6" y="${GAIT_BELT_Y + 3}" width="96" height="7" rx="3" fill="${GEAR}"/>` +
  `<line x1="112" y1="${GAIT_BELT_Y + 6}" x2="112" y2="86" stroke="${GEAR_DARK}" stroke-width="4"/>` +
  `<line x1="112" y1="88" x2="86" y2="98" stroke="${GEAR_DARK}" stroke-width="3"/>` +
  `<rect x="104" y="72" width="18" height="10" rx="2" fill="${GEAR_DARK}"/>` +
  `<line x1="-12" y1="${MACHINE_FLOOR + 1}" x2="140" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`;
/** Incline grade as an angle: 12% ≈ 7 degrees. */
const INCLINE_WALK_DEG = 7;
const INCLINE_PIVOT: Pt = [GAIT_CX, GAIT_BELT_Y];
const SLED_HANDLE: Pt = [112, 118];
const STAIR_RAIL: Pt = [74, 96];
const STAIR_STEP = 12;
/** Stairmaster ankle: the stance foot rides DOWN with its step, the
 *  swing foot lifts up and over onto the next one. */
function stairAnkle(phi: number): Pt {
  const p = ((phi % 1) + 1) % 1;
  const x = GAIT_CX + 4;
  if (p < 0.5) {
    const k = p / 0.5;
    return [x + 6 - 12 * k, GAIT_BELT_Y - STAIR_STEP + STAIR_STEP * k];
  }
  const k = (p - 0.5) / 0.5;
  return [
    x - 6 + 12 * k,
    GAIT_BELT_Y - STAIR_STEP * k - (STAIR_STEP + 4) * Math.sin(Math.PI * k),
  ];
}
const BOX_TOP = 150;
const BOX_X: [number, number] = [82, 138];
/** Box-jump keyframes: stand, dip with the arms back, flight, land on
 *  the box, stand tall on it, step down backwards, stand — a cycle. */
interface JumpKey {
  e: number;
  hip: Pt;
  trunk: number;
  ankleL: Pt;
  ankleR: Pt;
  /** World hand target. */
  hand: Pt;
}
const STAND_TRUNK = -90 + 5.4;
const BOX_KEYS: JumpKey[] = [
  {
    e: 0,
    hip: [42, 96],
    trunk: STAND_TRUNK,
    ankleL: [46.6, 193],
    ankleR: [46.6, 193],
    hand: [50.3, 105],
  },
  {
    e: 0.18,
    hip: [34, 120],
    trunk: -62,
    ankleL: [46.6, 193],
    ankleR: [46.6, 193],
    hand: [10, 128],
  },
  {
    e: 0.34,
    hip: [76, 66],
    trunk: -84,
    ankleL: [86, 140],
    ankleR: [86, 140],
    hand: [110, 30],
  },
  {
    e: 0.5,
    hip: [102, 116],
    trunk: -66,
    ankleL: [110, BOX_TOP - 3],
    ankleR: [110, BOX_TOP - 3],
    hand: [136, 112],
  },
  {
    e: 0.64,
    hip: [104, 50],
    trunk: STAND_TRUNK,
    ankleL: [110, BOX_TOP - 3],
    ankleR: [110, BOX_TOP - 3],
    hand: [112, 60],
  },
  {
    e: 0.82,
    hip: [76, 112],
    trunk: -78,
    ankleL: [54, 193],
    ankleR: [110, BOX_TOP - 3],
    hand: [86, 120],
  },
  {
    e: 1,
    hip: [42, 96],
    trunk: STAND_TRUNK,
    ankleL: [46.6, 193],
    ankleR: [46.6, 193],
    hand: [50.3, 105],
  },
];
function boxJumpPose(e: number): Partial<Record<GroupName, Op[]>> {
  const keys = BOX_KEYS;
  let i = 0;
  while (i < keys.length - 2 && e > keys[i + 1].e) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const k = smooth((e - a.e) / (b.e - a.e));
  const L = (p: Pt, q: Pt): Pt => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  const hip = L(a.hip, b.hip);
  const trunk = lerp(a.trunk, b.trunk, k);
  const rad = (trunk * Math.PI) / 180;
  const S: Pt = [
    hip[0] + TRUNK_LEN * Math.cos(rad),
    hip[1] + TRUNK_LEN * Math.sin(rad),
  ];
  const torso = trunkBetween(hip, S);
  const legL = plantedLeg(hip, L(a.ankleL, b.ankleL), KNEE_FORWARD);
  const legR = plantedLeg(hip, L(a.ankleR, b.ankleR), KNEE_FORWARD);
  const arm = armToWorld(torso, L(a.hand, b.hand), ELBOW_BACK);
  return {
    head: torso,
    torso,
    pelvis: torso,
    thighL: legL.thigh,
    shankL: legL.shank,
    thighR: legR.thigh,
    shankR: legR.shank,
    upperArmL: arm.upper,
    foreArmL: arm.fore,
    handL: arm.fore,
    upperArmR: arm.upper,
    foreArmR: arm.fore,
    handR: arm.fore,
  };
}

/* ── Pedal chain (batch 16) — a crank stroke ──
 * Seated (or standing, for the elliptical) with the feet on pedals that
 * ride a closed path about a crank: a circle for the bikes, a flat
 * ellipse for the elliptical. The far foot is half a turn behind. Legs
 * are `plantedLeg` from the fixed hip to each pedal, knee forward. The
 * trunk leans to the bars; the hands hold them, or ride moving handles
 * (assault bike, elliptical) that push and pull against the pedals. */
const CRANK: Pt = [66, 178];
const CRANK_R = 15;
const BIKE_HIP: Pt = [36, 106];
const BIKE_BARS: Pt = [104, 104];
const SPIN_HIP: Pt = [34, 104];
const SPIN_BARS: Pt = [106, 112];
const ASSAULT_HIP: Pt = [36, 106];
const ASSAULT_HANDLE_PIVOT: Pt = [100, 178];
const ELLIPTICAL_HIP: Pt = [42, 92];
const ELLIPTICAL_CRANK: Pt = [60, 180];
const ELLIPTICAL_HANDLE_PIVOT: Pt = [98, 168];
/** Pedal position at phase φ on a circle (ry = rx) or a flat ellipse;
 *  φ = 0 is the pedal at its FRONT, turning down and back — the drive. */
function pedalAt(phi: number, c: Pt, rx: number, ry: number): Pt {
  const a = 2 * Math.PI * phi;
  return [c[0] + rx * Math.cos(a), c[1] + ry * Math.sin(a)];
}
interface PedalOpts {
  hip: Pt;
  lean: number;
  crank: Pt;
  rx: number;
  ry: number;
  /** Fixed bars, or a moving handle (its world point at this phase). */
  hands: Pt;
}
function pedalChain(
  phi: number,
  o: PedalOpts
): Partial<Record<GroupName, Op[]>> {
  const body: Op[] = [
    {
      kind: "translate",
      dx: o.hip[0] - SIDE_ANCHORS.hip[0],
      dy: o.hip[1] - SIDE_ANCHORS.hip[1],
    },
  ];
  const torso: Op[] = [
    { kind: "rotate", deg: o.lean, pivot: SIDE_ANCHORS.hip },
    ...body,
  ];
  const head: Op[] = [
    { kind: "rotate", deg: -o.lean * HEAD_LIFT, pivot: SIDE_ANCHORS.neck },
    ...torso,
  ];
  const near = plantedLeg(
    o.hip,
    pedalAt(phi, o.crank, o.rx, o.ry),
    KNEE_FORWARD
  );
  const far = plantedLeg(
    o.hip,
    pedalAt(phi + 0.5, o.crank, o.rx, o.ry),
    KNEE_FORWARD
  );
  const arm = armToWorld(torso, o.hands, ELBOW_LOW);
  return {
    head,
    torso,
    pelvis: body,
    thighL: near.thigh,
    shankL: near.shank,
    thighR: far.thigh,
    shankR: far.shank,
    upperArmL: arm.upper,
    foreArmL: arm.fore,
    handL: arm.fore,
    upperArmR: arm.upper,
    foreArmR: arm.fore,
    handR: arm.fore,
  };
}
/** A bike's frame: the crank wheel, a down tube to the saddle, the seat
 *  post + saddle under the hip, the head tube to the bars. */
function bikeScene(
  hip: Pt,
  bars: Pt,
  crank: Pt,
  r: number,
  wheel = true
): string {
  return (
    (wheel
      ? `<circle cx="${crank[0]}" cy="${crank[1]}" r="${r + 5}" fill="none" stroke="${GEAR_DARK}" stroke-width="3"/>`
      : "") +
    `<circle cx="${crank[0]}" cy="${crank[1]}" r="3" fill="${GEAR_DARK}" stroke="${GEAR_EDGE}" stroke-width="0.8"/>` +
    `<line x1="${crank[0]}" y1="${crank[1]}" x2="${hip[0] + 2}" y2="${hip[1] + 8}" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
    `<rect x="${hip[0] - 12}" y="${hip[1] + 6}" width="26" height="6" rx="3" fill="${GEAR}"/>` +
    `<line x1="${crank[0]}" y1="${crank[1]}" x2="${bars[0] - 2}" y2="${bars[1] + 4}" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
    `<line x1="${bars[0] - 12}" y1="${bars[1] + 2}" x2="${bars[0] + 6}" y2="${bars[1] + 2}" stroke="${GEAR}" stroke-width="3.2" stroke-linecap="round"/>` +
    `<line x1="${crank[0]}" y1="${crank[1] + r + 5}" x2="${crank[0]}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
    `<line x1="-12" y1="${MACHINE_FLOOR + 1}" x2="150" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
  );
}
/** A moving handle: a lever about a low pivot whose grip swings
 *  forward and back with the stroke. */
function swingHandle(
  phi: number,
  pivot: Pt,
  len: number,
  amp: number,
  phase: number
): Pt {
  // cos, not sin: the handle is at its extremes at φ = 0 and ½ — forward
  // when the near pedal is at the front of the stroke, back half a
  // turn later. sin put both extremes at the quarter turns and left the
  // hand in the same place at 0 and ½.
  const a = -Math.PI / 2 + amp * Math.cos(2 * Math.PI * phi + phase);
  return [pivot[0] + len * Math.cos(a), pivot[1] + len * Math.sin(a)];
}

/* Swimming — freestyle, side-on at the surface. The body lies prone
 * (head-right) just under a water line; each arm turns a full circle
 * about the shoulder (the recovery over the water, the pull under it),
 * the far arm half a stroke behind; the legs flutter about the hips. */
const WATER_Y = 118;
function swimPose(phi: number): Partial<Record<GroupName, Op[]>> {
  const G: Op = { kind: "rotate", deg: 90, pivot: [44, 100] };
  const hipG = applyToPoint(SIDE_ANCHORS.hip, [G]);
  const T0: Op = { kind: "translate", dx: 0, dy: WATER_Y + 8 - hipG[1] };
  const body: Op[] = [G, T0];
  // Arms: a full turn about the shoulder. In the prone body's own frame
  // the arm hangs "down" toward the feet (−x on screen); a positive
  // rotation carries the hand back, over the top and forward again.
  // Positive: from hanging back along the body, over the top (the
  // recovery, above the water), forward to the entry, then down and
  // back under it (the pull). The pin holds the hand above the line at
  // a quarter turn and below it at three quarters.
  const nearDeg = 360 * phi;
  const farDeg = 360 * phi + 180;
  const upperL: Op[] = [
    { kind: "rotate", deg: nearDeg, pivot: SIDE_ANCHORS.shoulder },
    ...body,
  ];
  const upperR: Op[] = [
    { kind: "rotate", deg: farDeg, pivot: SIDE_ANCHORS.shoulder },
    ...body,
  ];
  // A soft elbow through the pull, straighter on the recovery.
  const bendL: Op = { kind: "rotate", deg: -16, pivot: SIDE_ANCHORS.elbow };
  // Flutter kick: small alternating hip swings, the knee soft.
  const kick = 10 * Math.sin(4 * Math.PI * phi);
  const thighL: Op[] = [
    { kind: "rotate", deg: kick, pivot: SIDE_ANCHORS.hip },
    ...body,
  ];
  const thighR: Op[] = [
    { kind: "rotate", deg: -kick, pivot: SIDE_ANCHORS.hip },
    ...body,
  ];
  const shankL: Op[] = [
    { kind: "rotate", deg: kick * 0.6, pivot: SIDE_ANCHORS.knee },
    ...thighL,
  ];
  const shankR: Op[] = [
    { kind: "rotate", deg: -kick * 0.6, pivot: SIDE_ANCHORS.knee },
    ...thighR,
  ];
  return {
    head: body,
    torso: body,
    pelvis: body,
    thighL,
    shankL,
    thighR,
    shankR,
    upperArmL: upperL,
    foreArmL: [bendL, ...upperL],
    handL: [bendL, ...upperL],
    upperArmR: upperR,
    foreArmR: [bendL, ...upperR],
    handR: [bendL, ...upperR],
  };
}

/* ── Keyed chains (batch 17): the man-maker and the Turkish get-up ──
 * The burpee's construction generalised: a keyframe is a world hip, a
 * trunk angle, per-leg ankles and per-arm world hands (with an elbow
 * branch each), plus optional overrides for a leg that is not planted
 * (a knee on the floor) and an arm that must be straight. Frames
 * interpolate with `smooth`; the trunk is `trunkBetween`, the legs
 * `plantedLeg`, the arms `armToWorld`. */
interface KeyFrame {
  e: number;
  hip: Pt;
  trunk: number;
  ankleL: Pt;
  ankleR: Pt;
  handL: Pt;
  handR: Pt;
  /** Knee branch per leg. */
  kneeL?: (a: Pt, b: Pt) => Pt;
  kneeR?: (a: Pt, b: Pt) => Pt;
  /** Elbow branch per arm. */
  elbowL?: (a: Pt, b: Pt) => Pt;
  elbowR?: (a: Pt, b: Pt) => Pt;
}
function keyedPose(
  keys: KeyFrame[],
  e: number
): Partial<Record<GroupName, Op[]>> {
  let i = 0;
  while (i < keys.length - 2 && e > keys[i + 1].e) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const k = smooth((e - a.e) / (b.e - a.e));
  const L = (p: Pt, q: Pt): Pt => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  const hip = L(a.hip, b.hip);
  const trunk = lerp(a.trunk, b.trunk, k);
  const rad = (trunk * Math.PI) / 180;
  const S: Pt = [
    hip[0] + TRUNK_LEN * Math.cos(rad),
    hip[1] + TRUNK_LEN * Math.sin(rad),
  ];
  const torso = trunkBetween(hip, S);
  // Branches switch at the midpoint of a segment.
  const pick = k < 0.5 ? a : b;
  const legL = plantedLeg(
    hip,
    L(a.ankleL, b.ankleL),
    pick.kneeL ?? KNEE_FORWARD
  );
  const legR = plantedLeg(
    hip,
    L(a.ankleR, b.ankleR),
    pick.kneeR ?? KNEE_FORWARD
  );
  const armL = armToWorld(
    torso,
    L(a.handL, b.handL),
    pick.elbowL ?? ELBOW_BACK
  );
  const armR = armToWorld(
    torso,
    L(a.handR, b.handR),
    pick.elbowR ?? ELBOW_BACK
  );
  return {
    head: torso,
    torso,
    pelvis: torso,
    thighL: legL.thigh,
    shankL: legL.shank,
    thighR: legR.thigh,
    shankR: legR.shank,
    upperArmL: armL.upper,
    foreArmL: armL.fore,
    handL: armL.fore,
    upperArmR: armR.upper,
    foreArmR: armR.fore,
    handR: armR.fore,
  };
}
/** The straight-trunk angle for a standing figure (the shoulder sits
 *  5.4° ahead of the hip at rest). */
const UPRIGHT_TRUNK = -90 + 5.4;

/* Man-maker: a burpee with dumbbells and a row each side, ending in a
 * clean and press — a CYCLE from plank to plank. The hands hold the
 * bells throughout, so the "hands" are where the bells are. */
const MM_BELL_L: Pt = [112, MACHINE_FLOOR - 6];
const MM_BELL_R: Pt = [116, MACHINE_FLOOR - 6];
const MM_PLANK = (() => {
  const b = highPlankBase();
  const hip = applyToPoint(SIDE_ANCHORS.hip, b.body);
  const trunk =
    (Math.atan2(b.shoulder[1] - hip[1], b.shoulder[0] - hip[0]) * 180) /
    Math.PI;
  return { hip, trunk };
})();
const MM_LOW = (() => {
  const lowDeg = Math.asin(
    (HIGH_PLANK_ANKLE[1] - (MACHINE_FLOOR - 6 - 39)) / (LEG_LEN + TRUNK_LEN)
  );
  return {
    hip: [
      HIGH_PLANK_ANKLE[0] + LEG_LEN * Math.cos(lowDeg),
      HIGH_PLANK_ANKLE[1] - LEG_LEN * Math.sin(lowDeg),
    ] as Pt,
    trunk: (-lowDeg * 180) / Math.PI,
  };
})();
const MM_KEYS: KeyFrame[] = (() => {
  const plank: KeyFrame = {
    e: 0,
    hip: MM_PLANK.hip,
    trunk: MM_PLANK.trunk,
    ankleL: HIGH_PLANK_ANKLE,
    ankleR: HIGH_PLANK_ANKLE,
    handL: MM_BELL_L,
    handR: MM_BELL_R,
  };
  const squat: KeyFrame = {
    e: 0.62,
    hip: [49.5, 160],
    trunk: -20,
    ankleL: [60, 196],
    ankleR: [60, 196],
    handL: MM_BELL_L,
    handR: MM_BELL_R,
    kneeL: KNEE_HIGH,
    kneeR: KNEE_HIGH,
  };
  const racked: KeyFrame = {
    e: 0.72,
    hip: [42, 96],
    trunk: UPRIGHT_TRUNK,
    ankleL: [46.6, 193],
    ankleR: [46.6, 193],
    handL: [57, 40],
    handR: [57, 40],
    elbowL: ELBOW_LOW,
    elbowR: ELBOW_LOW,
  };
  return [
    plank,
    { ...plank, e: 0.1, hip: MM_LOW.hip, trunk: MM_LOW.trunk },
    { ...plank, e: 0.2 },
    // Row the near bell to the ribs; the far arm holds the plank.
    { ...plank, e: 0.3, handL: [MM_PLANK.hip[0] + 58, MM_PLANK.hip[1] + 6] },
    { ...plank, e: 0.38 },
    { ...plank, e: 0.46, handR: [MM_PLANK.hip[0] + 58, MM_PLANK.hip[1] + 6] },
    { ...plank, e: 0.54 },
    squat,
    racked,
    { ...racked, e: 0.82, handL: [50, -34], handR: [50, -34] },
    { ...racked, e: 0.9 },
    { ...squat, e: 0.96 },
    { ...plank, e: 1 },
  ];
})();

/* Turkish get-up: lying with the bell pressed up, to the elbow, to the
 * hand, the bridge, sweep to a half-kneel, kneel, stand — and the
 * instruction's own "reverse the sequence", so the rep player's
 * there-and-back is right for it. The near arm holds the bell VERTICAL
 * over the shoulder at every position (pinned); the far arm posts on
 * the floor. */
const TGU_FLOOR = MACHINE_FLOOR - 4;
function tguKeys(): KeyFrame[] {
  const bellAbove = (S: Pt): Pt => [S[0], S[1] - STRAIGHT_ARM];
  const S_of = (hip: Pt, trunk: number): Pt => {
    const r = (trunk * Math.PI) / 180;
    return [hip[0] + TRUNK_LEN * Math.cos(r), hip[1] + TRUNK_LEN * Math.sin(r)];
  };
  const mk = (
    e: number,
    hip: Pt,
    trunk: number,
    ankleL: Pt,
    ankleR: Pt,
    handR: Pt,
    extra: Partial<KeyFrame> = {}
  ): KeyFrame => ({
    e,
    hip,
    trunk,
    ankleL,
    ankleR,
    handL: bellAbove(S_of(hip, trunk)),
    handR,
    elbowL: ELBOW_FRONT,
    ...extra,
  });
  // Lying head-left: the trunk points LEFT (180°) from the hip and
  // lifts through NEGATIVE angles (screen y points down, so −150 is
  // up-and-left); the near leg bent with the foot planted, the far leg
  // straight out.
  const lyingHip: Pt = [60, TGU_FLOOR - 10];
  return [
    mk(
      0,
      lyingHip,
      180,
      [96, TGU_FLOOR - 4],
      [140, TGU_FLOOR - 6],
      [lyingHip[0] - 62, TGU_FLOOR - 2],
      { kneeL: KNEE_HIGH, kneeR: KNEE_HIGH }
    ),
    // To the elbow: the trunk lifts 30°, the far forearm on the floor.
    mk(
      0.2,
      lyingHip,
      -150,
      [96, TGU_FLOOR - 4],
      [140, TGU_FLOOR - 6],
      [lyingHip[0] - 50, TGU_FLOOR - 2],
      { kneeL: KNEE_HIGH, kneeR: KNEE_HIGH, elbowR: ELBOW_LOW }
    ),
    // To the hand: trunk 60°, far arm straight to the floor.
    mk(
      0.4,
      [62, TGU_FLOOR - 12],
      -120,
      [96, TGU_FLOOR - 4],
      [140, TGU_FLOOR - 6],
      [lyingHip[0] - 40, TGU_FLOOR - 2],
      { kneeL: KNEE_HIGH, kneeR: KNEE_HIGH, elbowR: ELBOW_LOW }
    ),
    // Bridge: hips up, far leg straight, the near foot planted.
    // Bridge: the trunk stays low enough (40° up) for the posted far
    // hand to reach the floor — a near-vertical trunk lifts the shoulder
    // out of the arm's reach.
    mk(
      0.55,
      [64, TGU_FLOOR - 28],
      -140,
      [96, TGU_FLOOR - 4],
      [140, TGU_FLOOR - 6],
      [lyingHip[0] - 42, TGU_FLOOR - 2],
      { kneeL: KNEE_HIGH, kneeR: KNEE_HIGH, elbowR: ELBOW_LOW }
    ),
    // Sweep to the half-kneel: the far knee comes under, the near foot
    // stays planted, the far hand still posted.
    // Half-kneel: the hip a thigh above the floor, the far shin along it.
    mk(
      0.7,
      [60, TGU_FLOOR - 53],
      -100,
      [96, TGU_FLOOR - 4],
      [12, TGU_FLOOR - 2],
      [lyingHip[0] - 40, TGU_FLOOR - 2],
      { kneeL: KNEE_HIGH, kneeR: KNEE_LOW, elbowR: ELBOW_LOW }
    ),
    // Kneel upright: the far hand comes off the floor to the side.
    mk(
      0.84,
      [52, TGU_FLOOR - 53],
      UPRIGHT_TRUNK,
      [96, TGU_FLOOR - 4],
      [12, TGU_FLOOR - 2],
      [42, TGU_FLOOR - 10],
      { kneeL: KNEE_HIGH, kneeR: KNEE_LOW }
    ),
    // Stand.
    mk(1, [42, 96], UPRIGHT_TRUNK, [46.6, 193], [46.6, 193], [44, 105]),
  ];
}
const TGU_KEYS = tguKeys();

/* ── The ankle (batch 18) — the seated calf raise ──
 * The foot is its own piece now, so a heel can rise while the ball of
 * the foot stays on a platform: the foot rotates about the ball, the
 * ankle goes where that puts it, and the leg is `plantedLeg` from the
 * seated hip to the moving ankle — the knee (and the pad on it) rises
 * with the heel, which is what the machine does. */
const SCR_SEAT: Pt = [44, 136];
const SCR_PLATFORM: Pt = [106, 196];
/** Foot tilt about the ball at [stretch, top]: NEGATIVE drops the heel
 *  below the platform (screen y points down, so a negative turn about
 *  the ball sends the heel, behind it, downward), positive lifts it. */
const SCR_TILT: [number, number] = [-14, 30];
function seatedCalfPose(e: number): Partial<Record<GroupName, Op[]>> {
  const chain = seatedChain(SCR_SEAT, -86, 0, -4);
  const foot: Op[] = [
    {
      kind: "rotate",
      deg: lerp(SCR_TILT[0], SCR_TILT[1], e),
      pivot: SIDE_ANCHORS.ball,
    },
    {
      kind: "translate",
      dx: SCR_PLATFORM[0] - SIDE_ANCHORS.ball[0],
      dy: SCR_PLATFORM[1] - SIDE_ANCHORS.ball[1],
    },
  ];
  const ankle = applyToPoint(SIDE_ANCHORS.ankle, foot);
  const leg = plantedLeg(SCR_SEAT, ankle, KNEE_FORWARD);
  return {
    head: chain.head,
    torso: chain.torso,
    pelvis: chain.body,
    thighL: leg.thigh,
    thighR: leg.thigh,
    shankL: leg.shank,
    shankR: leg.shank,
    footL: foot,
    footR: foot,
    upperArmL: chain.arm.upper,
    foreArmL: chain.arm.fore,
    handL: chain.arm.fore,
    upperArmR: chain.arm.upper,
    foreArmR: chain.arm.fore,
    handR: chain.arm.fore,
  };
}

function sideSquatChain(
  e: number,
  hingeDeg: number,
  thighDeg = -92,
  shinDeg = 10
): {
  torsoOps: Op[];
  pelvisOps: Op[];
  headOps: Op[];
  thighOps: Op[];
  legOps: Op[];
  hinge: number;
} {
  const shin = lerp(0, shinDeg, e); // about the planted ankle
  /* To PARALLEL, which is what the exercise's own instruction asks for
     ("lower until thighs are at or below parallel"). At -78 the hip
     finished 10.9 units ABOVE the knee — 12.7 degrees short — and the
     comment here said so: "just above parallel". A demo that stops
     higher than its instructions is teaching the wrong depth. */
  const thighRel = lerp(0, thighDeg, e);
  const hinge = lerp(0, hingeDeg, e);
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
  const torsoOps: Op[] = [
    { kind: "rotate", deg: hinge, pivot: SIDE_ANCHORS.hip },
    shift,
  ];
  const pelvisOps: Op[] = [
    { kind: "rotate", deg: hinge * PELVIS_FOLLOW, pivot: SIDE_ANCHORS.hip },
    shift,
  ];
  const headOps: Op[] = [
    { kind: "rotate", deg: -hinge * HEAD_LIFT, pivot: SIDE_ANCHORS.neck },
    ...torsoOps,
  ];
  return { torsoOps, pelvisOps, headOps, thighOps, legOps, hinge };
}

/** Where the bar sits on the traps, in TORSO space (the bar rides the
 *  body, so this point is fixed relative to the shoulder and the whole
 *  assembly inherits the hinge). Behind and just above the shoulder
 *  joint. */
/** Back-squat upper-arm angle back from vertical (deg). */
const SQUAT_ELBOW_BACK = 40;
/** The back-rack arms in TORSO space: upper arm angled back, forearm
 *  reaching up to the bar on the traps. Ride them on the torso ops. */
function backRackArms(): { upper: Op[]; fore: Op[] } {
  const elbowPre = applyToPoint(SIDE_ANCHORS.elbow, [
    { kind: "rotate", deg: SQUAT_ELBOW_BACK, pivot: SIDE_ANCHORS.shoulder },
  ]);
  const toRack = Math.hypot(
    BACK_RACK[0] - elbowPre[0],
    BACK_RACK[1] - elbowPre[1]
  );
  const handPre: Pt = [
    elbowPre[0] + ((BACK_RACK[0] - elbowPre[0]) / toRack) * SIDE_FORE_LEN,
    elbowPre[1] + ((BACK_RACK[1] - elbowPre[1]) / toRack) * SIDE_FORE_LEN,
  ];
  return aimArm(
    { S: SIDE_ANCHORS.shoulder, E: SIDE_ANCHORS.elbow, H: SIDE_ANCHORS.hand },
    elbowPre,
    handPre,
    0
  );
}
export const BACK_RACK: Pt = [
  SIDE_ANCHORS.shoulder[0] - 5,
  SIDE_ANCHORS.shoulder[1] - 5,
];

/** Goblet hold, in TORSO space: the cupped hands sit just proud of the
 *  chest contour at sternum height, so the bell reads as pressed
 *  against the chest rather than floating. */
export const GOBLET_HOLD: Pt = [66, SIDE_ANCHORS.shoulder[1] + 11];

/** Ball of the near foot — the calf raise pivots about it. Measured
 *  from the FOOT facet's sole line (y ≈ 202.3) at the ball. */
export const CALF_BALL: Pt = [60, 202.3];
/** The block the toes stand on: its top is the sole line; the floor is
 *  below it so the heels can drop past the edge at the bottom. */
export const CALF_BLOCK_TOP = 203;
const CALF_FLOOR = 212;

/** Dip station grip, fixed in final space: hand height beside the
 *  figure, well above the floor so the tucked feet never touch it. */
export const DIP_GRIP: Pt = [56, 108];
/* The hinge lift — the deadlift's construction, parameterised so the
 * rack pull can stop it early WITHOUT a second copy of the hinge to
 * drift (the mirrored-constant failure this codebase keeps paying
 * for). `hipP` / `kneeP` are the per-joint progress (the deadlift
 * staggers them: hinge leads, knees trail), the *Deg arguments the
 * full-depth joint angles, `handX` the bar's x offset from the
 * shoulder at this frame. Built ankle-up so the feet stay planted. */
function hingeLift(
  hipP: number,
  kneeP: number,
  hingeDeg: number,
  thighDeg: number,
  shinDeg: number,
  handX: number
): Partial<Record<GroupName, Op[]>> {
  const shin = lerp(0, shinDeg, kneeP); // about the planted ankle
  const thighRel = lerp(0, thighDeg, kneeP); // about the knee → hips back+down
  const hinge = lerp(0, hingeDeg, hipP); // torso about the hip
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
  const pelvisOps: Op[] = [
    { kind: "rotate", deg: hinge * PELVIS_FOLLOW, pivot: SIDE_ANCHORS.hip },
    shift,
  ];
  const headOps: Op[] = [
    { kind: "rotate", deg: -hinge * HEAD_LIFT, pivot: SIDE_ANCHORS.neck },
    ...torsoOps,
  ];
  /* Straight arms hang from the hinged shoulder. The x-offset
   * interpolates: standing lockout rests the bar against the FRONT
   * of the thigh (+8), the bottom pulls it back under the shoulder
   * blades toward mid-foot (−5, the lats-pull-the-bar-in line) so
   * the bar never drifts out past the toes. */
  const S = applyToPoint(SIDE_ANCHORS.shoulder, torsoOps);
  const hFinal: Pt = [S[0] + handX, S[1] + STRAIGHT_ARM];
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
    solveElbow(SIDE_ANCHORS.shoulder, hPre, SIDE_UPPER_LEN, SIDE_FORE_LEN, -1),
    hPre,
    0
  );
  return {
    head: headOps,
    torso: torsoOps,
    pelvis: pelvisOps,
    thighL: thighOps,
    thighR: thighOps,
    shankL: legOps,
    shankR: legOps,
    upperArmL: [...arm.upper, ...torsoOps],
    foreArmL: [...arm.fore, ...torsoOps],
    handL: [...arm.fore, ...torsoOps],
    upperArmR: [...arm.upper, ...torsoOps],
    foreArmR: [...arm.fore, ...torsoOps],
    handR: [...arm.fore, ...torsoOps],
  };
}

/* The chest-supported pad — along the body line, offset to the chest
 * side, from the thighs up past the shoulders; posts to the floor.
 * Shared by the chest-supported row and the spider curl. */
function chestSupportedPadScene(
  _e: number,
  pose: Partial<Record<GroupName, Op[]>>
): string {
  // The pad: along the body line, offset to the chest side, from
  // the thighs up past the shoulders; posts to the floor.
  const S = applyToPoint(SIDE_ANCHORS.shoulder, pose.torso ?? []);
  const K = applyToPoint(SIDE_ANCHORS.knee, pose.thighL ?? []);
  const dx = S[0] - K[0];
  const dy = S[1] - K[1];
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy; // chest side (down-forward for a forward lean)
  const py = ux;
  const off = 15;
  const a: Pt = [K[0] + ux * 10 + px * off, K[1] + uy * 10 + py * off];
  const b: Pt = [S[0] + ux * 26 + px * off, S[1] + uy * 26 + py * off];
  return (
    `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${GEAR}" stroke-width="8" stroke-linecap="round"/>` +
    `<line x1="${((a[0] + b[0]) / 2).toFixed(1)}" y1="${((a[1] + b[1]) / 2 + 4).toFixed(1)}" x2="${((a[0] + b[0]) / 2).toFixed(1)}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
    `<line x1="-6" y1="${MACHINE_FLOOR + 1}" x2="166" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
  );
}

/* ── Anterior arm helpers (2026-09-03 batch 11, the frontal plane) ──
 * The front figure's arms are two segments on measured anchors, and the
 * one thing the front camera can do that the profile cannot is show an
 * arm coming AT the viewer: `scaleAxis` shortens a limb along its own
 * length while keeping its width, which is exactly what foreshortening
 * looks like. These helpers aim an arm at a WORLD hand and derive the
 * foreshortening from how far short of a full reach that hand sits. */
const ANT_ARM_LEN = ANT_UPPER_LEN + ANT_FORE_LEN;
function antRest(side: "L" | "R"): { S: Pt; E: Pt; H: Pt; out: 1 | -1 } {
  return side === "L"
    ? { S: ANT.shoulderL, E: ANT.elbowL, H: ANT.handL, out: 1 }
    : { S: ANT.shoulderR, E: ANT.elbowR, H: ANT.handR, out: -1 };
}
function postRest(side: "L" | "R"): { S: Pt; E: Pt; H: Pt; out: 1 | -1 } {
  return side === "L"
    ? { S: POST.shoulderL, E: POST.elbowL, H: POST.handL, out: 1 }
    : { S: POST.shoulderR, E: POST.elbowR, H: POST.handR, out: -1 };
}
/** Anterior hip joints: the thigh polygons' top centres. */
const ANT_HIP_L: Pt = [37, 96];
const ANT_HIP_R: Pt = [63, 96];
/** The `scaleAxis` angle that scales ALONG direction `d` (its deg is
 *  measured from vertical in the rotate convention). */
function axisDeg(d: Pt): number {
  return (Math.atan2(d[0], -d[1]) * 180) / Math.PI;
}
/** A near-straight anterior arm aimed at a world hand. A hand nearer
 *  than the arm's reach is read as the arm pointing TOWARD the viewer,
 *  so the arm is foreshortened along its axis to land on it; a hand
 *  further than the reach clamps to a full in-plane arm. */
function antArmToward(
  side: "L" | "R",
  hand: Pt,
  reach = 0.985
): { upper: Op[]; fore: Op[] } {
  return armTowardOn(antRest(side), ANT_UPPER_LEN, ANT_FORE_LEN, hand, reach);
}
/** The same on the BACK figure (reverse flys and decks). */
function postArmToward(
  side: "L" | "R",
  hand: Pt,
  reach = 0.985
): { upper: Op[]; fore: Op[] } {
  return armTowardOn(
    postRest(side),
    POST_UPPER_LEN,
    POST_FORE_LEN,
    hand,
    reach
  );
}
function armTowardOn(
  r: { S: Pt; E: Pt; H: Pt; out: 1 | -1 },
  upperLen: number,
  foreLen: number,
  hand: Pt,
  reach: number
): { upper: Op[]; fore: Op[] } {
  const dx = hand[0] - r.S[0];
  const dy = hand[1] - r.S[1];
  const dist = Math.hypot(dx, dy) || 1;
  const d: Pt = [dx / dist, dy / dist];
  const full = (upperLen + foreLen) * reach;
  const k = Math.min(1, dist / full);
  const T: Pt = [r.S[0] + d[0] * full, r.S[1] + d[1] * full];
  const arm = aimArm(
    { S: r.S, E: r.E, H: r.H },
    solveElbow(r.S, T, upperLen, foreLen, r.out),
    T,
    0
  );
  const scale: Op = { kind: "scaleAxis", k, deg: axisDeg(d), pivot: r.S };
  return { upper: [...arm.upper, scale], fore: [...arm.fore, scale] };
}
/** Anterior FOREARM aimed at a world hand from a world elbow (the upper
 *  arm placed by `antElbowAt`-style ops or left at rest), foreshortened
 *  when the hand sits nearer than the forearm's length. */
function antForeToward(side: "L" | "R", elbow: Pt, hand: Pt): Op[] {
  const r = antRest(side);
  const dx = hand[0] - elbow[0];
  const dy = hand[1] - elbow[1];
  const dist = Math.hypot(dx, dy) || 1;
  const d: Pt = [dx / dist, dy / dist];
  const fa = angleBetween([r.H[0] - r.E[0], r.H[1] - r.E[1]], d);
  const k = Math.min(1, dist / ANT_FORE_LEN);
  return [
    { kind: "rotate", deg: fa, pivot: r.E },
    { kind: "scaleAxis", k, deg: axisDeg(d), pivot: r.E },
    { kind: "translate", dx: elbow[0] - r.E[0], dy: elbow[1] - r.E[1] },
  ];
}
/** An anterior LEG seen from the front with the thigh pointing toward
 *  the viewer (a seated figure, or lying with the knee bent): the thigh
 *  is foreshortened by `k` about the hip along its own line, the shank
 *  hangs unscaled from the drawn knee, and the whole leg is swung
 *  `swingDeg` about the hip (abduction out, adduction in). */
function antLegToward(
  side: "L" | "R",
  k: number,
  swingDeg: number
): { thigh: Op[]; shank: Op[]; knee: Pt; ankle: Pt } {
  const hip = side === "L" ? ANT_HIP_L : ANT_HIP_R;
  const knee0 = side === "L" ? ANT.kneeL : ANT.kneeR;
  const d: Pt = [knee0[0] - hip[0], knee0[1] - hip[1]];
  const len = Math.hypot(d[0], d[1]);
  const u: Pt = [d[0] / len, d[1] / len];
  const swing: Op = { kind: "rotate", deg: swingDeg, pivot: hip };
  const thigh: Op[] = [
    { kind: "scaleAxis", k, deg: axisDeg(u), pivot: hip },
    swing,
  ];
  const kneeScaled: Pt = [hip[0] + u[0] * len * k, hip[1] + u[1] * len * k];
  const shank: Op[] = [
    {
      kind: "translate",
      dx: kneeScaled[0] - knee0[0],
      dy: kneeScaled[1] - knee0[1],
    },
    swing,
  ];
  const knee = applyToPoint(knee0, shank);
  const ankle = applyToPoint([knee0[0] - 3, ANT.ankleY], shank);
  return { thigh, shank, knee, ankle };
}
const postHands = (
  _e: number,
  pose: Partial<Record<GroupName, Op[]>>
): [Pt, Pt] => [
  applyToPoint(POST.handL, pose.foreArmL ?? []),
  applyToPoint(POST.handR, pose.foreArmR ?? []),
];
/** Seated-machine furniture on the front figure: a backrest behind the
 *  trunk and the floor the feet would reach if the shins hung. */
const antSeatScene = (floorY: number): string =>
  `<rect x="30" y="34" width="40" height="70" rx="4" fill="${GEAR}"/>` +
  `<line x1="-8" y1="${floorY}" x2="108" y2="${floorY}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`;
const HIP_MACHINE_K = 0.42;
const HIP_MACHINE_FLOOR = 172;
const WOODCHOP_PULLEY: Pt = [-30, -14];
/** A world hand target pulled back through a trunk twist, so an arm aimed
 *  BEFORE the twist lands on it AFTER (the arm ops append the twist). */
function preTwist(hand: Pt, deg: number, pivot: Pt): Pt {
  return applyToPoint(hand, [{ kind: "rotate", deg: -deg, pivot }]);
}
const REAR_FLY_LEVERS: [Pt, Pt] = [
  [-10, -2],
  [110, -2],
];
/** Anterior upper arm aimed at a world ELBOW (foreshortened when it sits
 *  nearer than the upper arm's length — an elbow in front of the body),
 *  with the forearm standing vertical from it, up or down, unscaled. */
function antElbowAt(
  side: "L" | "R",
  elbow: Pt,
  foreDir: "up" | "down"
): { upper: Op[]; fore: Op[]; hand: Pt } {
  const r = antRest(side);
  const dx = elbow[0] - r.S[0];
  const dy = elbow[1] - r.S[1];
  const dist = Math.hypot(dx, dy) || 1;
  const d: Pt = [dx / dist, dy / dist];
  const ua = angleBetween([r.E[0] - r.S[0], r.E[1] - r.S[1]], d);
  const k = Math.min(1, dist / ANT_UPPER_LEN);
  const upper: Op[] = [
    { kind: "rotate", deg: ua, pivot: r.S },
    { kind: "scaleAxis", k, deg: axisDeg(d), pivot: r.S },
  ];
  const fa = angleBetween(
    [r.H[0] - r.E[0], r.H[1] - r.E[1]],
    foreDir === "up" ? [0, -1] : [0, 1]
  );
  const fore: Op[] = [
    { kind: "rotate", deg: fa, pivot: r.E },
    { kind: "translate", dx: elbow[0] - r.E[0], dy: elbow[1] - r.E[1] },
  ];
  const hand: Pt = [
    elbow[0],
    elbow[1] + (foreDir === "up" ? -ANT_FORE_LEN : ANT_FORE_LEN),
  ];
  return { upper, fore, hand };
}
/** Forearm swung about a fixed world elbow from pointing DOWN to pointing
 *  UP through the viewer (an external rotation seen from the front):
 *  at t=0.5 it points at the camera and is drawn shortest. */
function antForeRotate(
  side: "L" | "R",
  elbow: Pt,
  t: number
): { fore: Op[]; hand: Pt } {
  const r = antRest(side);
  const up = t >= 0.5;
  const fa = angleBetween(
    [r.H[0] - r.E[0], r.H[1] - r.E[1]],
    up ? [0, -1] : [0, 1]
  );
  const k = Math.max(0.12, Math.abs(Math.cos(Math.PI * t)));
  const fore: Op[] = [
    { kind: "rotate", deg: fa, pivot: r.E },
    { kind: "scaleAxis", k, deg: 0, pivot: r.E },
    { kind: "translate", dx: elbow[0] - r.E[0], dy: elbow[1] - r.E[1] },
  ];
  const hand: Pt = [elbow[0], elbow[1] + (up ? -1 : 1) * ANT_FORE_LEN * k];
  return { fore, hand };
}
const antHands = (
  _e: number,
  pose: Partial<Record<GroupName, Op[]>>
): [Pt, Pt] => [
  applyToPoint(ANT.handL, pose.foreArmL ?? []),
  applyToPoint(ANT.handR, pose.foreArmR ?? []),
];
/** The lateral raise's arm sweep (shared with the Lu raise's first half). */
function lateralRaiseOps(e: number): Partial<Record<GroupName, Op[]>> {
  const arm = lerp(4, 72, e);
  const lift: Op = { kind: "translate", dx: 0, dy: -1.7 * e };
  return {
    upperArmL: [{ kind: "rotate", deg: arm, pivot: ANT.shoulderL }, lift],
    foreArmL: [
      { kind: "rotate", deg: -10, pivot: ANT.elbowL },
      { kind: "rotate", deg: arm, pivot: ANT.shoulderL },
      lift,
    ],
    upperArmR: [{ kind: "rotate", deg: -arm, pivot: ANT.shoulderR }, lift],
    foreArmR: [
      { kind: "rotate", deg: 10, pivot: ANT.elbowR },
      { kind: "rotate", deg: -arm, pivot: ANT.shoulderR },
      lift,
    ],
  };
}
const FLY_WIDE = 80;
/** How far the shoulders rise in a shrug (the arm group carries the
 *  deltoid cap, so this is the cap's travel). */
const SHRUG_RISE = 7;
/** Pec-deck finish: the elbow this far INSIDE the shoulder line (negative
 *  "out"), so the forearm pads meet in front of the chest. */
const PEC_DECK_IN = -13;
const CHEST_PULLEYS: [Pt, Pt] = [
  [-36, 46],
  [136, 46],
];
const HIGH_PULLEYS: [Pt, Pt] = [
  [-36, -16],
  [136, -16],
];
const FLY_LEVERS: [Pt, Pt] = [
  [-10, -2],
  [110, -2],
];

export const BODY_DEMOS: Record<string, BodyDemo> = {
  squat: {
    view: "side",
    /* Its first instruction is "Bar on your upper traps": the near plate
     * (end-on, profile) sits at the back-rack contact and rides the
     * torso. Aliases that carry no barbell (bodyweight, front squat)
     * are stripped of this gear at resolution — see
     * HELD_GEAR_FREE_VARIANTS; with nothing at the contact the
     * hands-behind-the-neck pose IS the prisoner squat. */
    equip: "plate-end",
    plateR: 11,
    // Racked BEHIND the neck, so the sleeve points back.
    sleeveDir: -1,
    concentricTo: 0,
    // The bottom frame carries the hips ~40 units behind the knee, so
    // the glutes cross x=0 — same left margin as the deadlift.
    viewBox: "-24 -2 192 212",
    groundY: 204,
    shadowCx: 56,
    shadowRx: 40,
    /* Catalogue: Quads | Glutes, Hamstrings, Core. */
    tint: {
      quadriceps: "primary",
      gluteal: "secondary",
      hamstring: "secondary",
      abs: "secondary",
    },
    pose: (e) => {
      /* Side-view back squat (2026-09-02, replaces the anterior
       * scaleY-compression version). Legs + torso from the shared
       * chain; the hands grip the bar behind the neck, so the arm is
       * aimed in torso space at the rack contact and composed with the
       * hinge — the elbow solves down-and-back (the real back-squat
       * elbow), the forearm runs up beside the lats to the bar. */
      const { torsoOps, pelvisOps, headOps, thighOps, legOps } = sideSquatChain(
        e,
        43
      );
      /* The rack contact sits ~7 units up-and-back of the shoulder, so
       * an in-plane IK folds the arm almost closed and BOTH elbow
       * branches land at shoulder height (one straight back, one
       * straight up). A real back-squat elbow points down-and-back
       * because the grip is OUTBOARD of the body — an abduction a true
       * profile cannot solve. So the arm is choreographed: upper arm 40°
       * back from vertical, forearm folded up toward the bar. The fist
       * lands a few units under the bar, which is what the foreshortened
       * outboard grip looks like from the side. */
      const arm = backRackArms();
      return {
        head: headOps,
        torso: torsoOps,
        pelvis: pelvisOps,
        thighL: thighOps,
        thighR: thighOps,
        shankL: legOps,
        shankR: legOps,
        upperArmL: [...arm.upper, ...torsoOps],
        foreArmL: [...arm.fore, ...torsoOps],
        handL: [...arm.fore, ...torsoOps],
        upperArmR: [...arm.upper, ...torsoOps],
        foreArmR: [...arm.fore, ...torsoOps],
        handR: [...arm.fore, ...torsoOps],
      };
    },
    /* The rack contact IS the bar: it rides the torso by construction. */
    bar: (_e, pose) => {
      const c = applyToPoint(BACK_RACK, pose.torso ?? []);
      return [c, c];
    },
  },

  "goblet-squat": {
    view: "side",
    /* Its own demo since 2026-08-17: same squat, different load,
     * different arms. The bell is cupped at the sternum, so the hands
     * are aimed at a point just proud of the chest in torso space and
     * the bell (goblet-bell: one end-on disc above the hands) rides
     * the hinge with them. A goblet's front load keeps the torso more
     * upright than a back squat — 30° at the bottom against 43°. */
    equip: "goblet-bell",
    concentricTo: 0,
    viewBox: "-24 -2 192 212",
    groundY: 204,
    shadowCx: 56,
    shadowRx: 40,
    tint: { quadriceps: "primary", gluteal: "secondary", abs: "secondary" },
    pose: (e) => {
      const { torsoOps, pelvisOps, headOps, thighOps, legOps } = sideSquatChain(
        e,
        30
      );
      // out −1: the elbow tucks DOWN and back under the load ("elbows
      // pinned under it"); +1 would solve it forward-up over the bell.
      const arm = aimArm(
        {
          S: SIDE_ANCHORS.shoulder,
          E: SIDE_ANCHORS.elbow,
          H: SIDE_ANCHORS.hand,
        },
        solveElbow(
          SIDE_ANCHORS.shoulder,
          GOBLET_HOLD,
          SIDE_UPPER_LEN,
          SIDE_FORE_LEN,
          -1
        ),
        GOBLET_HOLD,
        0
      );
      return {
        head: headOps,
        torso: torsoOps,
        pelvis: pelvisOps,
        thighL: thighOps,
        thighR: thighOps,
        shankL: legOps,
        shankR: legOps,
        upperArmL: [...arm.upper, ...torsoOps],
        foreArmL: [...arm.fore, ...torsoOps],
        handL: [...arm.fore, ...torsoOps],
        upperArmR: [...arm.upper, ...torsoOps],
        foreArmR: [...arm.fore, ...torsoOps],
        handR: [...arm.fore, ...torsoOps],
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
  },
  "overhead-press": {
    view: "anterior",
    equip: "barbell",
    /* Plate radius 9 on the shaft the hands ride — visibly lighter
     * than the deadlift's full-size 16, heavier than a bell. */
    plateR: 9,
    /* The re-fitted lockout carries the hands ~6 units higher than the
     * default canvas top of -14 — and the PLATES ride 9 above the
     * grips, so the canvas tops out at -24 or lockout clips them. */
    viewBox: "-8 -24 116 234",
    concentricTo: 1,
    startsAt: "stretch",
    /* Drops `neck`, which the catalogue entry never claims among its
     * secondaryMuscles and which nothing justified.
     *
     * It does NOT add the two the catalogue DOES claim — Upper Chest and
     * Core. Tried, and rejected on the render: the anterior chest and
     * abs polygons are large enough that lighting them turns the whole
     * torso purple and the primary movers stop reading at all. The
     * catalogue field says what an exercise TRAINS; a tint has to say
     * what to look at. The brace still gets said — in the tip and the
     * first common mistake, which is where it belongs. */
    tint: {
      "front-deltoids": "primary",
      triceps: "secondary",
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
      const [hl, hr] = pressBarPath(e);
      const rise = pressShoulderRise(e);
      const shL: Pt = [ANT.shoulderL[0], ANT.shoulderL[1] + rise];
      const shR: Pt = [ANT.shoulderR[0], ANT.shoulderR[1] + rise];
      const L = aimArm(
        { S: ANT.shoulderL, E: ANT.elbowL, H: ANT.handL },
        solveElbow(shL, hl, ANT_UPPER_LEN, ANT_FORE_LEN, 1),
        hl,
        rise
      );
      const R = aimArm(
        { S: ANT.shoulderR, E: ANT.elbowR, H: ANT.handR },
        solveElbow(shR, hr, ANT_UPPER_LEN, ANT_FORE_LEN, -1),
        hr,
        rise
      );
      return {
        upperArmL: L.upper,
        foreArmL: L.fore,
        upperArmR: R.upper,
        foreArmR: R.fore,
      };
    },
    /* The bar is REAL now. Its equipment is Barbell and three of its
     * four instructions name the bar, yet for months this demo pressed
     * nothing: held weights left the front views on 2026-07-03 because
     * "the figure has no hands, so a held prop always read detached" —
     * and that was true until the wrist anchors were put on the art and
     * the fists landed (2026-08-17). One path both solves the arms and
     * places the bar, so the two cannot disagree. */
    bar: (e) => pressBarPath(e),
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
    startsAt: "stretch",
    tint: { biceps: "primary", forearm: "secondary" },
    pose: (e) => {
      const curl = lerp(0, 135, e); // elbow flexion, hanging → top
      /* 3 degrees, not 8. Instruction 2 is "pin your elbows to your
         sides — they shouldn't drift forward", and 8 degrees moved the
         elbow 5 units forward, which is the fault the cue warns about.
         A strict curl still travels a little; this is that little. */
      const drift = lerp(0, 3, e);
      const armDrift: Op[] = [
        { kind: "rotate", deg: -drift, pivot: SIDE_ANCHORS.shoulder },
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -curl, pivot: SIDE_ANCHORS.elbow },
        ...armDrift,
      ];
      return {
        upperArmL: armDrift,
        foreArmL: fore,
        handL: fore,
        upperArmR: armDrift,
        foreArmR: fore,
        handR: fore,
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
    /* High pulley: fixed at the top of the station, forward of the face
     * so the cable clears the head through the whole arc. */
    equip: "rope",
    pulley: [72, -10],
    concentricTo: 1,
    startsAt: "stretch",
    tint: { triceps: "primary", forearm: "secondary" },
    pose: (e) => {
      /* Top position = hands at the UPPER chest, forearms ~25° above
       * horizontal (device review 2026-09-02: at 108° the forearm sat
       * level with the elbow and the hands at the lower chest — a half
       * rep). Elbow flexion 120° from hanging → 10° at lockout. */
      const flex = lerp(120, 10, e); // folded at the chest → lockout
      const fore: Op[] = [
        { kind: "rotate", deg: -flex, pivot: SIDE_ANCHORS.elbow },
      ];
      return { foreArmL: fore, handL: fore, foreArmR: fore, handR: fore };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
  },

  dips: {
    view: "side",
    concentricTo: 0,
    // The whole figure hangs on the station: feet clear of the floor at
    // every frame, the floor line well below the tucked shins.
    viewBox: "-14 -6 184 218",
    groundY: 206,
    shadowCx: 52,
    shadowRx: 30,
    /* Catalogue: Pectorals | Triceps, Front Delts. It was INVERTED
     * (triceps primary) until the 2026-09-02 mechanics audit. */
    tint: {
      chest: "primary",
      triceps: "secondary",
      "front-deltoids": "secondary",
    },
    pose: (e) => {
      /* Side-view dip (2026-09-02, replaces the anterior version — the
       * owner's "looks bad"). From the front a dip is a figure bobbing
       * between two poles; the two things that make it a dip — the
       * forward lean and the elbows travelling BACK — live in the side
       * plane. Here the hand is pinned to the fixed grip, the shoulder
       * travels a solved path (straight-arm support at the top; at the
       * bottom the upper arm is horizontal pointing back with the
       * forearm vertical, i.e. the elbow at 90°), the trunk leans
       * further forward as it sinks (a chest dip), and the legs hang
       * with the knees tucked back so the feet stay clear of the floor.
       * Everything rides the shoulder: the body rotates about the
       * standing shoulder by the lean and translates to the solved
       * shoulder position, and the arm is aimed at the grip in pre-pose
       * space — same machinery as the bench. */
      const S0 = SIDE_ANCHORS.shoulder;
      const lean = lerp(12, 30, e);
      // Shoulder path: top = grip minus a near-straight arm angled a
      // touch behind the grip; bottom = elbow at 90° with the upper arm
      // horizontal and pointing back (the shoulder sits one upper-arm
      // length BEHIND and one forearm ABOVE the grip).
      /* Shoulder path. The hand is FIXED on the bar and the body hangs
         between the bars, so the shoulder can only go where the arm's
         two bones let it. Top: straight arm, shoulder just forward of
         the hand. Bottom: elbow ~90 degrees with the upper arm parallel
         to the floor, so the shoulder sits one upper-arm length FORWARD
         of the hand and one forearm length above it — down and forward,
         the chest dip.

         It used to sit one upper-arm length BEHIND the hand, so the
         whole body swung away from the station as it descended and the
         arm folded the wrong way round (owner, 2026-09-03: "arms are
         wrong way round, you can't physically do a dip like this, where
         your body moves away from the bars"). The mirror-image
         geometry was the actual bug; a later "fix" flipped the elbow
         branch to compensate and made a second wrong. */
      /* 0.995, not 0.97. The support position is a LOCKED arm — the
         exercise's own first instruction — and near full extension the
         cosine is flat enough that "97% of arm length" is not close to
         it: with a 36.02 upper and a 31.05 forearm, 0.97 of the span
         leaves the elbow at 152°, a visibly bent arm holding the top
         of a dip. 0.995 puts it at 172°. Same correction, same reason,
         as the overhead-press lockout (0.985 → 0.995, which was
         failing a 165° floor at 163.9°); it is the placard caption
         that surfaced it here, since a named position has to be the
         position it is named after. */
      const top: Pt = [
        DIP_GRIP[0] + 2,
        DIP_GRIP[1] - 0.995 * (SIDE_UPPER_LEN + SIDE_FORE_LEN),
      ];
      const bottom: Pt = [
        DIP_GRIP[0] + SIDE_UPPER_LEN * 0.8,
        DIP_GRIP[1] - SIDE_FORE_LEN * 0.85,
      ];
      const S: Pt = [lerp(top[0], bottom[0], e), lerp(top[1], bottom[1], e)];
      const bodyOps: Op[] = [
        { kind: "rotate", deg: lean, pivot: S0 },
        { kind: "translate", dx: S[0] - S0[0], dy: S[1] - S0[1] },
      ];
      // Gaze stays forward as the trunk leans.
      const headOps: Op[] = [
        { kind: "rotate", deg: -lean * HEAD_LIFT, pivot: SIDE_ANCHORS.neck },
        ...bodyOps,
      ];
      // Legs: hips a touch flexed, knees tucked back 90° so the shins
      // trail behind and the feet clear the floor.
      /* Legs hang. bodyOps rotates everything about the shoulder by the
         lean, which would sweep the legs 30 degrees BACK at the bottom
         — the trailing-legs look in the capture. Counter-rotate the
         thigh by the lean so it stays near vertical in world space,
         with a small forward tuck; the shin folds back under it. */
      const thighOps: Op[] = [
        { kind: "rotate", deg: -lean + 10, pivot: SIDE_ANCHORS.hip },
        ...bodyOps,
      ];
      const shankOps: Op[] = [
        { kind: "rotate", deg: 58, pivot: SIDE_ANCHORS.knee },
        { kind: "rotate", deg: -lean + 10, pivot: SIDE_ANCHORS.hip },
        ...bodyOps,
      ];
      // Aim the arm at the grip in pre-pose space.
      const gPre = applyToPoint(DIP_GRIP, [
        { kind: "translate", dx: S0[0] - S[0], dy: S0[1] - S[1] },
        { kind: "rotate", deg: -lean, pivot: S0 },
      ]);
      /* Of the two IK branches, the one that puts the elbow BEHIND the
         shoulder — over the hand. With the shoulder forward of the hand
         at the bottom, that is the forearm vertical down to the grip and
         the upper arm running back to the shoulder: "until upper arms
         are parallel to the floor". */
      const eA = solveElbow(S0, gPre, SIDE_UPPER_LEN, SIDE_FORE_LEN, 1);
      const eB = solveElbow(S0, gPre, SIDE_UPPER_LEN, SIDE_FORE_LEN, -1);
      const arm = aimArm(
        { S: S0, E: SIDE_ANCHORS.elbow, H: SIDE_ANCHORS.hand },
        eA[0] < eB[0] ? eA : eB,
        gPre,
        0
      );
      return {
        head: headOps,
        torso: bodyOps,
        pelvis: bodyOps,
        thighL: thighOps,
        thighR: thighOps,
        shankL: shankOps,
        shankR: shankOps,
        upperArmL: [...arm.upper, ...bodyOps],
        foreArmL: [...arm.fore, ...bodyOps],
        handL: [...arm.fore, ...bodyOps],
        upperArmR: [...arm.upper, ...bodyOps],
        foreArmR: [...arm.fore, ...bodyOps],
        handR: [...arm.fore, ...bodyOps],
      };
    },
    // The station in profile: the near bar runs front-to-back (so it
    // reads as a horizontal tube between its two posts), grip mid-bar.
    scene: () =>
      `<line x1="${DIP_GRIP[0] - 24}" y1="${DIP_GRIP[1]}" x2="${DIP_GRIP[0] - 24}" y2="205" stroke="${GEAR_DARK}" stroke-width="3.2"/>` +
      `<line x1="${DIP_GRIP[0] + 28}" y1="${DIP_GRIP[1]}" x2="${DIP_GRIP[0] + 28}" y2="205" stroke="${GEAR_DARK}" stroke-width="3.2"/>` +
      `<line x1="${DIP_GRIP[0] - 32}" y1="205" x2="${DIP_GRIP[0] + 36}" y2="205" stroke="${GEAR_DARK}" stroke-width="2.4" stroke-linecap="round"/>` +
      `<rect x="${DIP_GRIP[0] - 28}" y="${DIP_GRIP[1] - 1.7}" width="60" height="3.4" rx="1.7" fill="${GEAR}"/>` +
      `<line x1="-12" y1="206" x2="168" y2="206" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "db-curl": {
    /* Dumbbell curl: the strict curl with a bell at each hand instead of
     * a bar. In profile both bells stack behind the near one, end-on.
     * `hammer-curl` aliases here — the grip is neutral instead of
     * supinated, which a profile cannot show and which changes nothing
     * about the arc. */
    view: "side",
    equip: "dumbbell",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { biceps: "primary", forearm: "secondary" },
    pose: strictCurlPose,
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
  },

  "front-raise": {
    /* Front raise, in profile because the arc is in-plane: the arm
     * swings forward from the thigh to shoulder height with a slight
     * fixed elbow bend (instruction 2), the bell riding the hand. Torso
     * planted: "no swinging, no momentum". */
    view: "side",
    equip: "dumbbell",
    concentricTo: 1,
    startsAt: "stretch",
    viewBox: "-8 -14 132 224",
    tint: { "front-deltoids": "primary", chest: "secondary" },
    pose: (e) => {
      const raise = lerp(4, 88, e); // to shoulder height, not above
      const upper: Op[] = [
        { kind: "rotate", deg: -raise, pivot: SIDE_ANCHORS.shoulder },
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -10, pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
  },

  "overhead-extension": {
    /* Overhead triceps extension: upper arm vertical beside the ear and
     * held there (instruction 2), the forearm folding BEHIND the head
     * and extending to lockout. One bell in both hands, end-on. */
    view: "side",
    equip: "dumbbell",
    concentricTo: 1,
    startsAt: "stretch",
    viewBox: "-12 -50 128 260",
    tint: { triceps: "primary", "front-deltoids": "secondary" },
    pose: (e) => {
      const flex = lerp(-100, -8, e); // folded behind the head -> lockout
      const upper: Op[] = [
        { kind: "rotate", deg: 176, pivot: SIDE_ANCHORS.shoulder },
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: flex, pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
  },

  "tricep-kickback": {
    /* Kickback on the row's hinge. Upper arm held parallel to the floor
     * (instruction 2), the forearm extends back from 90 degrees to
     * straight. The far arm hangs as the support — the instruction has
     * the other hand on a bench. */
    view: "side",
    equip: "dumbbell",
    concentricTo: 1,
    startsAt: "stretch",
    viewBox: "-30 -6 160 218",
    tint: { triceps: "primary" },
    pose: (e) => {
      const HINGE = 55;
      const KNEE = 20;
      const LEAN = hipsBack(HINGE);
      const T: Op = { kind: "rotate", deg: HINGE, pivot: SIDE_ANCHORS.hip };
      const torso: Op[] = [T, LEAN];
      const head: Op[] = [
        { kind: "rotate", deg: -HINGE * HEAD_LIFT, pivot: SIDE_ANCHORS.neck },
        ...torso,
      ];
      const pelvis: Op[] = [
        { kind: "rotate", deg: HINGE * PELVIS_FOLLOW, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      const leg: Op[] = [
        { kind: "rotate", deg: KNEE, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      const shank: Op[] = [
        { kind: "rotate", deg: -KNEE, pivot: SIDE_ANCHORS.knee },
        { kind: "rotate", deg: KNEE, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      // Upper arm: from hanging in torso space to world-horizontal-back,
      // i.e. 90 minus the hinge past the torso's own line.
      const upper: Op[] = [
        { kind: "rotate", deg: 90 - HINGE + 2, pivot: SIDE_ANCHORS.shoulder },
        ...torso,
      ];
      const ext = lerp(-90, -4, e); // forearm hangs -> in line with the upper arm
      const fore: Op[] = [
        { kind: "rotate", deg: ext, pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      // Support arm: reaches forward-down to the bench the instruction
      // puts the other hand on (drawn under it by `scene`). Angled ahead
      // of the near thigh so it is not painted behind it and left as a
      // floating hand.
      const support: Op[] = [
        { kind: "rotate", deg: -HINGE - 22, pivot: SIDE_ANCHORS.shoulder },
        ...torso,
      ];
      return {
        head,
        torso,
        pelvis,
        thighL: leg,
        thighR: leg,
        shankL: shank,
        shankR: shank,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: support,
        foreArmR: support,
        handR: support,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    // The bench the support hand rests on: a pad just under that hand,
    // with a leg to the floor.
    scene: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, [
        ...(pose.handR ?? []),
        { kind: "translate", dx: FAR_ARM_SHIFT[0], dy: FAR_ARM_SHIFT[1] },
      ]);
      const top = h[1] + 4;
      return (
        `<rect x="${(h[0] - 16).toFixed(1)}" y="${top.toFixed(1)}" width="34" height="6" rx="2.2" fill="${GEAR}"/>` +
        `<line x1="${(h[0] - 10).toFixed(1)}" y1="${(top + 6).toFixed(1)}" x2="${(h[0] - 10).toFixed(1)}" y2="204" stroke="${GEAR_DARK}" stroke-width="3"/>` +
        `<line x1="${(h[0] + 12).toFixed(1)}" y1="${(top + 6).toFixed(1)}" x2="${(h[0] + 12).toFixed(1)}" y2="204" stroke="${GEAR_DARK}" stroke-width="3"/>` +
        `<line x1="-26" y1="205" x2="126" y2="205" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },

  "skull-crushers": {
    /* Skull crushers on the bench chain: lying, upper arms tilted a
     * touch back toward the head and HELD there (instruction 4), the
     * forearms fold the bar past the forehead and extend to lockout. */
    view: "side",
    equip: "plate-end",
    plateR: 9,
    concentricTo: 1,
    startsAt: "stretch",
    viewBox: "-64 20 186 162",
    groundY: 172,
    shadowCx: 40,
    shadowRx: 68,
    tint: { triceps: "primary" },
    pose: (e) => {
      const G: Op = { kind: "rotate", deg: -90, pivot: [44, 100] };
      const leg: Op[] = [
        { kind: "rotate", deg: BENCH_THIGH, pivot: SIDE_ANCHORS.hip },
        G,
      ];
      const shank: Op[] = [
        { kind: "rotate", deg: 90 - BENCH_THIGH, pivot: SIDE_ANCHORS.knee },
        { kind: "rotate", deg: BENCH_THIGH, pivot: SIDE_ANCHORS.hip },
        G,
      ];
      // In body space the arm rests along +y; "up" on screen is body +x,
      // so a -90 rotation points it up, and a further -12 tilts it toward
      // the head.
      const upper: Op[] = [
        { kind: "rotate", deg: -102, pivot: SIDE_ANCHORS.shoulder },
        G,
      ];
      const flex = lerp(-100, -6, e); // folded toward the forehead -> lockout
      const fore: Op[] = [
        { kind: "rotate", deg: flex, pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        head: [G],
        torso: [G],
        pelvis: [G],
        thighL: leg,
        thighR: leg,
        shankL: shank,
        shankR: shank,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () =>
      `<rect x="-64" y="109" width="136" height="7" rx="2.5" fill="${GEAR}"/>` +
      `<line x1="-50" y1="116" x2="-50" y2="170" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
      `<line x1="56" y1="116" x2="56" y2="170" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
      `<line x1="-58" y1="171" x2="118" y2="171" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  lunges: {
    /* Lunge in profile — the one view that shows a split stance. The
     * rep is the lunge itself (bottom <-> split-stance top), not the
     * step: both knees to about 90 degrees, back knee toward the floor,
     * torso upright, dumbbells hanging. `bodyweight-lunge` aliases here
     * gear-free; `walking-dumbbell-lunges` aliases here as-is. */
    view: "side",
    equip: "dumbbell",
    concentricTo: 0,
    viewBox: "-40 -6 176 218",
    groundY: 205,
    shadowCx: 44,
    shadowRx: 44,
    tint: {
      quadriceps: "primary",
      gluteal: "secondary",
      hamstring: "secondary",
    },
    pose: (e) => {
      const c = lungeChain(e);
      const armHang: Op[] = [...c.body];
      return {
        head: c.body,
        torso: c.body,
        pelvis: c.body,
        thighL: c.frontThigh,
        shankL: c.frontShank,
        thighR: c.backThigh,
        shankR: c.backShank,
        upperArmL: armHang,
        foreArmL: armHang,
        handL: armHang,
        upperArmR: armHang,
        foreArmR: armHang,
        handR: armHang,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () =>
      `<line x1="-36" y1="206" x2="132" y2="206" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "incline-bench": {
    view: "side",
    equip: "plate-end",
    plateR: 10,
    concentricTo: 1,
    viewBox: "-76 -4 194 184",
    groundY: SUPINE_FLOOR,
    shadowCx: 20,
    shadowRx: 64,
    tint: {
      chest: "primary",
      triceps: "secondary",
      "front-deltoids": "secondary",
    },
    pose: inclinePressPose,
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: inclineScene,
  },

  "incline-db-press": {
    /* The incline press with a bell in each hand — both stack end-on in
     * profile. Instruction 3's "up and slightly in until they nearly
     * touch" is the one thing the profile cannot show. */
    view: "side",
    equip: "dumbbell",
    concentricTo: 1,
    viewBox: "-76 -4 194 184",
    groundY: SUPINE_FLOOR,
    shadowCx: 20,
    shadowRx: 64,
    tint: {
      chest: "primary",
      triceps: "secondary",
      "front-deltoids": "secondary",
    },
    pose: inclinePressPose,
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: inclineScene,
  },

  "glute-bridge": {
    /* Lying on the floor, knees bent, feet flat: the hips drive up until
     * shoulders, hips and knees line up (instruction 3), then lower. */
    view: "side",
    concentricTo: 1,
    startsAt: "stretch",
    viewBox: "-64 40 186 142",
    groundY: SUPINE_FLOOR,
    shadowCx: 30,
    shadowRx: 60,
    tint: { gluteal: "primary", hamstring: "secondary", abs: "secondary" },
    pose: (e) => {
      const c = supineHinge(e, SUPINE_FLOOR - 9, 0, -31);
      const arms: Op[] = [...c.torso.slice(0, 2)]; // lie flat beside the body
      return {
        head: c.head,
        torso: c.torso,
        pelvis: c.torso,
        thighL: c.leg.thigh,
        thighR: c.leg.thigh,
        shankL: c.leg.shank,
        shankR: c.leg.shank,
        upperArmL: arms,
        foreArmL: arms,
        handL: arms,
        upperArmR: arms,
        foreArmR: arms,
        handR: arms,
      };
    },
    scene: () =>
      `<line x1="-58" y1="${SUPINE_FLOOR}" x2="118" y2="${SUPINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "hip-thrust": {
    /* The bridge with the upper back on a bench and a loaded bar over
     * the hips (instruction 2). The bar rides the hip: it is drawn AT
     * the hip anchor every frame. */
    view: "side",
    equip: "plate-end",
    plateR: 13,
    concentricTo: 1,
    startsAt: "stretch",
    viewBox: "-64 20 186 162",
    groundY: SUPINE_FLOOR,
    shadowCx: 30,
    shadowRx: 60,
    tint: { gluteal: "primary", hamstring: "secondary", abs: "secondary" },
    pose: (e) => {
      /* From hips just off the floor (18 degrees down about the
         shoulder) to the torso horizontal — shoulders, hips and knees
         in a line, which is the thrust's instruction 3. */
      const c = supineHinge(e, SUPINE_FLOOR - 48, 40, -2);
      return {
        head: c.head,
        torso: c.torso,
        pelvis: c.torso,
        thighL: c.leg.thigh,
        thighR: c.leg.thigh,
        shankL: c.leg.shank,
        shankR: c.leg.shank,
        upperArmL: c.torso,
        foreArmL: c.torso,
        handL: c.torso,
        upperArmR: c.torso,
        foreArmR: c.torso,
        handR: c.torso,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(
        [SIDE_ANCHORS.hip[0] + 8, SIDE_ANCHORS.hip[1] - 6],
        pose.pelvis ?? []
      );
      return [h, h];
    },
    // Bench at shin height, so the top position lines shoulders, hips
    // and knees up — a low bench leaves the knees above the hips.
    scene: () =>
      `<rect x="-64" y="${SUPINE_FLOOR - 46}" width="48" height="7" rx="2.5" fill="${GEAR}"/>` +
      `<line x1="-50" y1="${SUPINE_FLOOR - 39}" x2="-50" y2="${SUPINE_FLOOR - 1}" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
      `<line x1="-26" y1="${SUPINE_FLOOR - 39}" x2="-26" y2="${SUPINE_FLOOR - 1}" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
      `<line x1="-58" y1="${SUPINE_FLOOR}" x2="118" y2="${SUPINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "bulgarian-split": {
    /* The lunge chain with the back foot up on a bench (instruction 1);
     * the front leg does the work. */
    view: "side",
    equip: "dumbbell",
    concentricTo: 0,
    viewBox: "-40 -6 176 218",
    groundY: 205,
    shadowCx: 60,
    shadowRx: 34,
    tint: {
      quadriceps: "primary",
      gluteal: "secondary",
      hamstring: "secondary",
    },
    pose: (e) => {
      const c = lungeChain(e, [4, 174]);
      return {
        head: c.body,
        torso: c.body,
        pelvis: c.body,
        thighL: c.frontThigh,
        shankL: c.frontShank,
        thighR: c.backThigh,
        shankR: c.backShank,
        upperArmL: c.body,
        foreArmL: c.body,
        handL: c.body,
        upperArmR: c.body,
        foreArmR: c.body,
        handR: c.body,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () =>
      `<rect x="-24" y="180" width="40" height="6" rx="2.2" fill="${GEAR}"/>` +
      `<line x1="-18" y1="186" x2="-18" y2="204" stroke="${GEAR_DARK}" stroke-width="3"/>` +
      `<line x1="10" y1="186" x2="10" y2="204" stroke="${GEAR_DARK}" stroke-width="3"/>` +
      `<line x1="-36" y1="206" x2="132" y2="206" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  deadlift: {
    view: "side",
    equip: "plate-end",
    plateR: 16,
    concentricTo: 0,
    startsAt: "stretch",
    // Wider left margin than the RDL: the deep-hinge hips travel far
    // enough back that the glutes cross x=0.
    viewBox: "-18 -2 186 212",
    groundY: 204,
    shadowCx: 58,
    shadowRx: 44,
    /* Catalogue: Full Back | Glutes, Hamstrings, Core, Traps. The hinge
     * movers carry the emphasis; erectors and traps (isometric holds)
     * read secondary. Forearm dropped — not in the catalogue. */
    tint: {
      hamstring: "primary",
      gluteal: "primary",
      "lower-back": "secondary",
      trapezius: "secondary",
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
      /* Execution sequencing (2026-09-02 mechanics pass). A deadlift is
       * not one blended motion: the descent pushes the hips BACK first
       * (it is an RDL until the bar passes the knees) and only then
       * bends the knees to reach the bar; the pull mirrors it — the legs
       * drive first while the back angle holds, then the hips come
       * through. One shared easing lerped every joint in lockstep, which
       * read as a squat/hinge hybrid. The hinge leads (done by e=0.8),
       * the knees trail (start at e=0.3). Same end poses as before, so
       * the bottom-frame pins are untouched. */
      return hingeLift(
        smooth(e / 0.8),
        smooth((e - 0.3) / 0.7),
        70,
        -64,
        8,
        lerp(8, -5, e)
      );
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
    startsAt: "stretch",
    // Hanging scene: bar overhead, body travels ~25 units, floor just
    // below the dangling heels at the dead hang.
    viewBox: "-20 -24 140 254",
    groundY: 226,
    /* Catalogue: Lats | Biceps, Rear Delts, Core. Rear delts are
     * drawable from behind (traps were not what the catalogue names);
     * biceps are not visible from behind, so the grip's forearm stands
     * in for the arm's share. */
    tint: {
      "upper-back": "primary",
      "back-deltoids": "secondary",
      forearm: "secondary",
    },
    pose: (e) => {
      /* Both ends of each arm are constrained — hands stay ON the bar
       * while the body rises — so the elbows are IK-solved. The solution
       * naturally produces the real silhouette: straight-arm hang at the
       * bottom, wide "W" flare (elbows out at ear height) at the top. */
      /* Hang depth. Was 1, which straightened a 61.68-unit arm; the
       * corrected forearm makes it 65.95, so at 1 the dead hang kept a
       * 43° bend — a shrugged hang, not a dead one. 5 puts the bottom
       * frame at 99% extension. */
      /* -33, not -24. The comment already claimed "chin over the bar"
         and the chin finished 8 units BELOW it — instruction 3 is "pull
         your chest toward the bar until your chin clears it". */
      const dy = lerp(5, -33, e);
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
    startsAt: "stretch",
    viewBox: "-20 -20 140 246",
    tint: {
      "upper-back": "primary",
      "back-deltoids": "secondary",
      forearm: "secondary",
    },
    pose: (e) => {
      /* Body stays put; the bar travels from full overhead reach down to
       * the collarbone while the elbows tuck in to the sides — the same
       * IK machinery as the pull-up with the constraints swapped. */
      /* Top of the stroke re-fitted for the corrected arm: -14.5 left
       * the fully-reached position 43° short of straight. */
      /* Bottom of the stroke at the UPPER CHEST (y 58), not the
       * collarbone (50): from behind, a bar at 50 showed through the
       * neck gap between the head and the traps, as if it passed
       * through the throat (2026-09-02 review). At 58 the upper back
       * occludes the shaft and only the ends + fists show beside the
       * shoulders — what a pulldown looks like from behind. */
      const hl: Pt = [lerp(12.2, 6, e), lerp(-17.7, 58, e)];
      const hr: Pt = [lerp(87.8, 94, e), lerp(-17.7, 58, e)];
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
      const y = lerp(-17.7, 58, e);
      return [
        [lerp(12.2, 6, e) - 10, y],
        [lerp(87.8, 94, e) + 10, y],
      ];
    },
  },

  "lateral-raise": {
    view: "anterior",
    /* With fists on the figure, a hand gripping visible air reads
     * worse than the stump did — and this is the most-served demo id
     * in the templates. End-on bells: see `dumbbell` in bodyProps for
     * why a front view genuinely cannot show a dumbbell any other
     * way. */
    equip: "dumbbell",
    concentricTo: 1,
    startsAt: "stretch",
    // A raise at full span is nearly two arm-lengths wide — this is the
    // one movement whose envelope genuinely needs a wider canvas, and
    // the bells (r 5.5 past the wrists at full abduction) push it
    // wider still.
    viewBox: "-44 -14 188 224",
    /* Catalogue: Side Delts | Traps. The anterior figure has ONE
     * deltoid facet and NO trapezius polygon (traps are posterior art
     * only — the tint-honesty pin caught the attempt), so the raise
     * lights the deltoid alone. `neck` was an invented tint (the same
     * one the press dropped). */
    tint: { "front-deltoids": "primary" },
    pose: (e) => {
      // Whole arm sweeps out to shoulder height (proper form stops at
      // parallel); a constant soft elbow bend so the arm never reads
      // hyper-straight, hands trailing slightly under the elbows.
      // 72, not 78: the rest arm already sits ~10° outside vertical, so
      // 78 finished ABOVE parallel — a form error the demo was teaching.
      const arm = lerp(4, 72, e);
      /* The girdle rises here too, at roughly half the press's figure:
       * abduction to parallel is ~30° of scapular rotation against the
       * press's ~57°, so ~1.7 units of acromion travel. */
      const lift: Op = { kind: "translate", dx: 0, dy: -1.7 * e };
      return {
        upperArmL: [{ kind: "rotate", deg: arm, pivot: ANT.shoulderL }, lift],
        foreArmL: [
          { kind: "rotate", deg: -10, pivot: ANT.elbowL },
          { kind: "rotate", deg: arm, pivot: ANT.shoulderL },
          lift,
        ],
        upperArmR: [{ kind: "rotate", deg: -arm, pivot: ANT.shoulderR }, lift],
        foreArmR: [
          { kind: "rotate", deg: 10, pivot: ANT.elbowR },
          { kind: "rotate", deg: -arm, pivot: ANT.shoulderR },
          lift,
        ],
      };
    },
    /* Bells sit IN the solved fists — same ops as the forearms, so
     * they ride the raise (and the girdle lift) by construction. */
    bar: (_e, pose) => [
      applyToPoint(ANT.handL, pose.foreArmL ?? []),
      applyToPoint(ANT.handR, pose.foreArmR ?? []),
    ],
  },

  "calf-raise": {
    view: "side",
    concentricTo: 1,
    startsAt: "stretch",
    viewBox: "-4 -2 172 220",
    groundY: CALF_FLOOR,
    shadowCx: 56,
    shadowRx: 24,
    tint: { calves: "primary" },
    pose: (e) => {
      /* Side view (2026-09-02, replaces the anterior version whose
       * 6.5-unit vertical rise was invisible at card scale — the
       * evaluation's "nothing happens" grade). Toes on a block: the
       * shank+foot piece pitches about the BALL of the foot, so the
       * heel drops below the block edge at the bottom and lifts clear
       * of it at the top — the one cue that says calf raise. The
       * thigh and everything above translate with the knee (the thigh
       * stays vertical; the shin's forward lean is the knee travelling
       * over the toes, which a raise on a block really does). */
      const { legOps, rise } = calfRise(e);
      return {
        shankL: legOps,
        shankR: legOps,
        thighL: rise,
        thighR: rise,
        pelvis: rise,
        torso: rise,
        head: rise,
        upperArmL: rise,
        foreArmL: rise,
        handL: rise,
        upperArmR: rise,
        foreArmR: rise,
        handR: rise,
      };
    },
    // The block under the toes + the floor below it.
    scene: () =>
      `<rect x="52" y="${CALF_BLOCK_TOP}" width="26" height="${CALF_FLOOR - CALF_BLOCK_TOP}" rx="1.5" fill="${GEAR}"/>` +
      `<line x1="-2" y1="${CALF_FLOOR}" x2="166" y2="${CALF_FLOOR}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
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
      /* The top of this path used to stop at hypot(50, 8) = 50.64 on a
       * 55.07-unit arm, leaving the elbow 46° short of straight at the
       * frame labelled lockout — while instruction 4 says "drive the bar
       * up and slightly back over your shoulders to FULL lockout".
       * hypot(54.2, 8) = 54.79 is 99.5% of reach, which two-bone IK
       * renders as a ~12° soft lock: straight to the eye, not
       * hyperextended. Same ceiling rule as the press — stay under
       * 55.07 or the solve clamps instead of failing. */
      const H: Pt = [S[0] + lerp(30, BENCH_LOCKOUT, e), S[1] + lerp(16, 4, e)];
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
        { kind: "rotate", deg: BENCH_THIGH, pivot: SIDE_ANCHORS.hip },
        G,
      ];
      const shank: Op[] = [
        { kind: "rotate", deg: 90 - BENCH_THIGH, pivot: SIDE_ANCHORS.knee },
        { kind: "rotate", deg: BENCH_THIGH, pivot: SIDE_ANCHORS.hip },
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
        upperArmR: [...arm.upper, G],
        foreArmR: [...arm.fore, G],
        handR: [...arm.fore, G],
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: flatBenchScene,
  },

  "barbell-row": {
    view: "side",
    equip: "plate-end",
    concentricTo: 1,
    startsAt: "stretch",
    viewBox: "-4 38 172 174",
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
      // Dead hang at ~91% of reach, lower ribs at the top.
      const hFinal: Pt = [
        S[0] + 1,
        /* 0.30, not 0.48: at 0.48 the bar finished level with the HIP
           (y 92.5 against a hip at 98.8 and a shoulder at 60.7), while
           instruction 3 says "row the bar to your lower chest". */
        lerp(S[1] + STRAIGHT_ARM * 0.91, S[1] + STRAIGHT_ARM * 0.3, e),
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
        head: [
          { kind: "rotate", deg: -HINGE * HEAD_LIFT, pivot: SIDE_ANCHORS.neck },
          T,
          LEAN,
        ],
        torso: [T, LEAN],
        pelvis: [
          {
            kind: "rotate",
            deg: HINGE * PELVIS_FOLLOW,
            pivot: SIDE_ANCHORS.hip,
          },
          LEAN,
        ],
        thighL: leg,
        thighR: leg,
        shankL: shank,
        shankR: shank,
        upperArmL: [...arm.upper, T, LEAN],
        foreArmL: [...arm.fore, T, LEAN],
        handL: [...arm.fore, T, LEAN],
        upperArmR: [...arm.upper, T, LEAN],
        foreArmR: [...arm.fore, T, LEAN],
        handR: [...arm.fore, T, LEAN],
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
    /* Catalogue: Hamstrings | Glutes, Lower Back, Traps. */
    tint: {
      hamstring: "primary",
      gluteal: "primary",
      "lower-back": "secondary",
      trapezius: "secondary",
    },
    pose: (e) => {
      /* The RDL is THE hinge: the torso rotates about the hip while the
       * arms hang plumb and the knees stay soft — the exact motion the
       * old posterior-compression stand-in could only fake. Same
       * pre-hinge aiming pattern as the row, but here the hinge itself
       * is the animation. */
      const hinge = lerp(0, 68, e);
      const KNEE = 15; // constant in every frame — the RDL signature
      const LEAN = hipsBack(hinge); // balance rule: hips travel back
      const T: Op = { kind: "rotate", deg: hinge, pivot: SIDE_ANCHORS.hip };
      const unpose: Op[] = [
        { kind: "rotate", deg: -LEAN.deg, pivot: LEAN.pivot },
        { kind: "rotate", deg: -hinge, pivot: SIDE_ANCHORS.hip },
      ];
      // Arms hang plumb from the hinged+leaned shoulder — the bar stays
      // against the legs on the way down.
      const S = applyToPoint(SIDE_ANCHORS.shoulder, [T, LEAN]);
      /* The bar slides DOWN THE LEGS: plumb hands hang forward of the
       * shins once the shoulders travel forward, so the grip is pulled
       * back toward the thigh/shin as the hinge deepens (lats hold the
       * bar in). */
      const hPre = applyToPoint(
        [S[0] + lerp(1.2, -5, e), S[1] + STRAIGHT_ARM],
        unpose
      );
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
        head: [
          { kind: "rotate", deg: -hinge * HEAD_LIFT, pivot: SIDE_ANCHORS.neck },
          T,
          LEAN,
        ],
        torso: [T, LEAN],
        pelvis: [
          {
            kind: "rotate",
            deg: hinge * PELVIS_FOLLOW,
            pivot: SIDE_ANCHORS.hip,
          },
          LEAN,
        ],
        thighL: leg,
        thighR: leg,
        shankL: shank,
        shankR: shank,
        upperArmL: [...arm.upper, T, LEAN],
        foreArmL: [...arm.fore, T, LEAN],
        handL: [...arm.fore, T, LEAN],
        upperArmR: [...arm.upper, T, LEAN],
        foreArmR: [...arm.fore, T, LEAN],
        handR: [...arm.fore, T, LEAN],
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
    /* Catalogue: Pectorals | Triceps, Front Delts, Core. */
    tint: {
      chest: "primary",
      triceps: "secondary",
      "front-deltoids": "secondary",
      abs: "secondary",
    },
    pose: (e) => {
      /* Prone plank (global +90, face down, head right), tilted about
       * the planted hands so the toes meet the floor, then the whole
       * body pivots about the TOES as the chest drops — hands stay
       * planted, elbows IK-solved toward the feet. */
      const TILT: Op = { kind: "rotate", deg: PU_TILT, pivot: PU_TOE_G };
      const beta = lerp(0, 9.5, e);
      const B: Op = { kind: "rotate", deg: beta, pivot: PUSHUP_TOE };
      const bodyOps: Op[] = [PU_G, TILT, PU_SHIFT, B];
      // Map the fixed hand plant back to standing space for the aim.
      const hPre = applyToPoint(PUSHUP_HAND, [
        { kind: "rotate", deg: -beta, pivot: PUSHUP_TOE },
        { kind: "translate", dx: 0, dy: -PU_SHIFT.dy },
        { kind: "rotate", deg: -PU_TILT, pivot: PU_TOE_G },
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
        handL: [...arm.fore, ...bodyOps],
        upperArmR: [...arm.upper, ...bodyOps],
        foreArmR: [...arm.fore, ...bodyOps],
        handR: [...arm.fore, ...bodyOps],
      };
    },
    scene: () =>
      `<line x1="-70" y1="158.5" x2="120" y2="158.5" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  /* ── 2026-09-03 build-out, batch 3: cables and seated machines ── */

  "cable-curl": {
    /* The strict curl's arc, on a LOW pulley: "stand facing a low cable
     * pulley ... elbows pinned ... curl the bar up toward your
     * shoulders". Same pose as the barbell curl (the elbow does the
     * same thing whatever is in the hand); what differs is the gear,
     * and the tip is about the gear — "step back until there's tension
     * through the whole rep" — so the cable is drawn taut from the floor
     * pulley to the grip every frame. */
    view: "side",
    equip: "cable-handle",
    pulley: [106, 190],
    viewBox: "-12 -6 152 218",
    groundY: 204,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { biceps: "primary", forearm: "secondary" },
    pose: strictCurlPose,
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () => cableStationScene(110, -6),
  },

  "straight-arm-pulldown": {
    /* "Stand facing a high pulley, grip the bar with straight arms,
     * hinge slightly forward. Lock your elbows into a soft, fixed bend
     * ... Pull the bar down in an arc to your thighs ... return to a
     * full overhead stretch." A 20-degree hinge held throughout, the
     * arm swinging about the SHOULDER from overhead-forward to the
     * front of the thigh with the elbow's 12 degrees never changing —
     * the fixed-bend cue is the whole exercise, so it is pinned. */
    view: "side",
    equip: "cable-handle",
    pulley: [134, -30],
    viewBox: "-12 -36 160 248",
    groundY: 204,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { "upper-back": "primary", triceps: "secondary" },
    pose: (e) => {
      const HINGE = 20;
      const LEAN = hipsBack(HINGE);
      const torso: Op[] = [
        { kind: "rotate", deg: HINGE, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      const head: Op[] = [
        { kind: "rotate", deg: -HINGE * HEAD_LIFT, pivot: SIDE_ANCHORS.neck },
        ...torso,
      ];
      const pelvis: Op[] = [
        { kind: "rotate", deg: HINGE * PELVIS_FOLLOW, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      const leg: Op[] = [LEAN];
      // Overhead-forward at the stretch, back against the thigh at the
      // finish (the torso leans 20, so the hanging arm has to angle a
      // little BACK in torso space to meet the thigh front).
      const swing = lerp(-145, -5, e);
      const upper: Op[] = [
        { kind: "rotate", deg: swing, pivot: SIDE_ANCHORS.shoulder },
        ...torso,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -12, pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        head,
        torso,
        pelvis,
        thighL: leg,
        thighR: leg,
        shankL: leg,
        shankR: leg,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () => cableStationScene(138, -36),
  },

  "face-pulls": {
    /* "Set a rope at or slightly above face height ... arms extended
     * straight toward the pulley. Pull the rope toward your face,
     * separating the ends past your ears ... elbows high throughout."
     * The pulley sits at eye level in front; the upper arm stays at the
     * shoulder line (elbows high is the cue the tip repeats — "pulling
     * low turns it into a row") while the forearm folds 145 degrees so
     * the hand finishes beside the eyes. The rope is the pushdown's
     * rope with its pulley moved: strands open with the pull. */
    view: "side",
    equip: "rope",
    pulley: [128, 14],
    viewBox: "-12 -14 156 226",
    groundY: 204,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { "upper-back": "primary", trapezius: "secondary" },
    pose: (e) => {
      // Straight out toward the pulley; the elbow ends a touch behind
      // horizontal as the blades pull together.
      const upper: Op[] = [
        {
          kind: "rotate",
          deg: lerp(-98, -100, e),
          pivot: SIDE_ANCHORS.shoulder,
        },
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -lerp(0, 108, e), pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () => cableStationScene(132, -14),
  },

  "seated-row": {
    /* "Sit with feet braced, knees softly bent, torso upright ... pull
     * the handle to your lower ribs, elbows tracking close to your
     * body. Extend your arms slowly without letting your lower back
     * round." The hips sit on a low bench with the legs stretched to a
     * footplate, the torso stays VERTICAL at both ends (the tip: "keep
     * your chest tall and still" — no rocking), and the hand travels a
     * straight line from full reach to the lower ribs with the elbow
     * solved BEHIND the trunk. Cable from a chest-height pulley at the
     * footplate end. */
    view: "side",
    equip: "cable-handle",
    pulley: [140, 96],
    viewBox: "-12 -6 164 218",
    groundY: 204,
    shadowCx: 70,
    shadowRx: 40,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      "upper-back": "primary",
      biceps: "secondary",
      trapezius: "secondary",
    },
    pose: (e) => {
      const seat = ROW_SEAT;
      const chain = seatedChain(seat, -70, 26, 0);
      const S = SIDE_ANCHORS.shoulder;
      // Body-space hand path: full reach forward-and-down, to the lower
      // ribs (just ahead of the torso front, a hand below the chest).
      const H: Pt = [
        lerp(S[0] + 63, S[0] + 12, e),
        lerp(S[1] + 22, S[1] + 26, e),
      ];
      const E = solveElbow(S, H, SIDE_UPPER_LEN, SIDE_FORE_LEN, -1);
      const arm = aimArm(
        { S, E: SIDE_ANCHORS.elbow, H: SIDE_ANCHORS.hand },
        E,
        H,
        0
      );
      return {
        head: chain.head,
        torso: chain.torso,
        pelvis: chain.body,
        thighL: chain.thigh,
        thighR: chain.thigh,
        shankL: chain.shank,
        shankR: chain.shank,
        upperArmL: [...arm.upper, ...chain.body],
        foreArmL: [...arm.fore, ...chain.body],
        handL: [...arm.fore, ...chain.body],
        upperArmR: [...arm.upper, ...chain.body],
        foreArmR: [...arm.fore, ...chain.body],
        handR: [...arm.fore, ...chain.body],
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: (_e, pose) => {
      const seat = ROW_SEAT;
      const a = applyToPoint(SIDE_ANCHORS.ankle, pose.shankL ?? []);
      return (
        // Low bench under the hips, the footplate the feet brace on,
        // the station's post at the pulley, and the floor.
        `<rect x="${(seat[0] - 24).toFixed(1)}" y="${(seat[1] + 6).toFixed(1)}" width="50" height="8" rx="2.6" fill="${GEAR}"/>` +
        `<line x1="${seat[0]}" y1="${(seat[1] + 14).toFixed(1)}" x2="${seat[0]}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
        `<rect x="${(a[0] + 8).toFixed(1)}" y="${(a[1] - 14).toFixed(1)}" width="6" height="26" rx="2" fill="${GEAR}" transform="rotate(-16 ${(a[0] + 11).toFixed(1)} ${(a[1] - 1).toFixed(1)})"/>` +
        cableStationScene(144, 40)
      );
    },
  },

  "leg-extension": {
    /* "Sit in the machine ... pad on your shins, just above the ankle
     * ... hips pressed into the seat. Extend your legs smoothly until
     * they're fully straight." The seated chain with the thigh along
     * the seat: the shank swings about the knee from hanging (knee at
     * 90) to in line with the thigh (fully straight — pinned), the hip
     * never moving. The roller rides the shin and the lever follows it
     * from the knee, so the machine is drawn FROM the leg. */
    view: "side",
    viewBox: "-12 -6 172 218",
    groundY: 204,
    shadowCx: 62,
    shadowRx: 36,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { quadriceps: "primary" },
    pose: (e) => {
      const chain = seatedChain(MACHINE_SEAT, -86, lerp(80, 0, e), -12);
      return {
        head: chain.head,
        torso: chain.torso,
        pelvis: chain.body,
        thighL: chain.thigh,
        thighR: chain.thigh,
        shankL: chain.shank,
        shankR: chain.shank,
        upperArmL: chain.arm.upper,
        foreArmL: chain.arm.fore,
        handL: chain.arm.fore,
        upperArmR: chain.arm.upper,
        foreArmR: chain.arm.fore,
        handR: chain.arm.fore,
      };
    },
    scene: (_e, pose) =>
      machineSeatScene(MACHINE_SEAT, -12) + shankPad(pose, 1),
  },

  "seated-leg-curl": {
    /* "Sit with the thigh pad pinning your legs and the ankle pad on
     * your lower calves ... curl your legs down and back by driving the
     * heels toward the floor." The extension's chain run the other way:
     * the leg starts STRAIGHT out along the seat (the hamstring's
     * stretch — where the rep begins) and curls under to past 90, hips
     * pinned. Roller behind the calf, and the thigh pad the
     * instruction names sits over the knee. */
    view: "side",
    viewBox: "-12 -6 172 218",
    groundY: 204,
    shadowCx: 62,
    shadowRx: 36,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { hamstring: "primary", calves: "secondary" },
    pose: (e) => {
      const chain = seatedChain(MACHINE_SEAT, -86, lerp(2, 100, e), -12);
      return {
        head: chain.head,
        torso: chain.torso,
        pelvis: chain.body,
        thighL: chain.thigh,
        thighR: chain.thigh,
        shankL: chain.shank,
        shankR: chain.shank,
        upperArmL: chain.arm.upper,
        foreArmL: chain.arm.fore,
        handL: chain.arm.fore,
        upperArmR: chain.arm.upper,
        foreArmR: chain.arm.fore,
        handR: chain.arm.fore,
      };
    },
    scene: (_e, pose) => {
      const k = applyToPoint(SIDE_ANCHORS.knee, pose.thighL ?? []);
      return (
        machineSeatScene(MACHINE_SEAT, -12) +
        // Thigh pad: a roller pinning the leg just behind the knee.
        `<circle cx="${(k[0] - 12).toFixed(1)}" cy="${(k[1] - 12).toFixed(1)}" r="5.2" fill="${GEAR}" stroke="${GEAR_EDGE}" stroke-width="0.8"/>` +
        shankPad(pose, -1)
      );
    },
  },

  /* ── 2026-09-03 build-out, batch 4: pads, sleds, a rack ── */

  "preacher-curl": {
    /* "Sit at the preacher bench with your upper arms flat on the pad
     * ... curl the bar up to shoulder height without shrugging. Lower
     * slowly to just short of full extension." The upper arm is FIXED
     * on a 45-degree pad (pinned: it does not move), the forearm curls
     * from just-short-of-straight to the shoulder, hips on the seat,
     * feet flat. The pad is drawn under the upper arm from the solved
     * elbow. */
    view: "side",
    equip: "plate-end",
    plateR: 10,
    viewBox: "-12 -6 152 218",
    groundY: 204,
    shadowCx: 60,
    shadowRx: 36,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { biceps: "primary", forearm: "secondary" },
    pose: (e) => {
      const chain = seatedChain(PREACHER_SEAT, -80, 80, 4);
      const upper: Op[] = [
        { kind: "rotate", deg: PREACHER_PAD_DEG, pivot: SIDE_ANCHORS.shoulder },
        ...chain.torso,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -lerp(14, 125, e), pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        head: chain.head,
        torso: chain.torso,
        pelvis: chain.body,
        thighL: chain.thigh,
        thighR: chain.thigh,
        shankL: chain.shank,
        shankR: chain.shank,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: (_e, pose) => {
      const S = applyToPoint(SIDE_ANCHORS.shoulder, pose.upperArmL ?? []);
      const E = applyToPoint(SIDE_ANCHORS.elbow, pose.upperArmL ?? []);
      // Pad: along the upper arm, just under it, from the armpit past
      // the elbow; a post from the pad to the floor; the seat.
      const ang = (Math.atan2(E[1] - S[1], E[0] - S[0]) * 180) / Math.PI;
      return (
        `<rect x="${(S[0] + 6).toFixed(1)}" y="${(S[1] + 6).toFixed(1)}" width="46" height="8" rx="2.6" fill="${GEAR}" transform="rotate(${ang.toFixed(1)} ${(S[0] + 6).toFixed(1)} ${(S[1] + 6).toFixed(1)})"/>` +
        `<line x1="${(E[0] + 6).toFixed(1)}" y1="${(E[1] + 8).toFixed(1)}" x2="${(E[0] + 6).toFixed(1)}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
        `<rect x="${(PREACHER_SEAT[0] - 22).toFixed(1)}" y="${(PREACHER_SEAT[1] + 6).toFixed(1)}" width="44" height="8" rx="2.6" fill="${GEAR}"/>` +
        `<line x1="${PREACHER_SEAT[0]}" y1="${(PREACHER_SEAT[1] + 14).toFixed(1)}" x2="${PREACHER_SEAT[0]}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
        `<line x1="-26" y1="${MACHINE_FLOOR + 1}" x2="140" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },

  "concentration-curl": {
    /* "Sit on a bench, spread your knees, brace your upper arm against
     * your inner thigh. Let the dumbbell hang with a straight arm ...
     * curl the dumbbell up to your shoulder." Seated, trunk hinged
     * forward 30, the upper arm hanging just inside vertical against
     * the thigh (pinned: it does not move), the forearm curling from
     * straight to the shoulder. The far arm rests on the far knee. */
    view: "side",
    equip: "dumbbell",
    viewBox: "-12 -6 152 218",
    groundY: 204,
    shadowCx: 60,
    shadowRx: 36,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { biceps: "primary", forearm: "secondary" },
    pose: (e) => {
      const LEAN = 30;
      const chain = seatedChain(PREACHER_SEAT, -80, 80, LEAN);
      // World-vertical would be -LEAN; a few degrees forward of that is
      // the brace against the inner thigh.
      const upper: Op[] = [
        { kind: "rotate", deg: -LEAN - 6, pivot: SIDE_ANCHORS.shoulder },
        ...chain.torso,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -lerp(2, 140, e), pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      // Far arm: forearm resting across the far thigh.
      const restUpper: Op[] = [
        { kind: "rotate", deg: -LEAN - 20, pivot: SIDE_ANCHORS.shoulder },
        ...chain.torso,
      ];
      const restFore: Op[] = [
        { kind: "rotate", deg: -70, pivot: SIDE_ANCHORS.elbow },
        ...restUpper,
      ];
      return {
        head: chain.head,
        torso: chain.torso,
        pelvis: chain.body,
        thighL: chain.thigh,
        thighR: chain.thigh,
        shankL: chain.shank,
        shankR: chain.shank,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: restUpper,
        foreArmR: restFore,
        handR: restFore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () =>
      `<rect x="${(PREACHER_SEAT[0] - 22).toFixed(1)}" y="${(PREACHER_SEAT[1] + 6).toFixed(1)}" width="44" height="8" rx="2.6" fill="${GEAR}"/>` +
      `<line x1="${PREACHER_SEAT[0]}" y1="${(PREACHER_SEAT[1] + 14).toFixed(1)}" x2="${PREACHER_SEAT[0]}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
      `<line x1="-26" y1="${MACHINE_FLOOR + 1}" x2="140" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "incline-db-curl": {
    /* "Set a bench to 45°, sit back, arms hanging straight ... let your
     * shoulders open up — the stretch is the whole point. Curl the
     * dumbbells up without letting your upper arms move forward."
     * Trunk reclined 45 on the bench, the upper arm hanging plumb from
     * a shoulder that now sits well BEHIND the hip (that is the
     * stretch), fixed through the rep (pinned), forearm curling. */
    view: "side",
    equip: "dumbbell",
    viewBox: "-44 -6 172 218",
    groundY: 204,
    shadowCx: 40,
    shadowRx: 40,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { biceps: "primary", forearm: "secondary" },
    pose: (e) => {
      const chain = seatedChain(INCLINE_CURL_SEAT, -70, 70, -45);
      // Plumb would be +45 (cancelling the recline); a shade behind
      // plumb is the open-shoulder hang.
      const upper: Op[] = [
        { kind: "rotate", deg: 49, pivot: SIDE_ANCHORS.shoulder },
        ...chain.torso,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -lerp(0, 120, e), pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        head: chain.head,
        torso: chain.torso,
        pelvis: chain.body,
        thighL: chain.thigh,
        thighR: chain.thigh,
        shankL: chain.shank,
        shankR: chain.shank,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () => machineSeatScene(INCLINE_CURL_SEAT, -45),
  },

  "leg-press": {
    /* "Sit with your back flat against the pad ... lower the platform
     * toward your chest. Stop when your thighs are near your ribs ...
     * press back up without fully locking the knees." Reclined 50 on
     * the seat, the hip FIXED (pinned), the platform sliding down a
     * 45-degree track toward the body and the leg closing behind it:
     * planted-foot IK from the fixed hip to the moving ankle. Lockout
     * is a soft knee, never straight (pinned). */
    view: "side",
    viewBox: "-22 -16 180 228",
    groundY: 204,
    shadowCx: 50,
    shadowRx: 44,
    concentricTo: 0,
    tint: {
      quadriceps: "primary",
      gluteal: "secondary",
      hamstring: "secondary",
    },
    pose: (e) => {
      const c = legPressChain(e);
      // Hands on the side handles by the hips.
      const upper: Op[] = [
        { kind: "rotate", deg: 20, pivot: SIDE_ANCHORS.shoulder },
        ...c.torso,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -30, pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        head: c.head,
        torso: c.torso,
        pelvis: c.body,
        thighL: c.leg.thigh,
        thighR: c.leg.thigh,
        shankL: c.leg.shank,
        shankR: c.leg.shank,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    scene: (e) => {
      const c = legPressChain(e);
      const a = c.ankle;
      // Platform: perpendicular to the track at the foot, sliding with
      // it; the track rail behind; the seat + backrest; the floor.
      const px = -SLED_DIR[1];
      const py = SLED_DIR[0];
      const plate = (k: number): Pt => [
        a[0] + 10 * SLED_DIR[0] + px * k,
        a[1] + 10 * SLED_DIR[1] + py * k,
      ];
      const p1 = plate(-30);
      const p2 = plate(26);
      const r1: Pt = [
        LEG_PRESS_HIP[0] + SLED_DIR[0] * 40,
        LEG_PRESS_HIP[1] + SLED_DIR[1] * 40 + 22,
      ];
      const r2: Pt = [
        LEG_PRESS_HIP[0] + SLED_DIR[0] * 118,
        LEG_PRESS_HIP[1] + SLED_DIR[1] * 118 + 22,
      ];
      return (
        `<line x1="${r1[0].toFixed(1)}" y1="${r1[1].toFixed(1)}" x2="${r2[0].toFixed(1)}" y2="${r2[1].toFixed(1)}" stroke="${GEAR_DARK}" stroke-width="3"/>` +
        `<line x1="${p1[0].toFixed(1)}" y1="${p1[1].toFixed(1)}" x2="${p2[0].toFixed(1)}" y2="${p2[1].toFixed(1)}" stroke="${GEAR}" stroke-width="7" stroke-linecap="round"/>` +
        machineSeatScene(LEG_PRESS_HIP, -50)
      );
    },
  },

  "hack-squat": {
    /* "Set your back flat against the pad, shoulders under the pads,
     * feet mid-platform ... lower until your thighs are parallel to
     * the platform, knees tracking over toes. Press back up ... without
     * locking out hard." The same 45-degree machine with the FEET fixed
     * on the platform (pinned) and the body sliding down the pad: the
     * hip travels the pad line and the leg is planted-foot IK from it
     * to the fixed ankle, knee forward. */
    view: "side",
    viewBox: "-22 -16 180 228",
    groundY: 204,
    shadowCx: 60,
    shadowRx: 40,
    concentricTo: 0,
    tint: { quadriceps: "primary", gluteal: "secondary" },
    pose: (e) => {
      const c = hackSquatChain(e);
      // Hands up on the shoulder-pad handles.
      const upper: Op[] = [
        { kind: "rotate", deg: -110, pivot: SIDE_ANCHORS.shoulder },
        ...c.torso,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -130, pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        head: c.head,
        torso: c.torso,
        pelvis: c.body,
        thighL: c.leg.thigh,
        thighR: c.leg.thigh,
        shankL: c.leg.shank,
        shankR: c.leg.shank,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    scene: (e, pose) => {
      // Back pad along the hip path (fixed in the world), the platform
      // under the fixed feet, shoulder pads riding the body, the floor.
      const top = HACK_HIP[0];
      const bot = HACK_HIP[1];
      const dx = bot[0] - top[0];
      const dy = bot[1] - top[1];
      const len = Math.hypot(dx, dy);
      const ux = dx / len;
      const uy = dy / len;
      const padA: Pt = [top[0] - ux * 70 - 12, top[1] - uy * 70];
      const padB: Pt = [bot[0] + ux * 16 - 12, bot[1] + uy * 16];
      const S = applyToPoint(SIDE_ANCHORS.shoulder, pose.torso ?? []);
      const a = HACK_ANKLE;
      void e;
      return (
        `<line x1="${padA[0].toFixed(1)}" y1="${padA[1].toFixed(1)}" x2="${padB[0].toFixed(1)}" y2="${padB[1].toFixed(1)}" stroke="${GEAR}" stroke-width="8" stroke-linecap="round"/>` +
        `<line x1="${padB[0].toFixed(1)}" y1="${padB[1].toFixed(1)}" x2="${padB[0].toFixed(1)}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
        `<line x1="${(a[0] - 26).toFixed(1)}" y1="${(a[1] + 8).toFixed(1)}" x2="${(a[0] + 30).toFixed(1)}" y2="${(a[1] + 8).toFixed(1)}" stroke="${GEAR}" stroke-width="6" stroke-linecap="round"/>` +
        `<rect x="${(S[0] - 6).toFixed(1)}" y="${(S[1] - 12).toFixed(1)}" width="14" height="8" rx="3" fill="${GEAR}"/>` +
        `<line x1="-26" y1="${MACHINE_FLOOR + 1}" x2="150" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },

  "rack-pull": {
    /* "Set the pins so the bar sits just below your knees ... stand up
     * by driving your hips forward ... lower the bar back to the pins."
     * The deadlift's own chain, stopped at the fraction where the bar
     * sits just under the knee (pinned) — a rack pull IS the top of a
     * deadlift, and drawing it as anything else would be a second copy
     * of the hinge to drift. The pins are drawn at that bar height. */
    view: "side",
    equip: "plate-end",
    plateR: 16,
    concentricTo: 0,
    startsAt: "stretch",
    viewBox: "-18 -2 186 212",
    groundY: 204,
    shadowCx: 56,
    shadowRx: 40,
    /* Catalogue: Posterior Chain | Traps, Glutes, Core. */
    tint: {
      hamstring: "primary",
      gluteal: "primary",
      "lower-back": "primary",
      trapezius: "secondary",
    },
    pose: (e) => rackPullPose(e),
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () => {
      const bottom = rackPullPose(1);
      const h = applyToPoint(SIDE_ANCHORS.hand, bottom.handL ?? []);
      // Upright in front of the bar with a pin reaching back under it;
      // the bar's shaft rests on the pin at the bottom frame.
      const postX = h[0] + 28;
      return (
        `<line x1="${postX.toFixed(1)}" y1="${(h[1] - 60).toFixed(1)}" x2="${postX.toFixed(1)}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
        `<rect x="${(h[0] - 8).toFixed(1)}" y="${(h[1] + 2.5).toFixed(1)}" width="${(postX - h[0] + 8).toFixed(1)}" height="3.2" rx="1.2" fill="${GEAR}"/>` +
        `<line x1="-36" y1="${MACHINE_FLOOR + 1}" x2="150" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },

  "decline-bench": {
    /* "Stack the bar over your lower chest ... lower with control until
     * the bar lightly touches your lower chest. Press up and slightly
     * back, finishing with elbows stacked over shoulders." The bench
     * chain declined 19.5 degrees, legs hooked under the rollers, bar
     * pressed perpendicular to the trunk from the LOWER chest. */
    view: "side",
    equip: "plate-end",
    plateR: 10,
    viewBox: "-40 -6 190 190",
    groundY: SUPINE_FLOOR,
    shadowCx: 40,
    shadowRx: 60,
    concentricTo: 0,
    tint: {
      chest: "primary",
      triceps: "secondary",
      "front-deltoids": "secondary",
    },
    pose: declinePressPose,
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: declineScene,
  },

  "decline-db-press": {
    /* The decline bench with bells: "press the dumbbells up to full
     * extension ... lower until you feel a deep stretch across your
     * lower chest." Same chain, one bell per hand end-on. */
    view: "side",
    equip: "dumbbell",
    viewBox: "-40 -6 190 190",
    groundY: SUPINE_FLOOR,
    shadowCx: 40,
    shadowRx: 60,
    concentricTo: 0,
    tint: {
      chest: "primary",
      triceps: "secondary",
      "front-deltoids": "secondary",
    },
    pose: declinePressPose,
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: declineScene,
  },

  /* ── 2026-09-03 build-out, batch 5: the core ── */

  crunches: {
    /* "Lie on your back, knees bent, feet flat, hands lightly behind
     * your head. Curl your shoulders off the floor ... don't pull on
     * your neck." Flat on the back with the bridge's planted-foot legs,
     * the trunk curling about a point part-way up from the hip (the
     * lower back stays down — pinned: the hip does not move), the head
     * riding the trunk at a FIXED angle (no neck pull — pinned). */
    view: "side",
    viewBox: "-64 40 186 142",
    groundY: SUPINE_FLOOR,
    shadowCx: 30,
    shadowRx: 60,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { abs: "primary", obliques: "secondary" },
    pose: (e) => {
      const f = supineFlat();
      const torso = crunchOps(f.body, f.hip, f.shoulder, lerp(0, 32, e));
      const leg = plantedLeg(
        f.hip,
        [f.hip[0] + 42, SUPINE_FLOOR - 6],
        KNEE_HIGH
      );
      const behind = handsBehindHead();
      const upper: Op[] = [...behind.upper, ...torso];
      const fore: Op[] = [...behind.fore, ...torso];
      return {
        head: torso,
        torso,
        pelvis: f.body,
        thighL: leg.thigh,
        thighR: leg.thigh,
        shankL: leg.shank,
        shankR: leg.shank,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    scene: () =>
      `<line x1="-58" y1="${SUPINE_FLOOR}" x2="118" y2="${SUPINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "toe-touches": {
    /* "Lie on your back with legs extended straight up toward the
     * ceiling. Reach your hands up toward your toes, curling your
     * shoulders off the floor." Legs vertical the whole set (pinned),
     * straight arms reaching along them, the trunk curling as the
     * crunch does. */
    view: "side",
    viewBox: "-64 -6 186 188",
    groundY: SUPINE_FLOOR,
    shadowCx: 30,
    shadowRx: 60,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { abs: "primary" },
    pose: (e) => {
      const f = supineFlat();
      const torso = crunchOps(f.body, f.hip, f.shoulder, lerp(0, 30, e));
      const legs: Op[] = [
        ...f.body,
        { kind: "rotate", deg: -88, pivot: f.hip },
      ];
      const upper: Op[] = [
        { kind: "rotate", deg: -108, pivot: SIDE_ANCHORS.shoulder },
        ...torso,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -4, pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        head: torso,
        torso,
        pelvis: f.body,
        thighL: legs,
        thighR: legs,
        shankL: legs,
        shankR: legs,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    scene: () =>
      `<line x1="-58" y1="${SUPINE_FLOOR}" x2="118" y2="${SUPINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "decline-sit-up": {
    /* "Secure your feet at the top of a decline bench and lie back.
     * Cross arms over your chest ... sit up by curling your torso,
     * bringing your chest toward your knees. Lower with control to a
     * full extension." The decline bench's placement (legs hooked under
     * the rollers), the trunk swinging about the hip from the pad line
     * up to the knees, arms crossed. */
    view: "side",
    viewBox: "-40 -6 190 190",
    groundY: SUPINE_FLOOR,
    shadowCx: 40,
    shadowRx: 60,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { abs: "primary" },
    pose: (e) => {
      const G: Op = { kind: "rotate", deg: DECLINE_DEG, pivot: [44, 100] };
      const hipG = applyToPoint(SIDE_ANCHORS.hip, [G]);
      const T0: Op = { kind: "translate", dx: 0, dy: DECLINE_HIP_Y - hipG[1] };
      const body: Op[] = [G, T0];
      const hip = applyToPoint(SIDE_ANCHORS.hip, body);
      const torso: Op[] = [
        ...body,
        { kind: "rotate", deg: lerp(0, 150, e), pivot: hip },
      ];
      const shank: Op[] = [
        { kind: "rotate", deg: 90, pivot: SIDE_ANCHORS.knee },
        ...body,
      ];
      const upper: Op[] = [
        {
          kind: "rotate",
          deg: ARMS_CROSSED.upper,
          pivot: SIDE_ANCHORS.shoulder,
        },
        ...torso,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: ARMS_CROSSED.fore, pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        head: torso,
        torso,
        pelvis: body,
        thighL: body,
        thighR: body,
        shankL: shank,
        shankR: shank,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    scene: declineScene,
  },

  "leg-raise": {
    /* "Hang from a pull-up bar with straight arms ... raise your legs
     * straight in front until they're parallel to the floor or higher.
     * Lower slowly." Hanging side-on from a bar overhead (hands fixed
     * on it — pinned), straight legs swinging about the hip from
     * plumb to horizontal (pinned). */
    view: "side",
    viewBox: "-12 -8 176 252",
    groundY: 246,
    shadowCx: 60,
    shadowRx: 34,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { abs: "primary" },
    pose: (e) => {
      const h = hangingBase();
      const hip = applyToPoint(SIDE_ANCHORS.hip, h.body);
      const legs: Op[] = [
        ...h.body,
        { kind: "rotate", deg: lerp(0, -92, e), pivot: hip },
      ];
      return {
        head: h.body,
        torso: h.body,
        pelvis: h.body,
        thighL: legs,
        thighR: legs,
        shankL: legs,
        shankR: legs,
        upperArmL: h.arm,
        foreArmL: h.arm,
        handL: h.arm,
        upperArmR: h.arm,
        foreArmR: h.arm,
        handR: h.arm,
      };
    },
    scene: () => {
      const h = hangingBase().hand;
      return (
        `<line x1="${h[0].toFixed(1)}" y1="-8" x2="${h[0].toFixed(1)}" y2="${(h[1] - 2).toFixed(1)}" stroke="${GEAR_DARK}" stroke-width="2.2"/>` +
        `<circle cx="${h[0].toFixed(1)}" cy="${h[1].toFixed(1)}" r="3.4" fill="${GEAR}" stroke="${GEAR_EDGE}" stroke-width="0.8"/>` +
        `<line x1="-6" y1="247" x2="160" y2="247" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },

  "cable-crunch": {
    /* "Kneel facing a high pulley with a rope attachment held at your
     * temples. Set your hips back slightly ... crunch your torso down
     * toward your thighs, elbows driving to knees. Return slowly to
     * upright, keeping hips fixed — this is an ab crunch, not a hip
     * pull." Kneeling, hips FIXED (pinned), the trunk flexing about
     * them from near-upright to folded, the hands riding the temples
     * at a fixed distance from the head (pinned) with the rope solved
     * from the high pulley to them. */
    view: "side",
    equip: "rope",
    pulley: [126, -10],
    viewBox: "-12 -16 160 228",
    groundY: 204,
    shadowCx: 56,
    shadowRx: 40,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { abs: "primary", obliques: "secondary" },
    pose: (e) => {
      const k = kneelingBase();
      const flex = lerp(15, 80, e);
      const torso: Op[] = [
        { kind: "rotate", deg: flex, pivot: SIDE_ANCHORS.hip },
        ...k.body,
      ];
      const upper: Op[] = [
        { kind: "rotate", deg: -128, pivot: SIDE_ANCHORS.shoulder },
        ...torso,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -132, pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        head: torso,
        torso,
        pelvis: k.body,
        thighL: k.body,
        thighR: k.body,
        shankL: k.shank,
        shankR: k.shank,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () => kneelScene(cableStationScene(130, -16)),
  },

  "ab-wheel": {
    /* "Kneel on a pad holding the ab wheel with both hands under your
     * shoulders ... roll the wheel forward as far as you can control,
     * body staying straight. Pull the wheel back ... using your abs."
     * Kneeling; the thigh tips forward about the fixed knee and the
     * trunk opens from folded to in line with it (pinned straight at
     * the end); straight arms (pinned) reach from the shoulder to a
     * wheel that stays ON the floor (pinned), solved as the point one
     * arm's length from the shoulder at floor height. */
    view: "side",
    viewBox: "-12 -6 212 218",
    groundY: 204,
    shadowCx: 90,
    shadowRx: 60,
    concentricTo: 0,
    tint: {
      abs: "primary",
      "upper-back": "secondary",
      "front-deltoids": "secondary",
    },
    pose: (e) => {
      const k = kneelingBase();
      const tilt = lerp(-8, 62, e); // thigh about the fixed knee: hips back → forward-down
      const thigh: Op[] = [
        { kind: "rotate", deg: tilt, pivot: SIDE_ANCHORS.knee },
        ...k.body,
      ];
      const hipW = applyToPoint(SIDE_ANCHORS.hip, thigh);
      const flex = lerp(85, 0, e); // trunk about the hip, relative to the thigh
      const torso: Op[] = [
        { kind: "rotate", deg: flex, pivot: SIDE_ANCHORS.hip },
        ...thigh,
      ];
      const S = applyToPoint(SIDE_ANCHORS.shoulder, torso);
      const wheelY = MACHINE_FLOOR - AB_WHEEL_R;
      const dy = wheelY - S[1];
      const dx = Math.sqrt(Math.max(STRAIGHT_ARM * STRAIGHT_ARM - dy * dy, 0));
      const H: Pt = [S[0] + dx, wheelY];
      // Aim the rest arm at the wheel in pre-pose space, then ride the torso.
      const unpose = invertOps(torso);
      const hPre = applyToPoint(H, unpose);
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
      void hipW;
      return {
        head: torso,
        torso,
        pelvis: thigh,
        thighL: thigh,
        thighR: thigh,
        shankL: k.shank,
        shankR: k.shank,
        upperArmL: [...arm.upper, ...torso],
        foreArmL: [...arm.fore, ...torso],
        handL: [...arm.fore, ...torso],
        upperArmR: [...arm.upper, ...torso],
        foreArmR: [...arm.fore, ...torso],
        handR: [...arm.fore, ...torso],
      };
    },
    scene: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return kneelScene(
        `<circle cx="${h[0].toFixed(1)}" cy="${h[1].toFixed(1)}" r="${AB_WHEEL_R}" fill="${GEAR_DARK}" stroke="${GEAR_EDGE}" stroke-width="1.2"/>` +
          `<circle cx="${h[0].toFixed(1)}" cy="${h[1].toFixed(1)}" r="2" fill="${GEAR}"/>`
      );
    },
  },

  "superman-hold": {
    /* "Lie face-down with arms extended overhead and legs straight.
     * Engage your glutes and lower back to lift arms, chest, and legs
     * off the floor ... lower under control to the floor for the next
     * rep." Prone (head-right), arms along the floor past the head;
     * the trunk and arms rotate up about the hip one way, the legs the
     * other, so hands and feet both leave the floor (pinned) and return
     * to it. */
    view: "side",
    // Prone and reaching both ways: fingertips to toes span ~220.
    viewBox: "-64 84 244 92",
    groundY: SUPINE_FLOOR,
    shadowCx: 60,
    shadowRx: 100,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      "lower-back": "primary",
      gluteal: "secondary",
      hamstring: "secondary",
    },
    pose: (e) => {
      const G: Op = { kind: "rotate", deg: 90, pivot: [44, 100] };
      const hipG = applyToPoint(SIDE_ANCHORS.hip, [G]);
      const T0: Op = { kind: "translate", dx: 0, dy: PRONE_HIP_Y - hipG[1] };
      const body: Op[] = [G, T0];
      const hip = applyToPoint(SIDE_ANCHORS.hip, body);
      const lift = lerp(0, 14, e);
      const torso: Op[] = [...body, { kind: "rotate", deg: -lift, pivot: hip }];
      const legs: Op[] = [
        ...body,
        { kind: "rotate", deg: lift * 0.8, pivot: hip },
      ];
      const arms: Op[] = [
        { kind: "rotate", deg: 188, pivot: SIDE_ANCHORS.shoulder },
        ...torso,
      ];
      return {
        head: torso,
        torso,
        pelvis: body,
        thighL: legs,
        thighR: legs,
        shankL: legs,
        shankR: legs,
        upperArmL: arms,
        foreArmL: arms,
        handL: arms,
        upperArmR: arms,
        foreArmR: arms,
        handR: arms,
      };
    },
    scene: () =>
      `<line x1="-58" y1="${SUPINE_FLOOR}" x2="118" y2="${SUPINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  /* ── 2026-09-03 build-out, batch 6: bodyweight rows and dips, the
     swing, the rail ── */

  "inverted-row": {
    /* "Set a bar at waist height and hang underneath ... your body is
     * one straight line from heels to head. Pull your chest to the
     * bar ... lower under control to a full arm extension without
     * breaking the plank." The standing figure tilted rigidly about its
     * planted heel (pinned straight, pinned heel), the hands fixed on
     * the bar (pinned), the arms solved from the moving shoulder. */
    view: "side",
    viewBox: "-40 -6 190 218",
    groundY: 204,
    shadowCx: 60,
    shadowRx: 70,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { "upper-back": "primary", biceps: "secondary", abs: "secondary" },
    pose: (e) => {
      const body = rigidLean(
        lerp(INV_ROW_LEAN[0], INV_ROW_LEAN[1], e),
        INV_ROW_ANKLE
      );
      const arm = armToWorld(body, invertedRowBar(), ELBOW_LOW);
      return {
        head: body,
        torso: body,
        pelvis: body,
        thighL: body,
        thighR: body,
        shankL: body,
        shankR: body,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    scene: () => {
      const b = invertedRowBar();
      const postX = b[0] + 30;
      return (
        `<line x1="${postX.toFixed(1)}" y1="${(b[1] - 40).toFixed(1)}" x2="${postX.toFixed(1)}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
        `<rect x="${(b[0] - 4).toFixed(1)}" y="${(b[1] + 2.4).toFixed(1)}" width="${(postX - b[0] + 4).toFixed(1)}" height="3" rx="1.2" fill="${GEAR}"/>` +
        `<circle cx="${b[0].toFixed(1)}" cy="${b[1].toFixed(1)}" r="3.4" fill="${GEAR}" stroke="${GEAR_EDGE}" stroke-width="0.8"/>` +
        `<line x1="-36" y1="${MACHINE_FLOOR + 1}" x2="150" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },

  "bench-dips": {
    /* "Sit on a bench, hands gripping the edge, legs extended in front.
     * Slide your hips off the bench, arms fully extended. Lower by
     * bending your elbows to about 90°, keeping them tracking back.
     * Press back up to full lockout." Hands fixed on the bench edge
     * behind (pinned), heels fixed on the floor ahead (pinned), the
     * trunk upright and dropping straight down; the arm is solved to
     * the fixed hand with the elbow BEHIND (pinned), 90° at the bottom
     * (pinned). */
    view: "side",
    viewBox: "-30 -6 172 218",
    groundY: 204,
    shadowCx: 60,
    shadowRx: 56,
    concentricTo: 0,
    tint: {
      triceps: "primary",
      chest: "secondary",
      "front-deltoids": "secondary",
    },
    pose: (e) => {
      const hip: Pt = [32, lerp(141.4, 160, e)];
      const body: Op[] = [
        {
          kind: "translate",
          dx: hip[0] - SIDE_ANCHORS.hip[0],
          dy: hip[1] - SIDE_ANCHORS.hip[1],
        },
      ];
      const leg = plantedLeg(hip, DIP_BENCH_ANKLE, KNEE_HIGH);
      const arm = armToWorld(body, DIP_BENCH_HAND, ELBOW_BACK);
      return {
        head: body,
        torso: body,
        pelvis: body,
        thighL: leg.thigh,
        thighR: leg.thigh,
        shankL: leg.shank,
        shankR: leg.shank,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    scene: () => {
      const h = DIP_BENCH_HAND;
      return (
        `<rect x="${(h[0] - 44).toFixed(1)}" y="${(h[1] + 2).toFixed(1)}" width="50" height="8" rx="2.6" fill="${GEAR}"/>` +
        `<line x1="${(h[0] - 36).toFixed(1)}" y1="${(h[1] + 10).toFixed(1)}" x2="${(h[0] - 36).toFixed(1)}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
        `<line x1="${(h[0] - 2).toFixed(1)}" y1="${(h[1] + 10).toFixed(1)}" x2="${(h[0] - 2).toFixed(1)}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
        `<line x1="-26" y1="${MACHINE_FLOOR + 1}" x2="140" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },

  "kettlebell-swing": {
    /* "Hinge at the hips ... hike the bell back between your legs, then
     * snap your hips forward. Let the bell float to chest height
     * without lifting with your arms." The hinge lift with a straight
     * arm (pinned) swinging as a pendulum from the shoulder: behind the
     * knee line at the hike (pinned), out to chest height at the top
     * (pinned) — the arms never bend, the hips do the work. */
    view: "side",
    equip: "kettlebell",
    viewBox: "-20 -2 190 212",
    groundY: 204,
    shadowCx: 52,
    shadowRx: 40,
    concentricTo: 0,
    startsAt: "stretch",
    tint: {
      gluteal: "primary",
      hamstring: "primary",
      "lower-back": "secondary",
      abs: "secondary",
    },
    pose: (e) => {
      const base = hingeLift(e, e, SWING_HINGE, -28, 6, 0);
      // World arm angle from plumb: forward past horizontal at the top,
      // behind plumb at the hike. The torso carries `hinge`, so the
      // arm's own rotation is the difference.
      const hinge = SWING_HINGE * e;
      const world = lerp(-80, 32, e);
      const upper: Op[] = [
        { kind: "rotate", deg: world - hinge, pivot: SIDE_ANCHORS.shoulder },
        ...(base.torso ?? []),
      ];
      return {
        ...base,
        upperArmL: upper,
        foreArmL: upper,
        handL: upper,
        upperArmR: upper,
        foreArmR: upper,
        handR: upper,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      const el = applyToPoint(SIDE_ANCHORS.elbow, pose.foreArmL ?? []);
      const len = Math.hypot(h[0] - el[0], h[1] - el[1]) || 1;
      // The ball continues the arm's line beyond the grip.
      return [
        h,
        [
          h[0] + ((h[0] - el[0]) / len) * 11,
          h[1] + ((h[1] - el[1]) / len) * 11,
        ],
      ];
    },
    scene: () =>
      `<line x1="-16" y1="${MACHINE_FLOOR + 1}" x2="166" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "barbell-upright-row": {
    /* "Stand with the bar at your thighs ... pull the bar straight up
     * along your body, leading with your elbows. Stop at upper chest
     * height — elbows should not go above shoulders." The bar rides a
     * near-vertical path a hand's width off the trunk (pinned) from
     * the thighs to the upper chest (pinned), the elbow solved on the
     * back branch and never above the shoulder line (pinned). */
    view: "side",
    equip: "plate-end",
    plateR: 10,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      trapezius: "primary",
      "front-deltoids": "secondary",
      biceps: "secondary",
    },
    pose: (e) => {
      const S = SIDE_ANCHORS.shoulder;
      const H: Pt = [S[0] + lerp(9, 11, e), S[1] + lerp(66, 14, e)];
      const arm = armToWorld([], H, ELBOW_BACK);
      return {
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
  },

  "zercher-squat": {
    /* "Cradle the bar in the crooks of your elbows, hands clasped ...
     * squat down keeping the torso upright, elbows driving inside your
     * knees. Drive up ... without letting the bar roll forward." The
     * squat chain with a shallower hinge (an upright torso — pinned
     * against the back squat's), forearms folded up with the hands
     * clasped, and the bar drawn AT the elbow crook every frame
     * (pinned) rather than at the hand. */
    view: "side",
    equip: "plate-end",
    plateR: 11,
    viewBox: "-24 -2 192 212",
    groundY: 204,
    shadowCx: 56,
    shadowRx: 40,
    concentricTo: 0,
    tint: {
      quadriceps: "primary",
      gluteal: "secondary",
      abs: "secondary",
      "upper-back": "secondary",
    },
    pose: (e) => {
      const c = sideSquatChain(e, ZERCHER_HINGE);
      const upper: Op[] = [
        { kind: "rotate", deg: -18, pivot: SIDE_ANCHORS.shoulder },
        ...c.torsoOps,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -128, pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        head: c.headOps,
        torso: c.torsoOps,
        pelvis: c.pelvisOps,
        thighL: c.thighOps,
        thighR: c.thighOps,
        shankL: c.legOps,
        shankR: c.legOps,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    bar: (_e, pose) => {
      // In the crook: just inside the elbow joint, on the forearm side.
      const c = applyToPoint(
        [SIDE_ANCHORS.elbow[0] + 4, SIDE_ANCHORS.elbow[1] - 3],
        pose.foreArmL ?? []
      );
      return [c, c];
    },
  },

  "nordic-hamstring-curl": {
    /* "Kneel on a pad with ... your ankles anchored firmly. Cross arms
     * over your chest and keep your body dead straight. Lower slowly
     * forward by extending at the knees ... pull yourself back up."
     * Kneeling, the thigh and trunk one rigid line (pinned) hinging
     * about the fixed knee (pinned) with the ankles held (pinned),
     * from upright to near the floor. The lowering is the work here,
     * so the rep starts upright. */
    view: "side",
    viewBox: "-12 -6 212 218",
    groundY: 204,
    shadowCx: 90,
    shadowRx: 60,
    concentricTo: 0,
    tint: {
      hamstring: "primary",
      gluteal: "secondary",
      "lower-back": "secondary",
    },
    pose: (e) => {
      const c = kneelHingeChain(KNEEL_KNEE, lerp(0, 80, e));
      return {
        head: c.thigh,
        torso: c.thigh,
        pelvis: c.thigh,
        thighL: c.thigh,
        thighR: c.thigh,
        shankL: c.shank,
        shankR: c.shank,
        upperArmL: c.upper,
        foreArmL: c.fore,
        handL: c.fore,
        upperArmR: c.upper,
        foreArmR: c.fore,
        handR: c.fore,
      };
    },
    scene: (_e, pose) => {
      const a = applyToPoint(SIDE_ANCHORS.ankle, pose.shankL ?? []);
      // The anchor over the ankles, and a pad under the knees.
      return kneelScene(
        `<rect x="${(a[0] - 6).toFixed(1)}" y="${(a[1] - 9).toFixed(1)}" width="10" height="7" rx="2" fill="${GEAR}"/>` +
          `<rect x="${(KNEEL_KNEE[0] - 14).toFixed(1)}" y="${(KNEEL_KNEE[1] + 6).toFixed(1)}" width="34" height="5" rx="2" fill="${GEAR}"/>`
      );
    },
  },

  "glute-ham-raise": {
    /* "Set the GHD so your thighs press into the pad and feet are
     * secured. Start upright ... hands crossed over your chest. Lower
     * your torso by extending at the knees with a straight line from
     * knees to head. Curl yourself back up." The Nordic's chain up on
     * a GHD: knee on the pad above the floor, feet on the plate
     * behind, the straight body (pinned) hinging from vertical to
     * horizontal (pinned) about the fixed knee (pinned). */
    view: "side",
    viewBox: "-12 -6 212 218",
    groundY: 204,
    shadowCx: 90,
    shadowRx: 60,
    concentricTo: 0,
    tint: {
      hamstring: "primary",
      gluteal: "primary",
      "lower-back": "secondary",
    },
    pose: (e) => {
      const c = kneelHingeChain(GHD_KNEE, lerp(0, 90, e));
      return {
        head: c.thigh,
        torso: c.thigh,
        pelvis: c.thigh,
        thighL: c.thigh,
        thighR: c.thigh,
        shankL: c.shank,
        shankR: c.shank,
        upperArmL: c.upper,
        foreArmL: c.fore,
        handL: c.fore,
        upperArmR: c.upper,
        foreArmR: c.fore,
        handR: c.fore,
      };
    },
    scene: (_e, pose) => {
      const a = applyToPoint(SIDE_ANCHORS.ankle, pose.shankL ?? []);
      const k = GHD_KNEE;
      return (
        // Thigh pad under the knee, the footplate behind the heels, the
        // frame, and the floor.
        `<rect x="${(k[0] - 10).toFixed(1)}" y="${(k[1] + 7).toFixed(1)}" width="30" height="9" rx="3" fill="${GEAR}"/>` +
        `<line x1="${(k[0] + 4).toFixed(1)}" y1="${(k[1] + 16).toFixed(1)}" x2="${(k[0] + 4).toFixed(1)}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
        `<rect x="${(a[0] - 12).toFixed(1)}" y="${(a[1] - 12).toFixed(1)}" width="6" height="26" rx="2" fill="${GEAR}"/>` +
        `<line x1="${(a[0] - 9).toFixed(1)}" y1="${(a[1] + 14).toFixed(1)}" x2="${(a[0] - 9).toFixed(1)}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
        `<line x1="-6" y1="${MACHINE_FLOOR + 1}" x2="200" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },

  "sissy-squat": {
    /* "Grip something solid for balance. Rise onto your toes and lean
     * your torso back as you bend the knees forward. Lower until you
     * feel a deep stretch across the quads." The shin tips forward
     * about the ball of the foot (the calf raise's pivot — pinned:
     * the ball never moves, the heel rises), the thigh and trunk stay
     * one straight line (pinned) leaning back from the knee, the hands
     * hold a fixed rail (pinned). */
    view: "side",
    viewBox: "-24 -2 172 212",
    groundY: 204,
    shadowCx: 56,
    shadowRx: 36,
    concentricTo: 0,
    tint: { quadriceps: "primary", abs: "secondary" },
    pose: (e) => {
      const pitch = lerp(0, 38, e); // shin about the ball of the foot
      const shank: Op[] = [{ kind: "rotate", deg: pitch, pivot: CALF_BALL }];
      const back = lerp(0, -34, e); // thigh about the knee, hip back
      const thigh: Op[] = [
        { kind: "rotate", deg: back, pivot: SIDE_ANCHORS.knee },
        ...shank,
      ];
      const arm = armToWorld(thigh, SISSY_RAIL, ELBOW_LOW);
      return {
        head: thigh,
        torso: thigh,
        pelvis: thigh,
        thighL: thigh,
        thighR: thigh,
        shankL: shank,
        shankR: shank,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    scene: () =>
      // A rail reaching back from a post that stands clear of the knees.
      `<line x1="${SISSY_RAIL[0] + 34}" y1="${SISSY_RAIL[1] - 40}" x2="${SISSY_RAIL[0] + 34}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
      `<line x1="${SISSY_RAIL[0] + 34}" y1="${SISSY_RAIL[1]}" x2="${SISSY_RAIL[0] - 4}" y2="${SISSY_RAIL[1]}" stroke="${GEAR}" stroke-width="3.2" stroke-linecap="round"/>` +
      `<circle cx="${SISSY_RAIL[0]}" cy="${SISSY_RAIL[1]}" r="3.4" fill="${GEAR}" stroke="${GEAR_EDGE}" stroke-width="0.8"/>` +
      `<line x1="-20" y1="${MACHINE_FLOOR + 1}" x2="146" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  /* ── 2026-09-03 build-out, batch 7: floor, box, one leg, the
     thruster ── */

  "barbell-floor-press": {
    /* "Lie on the floor ... bar positioned over your mid-chest ... bend
     * your knees. Lower the bar until your upper arms touch the floor,
     * pause ... drive the bar back up to full lockout." The bench
     * chain on the floor: back down (the crunch's placement), knees
     * bent with the feet flat, and the bottom defined by the FLOOR
     * rather than the chest — the upper arm lies on it (pinned), so
     * the range is a forearm's height, not a bench press's. */
    view: "side",
    equip: "plate-end",
    plateR: 10,
    viewBox: "-64 40 186 142",
    groundY: SUPINE_FLOOR,
    shadowCx: 30,
    shadowRx: 60,
    concentricTo: 1,
    tint: {
      chest: "primary",
      triceps: "primary",
      "front-deltoids": "secondary",
    },
    pose: (e) => {
      const f = supineFlat();
      const S = SIDE_ANCHORS.shoulder;
      // Body space: bottom = upper arm along the floor toward the hip
      // (+y) with the forearm vertical (+x); top = lockout over the
      // shoulder line.
      const H: Pt = [
        S[0] + lerp(SIDE_FORE_LEN, BENCH_LOCKOUT, e),
        S[1] + lerp(SIDE_UPPER_LEN, 4, e),
      ];
      const arm = aimArm(
        { S, E: SIDE_ANCHORS.elbow, H: SIDE_ANCHORS.hand },
        solveElbow(S, H, SIDE_UPPER_LEN, SIDE_FORE_LEN, -1),
        H,
        0
      );
      const leg = plantedLeg(
        f.hip,
        [f.hip[0] + 42, SUPINE_FLOOR - 6],
        KNEE_HIGH
      );
      return {
        head: f.body,
        torso: f.body,
        pelvis: f.body,
        thighL: leg.thigh,
        thighR: leg.thigh,
        shankL: leg.shank,
        shankR: leg.shank,
        upperArmL: [...arm.upper, ...f.body],
        foreArmL: [...arm.fore, ...f.body],
        handL: [...arm.fore, ...f.body],
        upperArmR: [...arm.upper, ...f.body],
        foreArmR: [...arm.fore, ...f.body],
        handR: [...arm.fore, ...f.body],
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () =>
      `<line x1="-58" y1="${SUPINE_FLOOR}" x2="118" y2="${SUPINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "single-leg-calf-raise": {
    /* "Stand on one foot on a step's edge, ball of the foot planted,
     * heel hanging free. Hold a wall or rail for balance only ... rise
     * as high onto your toes as possible ... lower until your heel
     * drops below the step." The calf raise's rise on the near leg
     * (ball pinned, heel below the block at the bottom), the far leg
     * folded up behind and off the step every frame (pinned), the
     * hands resting on a rail ahead (pinned still — balance only). */
    view: "side",
    concentricTo: 1,
    startsAt: "stretch",
    viewBox: "-4 -2 172 220",
    groundY: CALF_FLOOR,
    shadowCx: 56,
    shadowRx: 24,
    tint: { calves: "primary" },
    pose: (e) => {
      const { legOps, rise } = calfRise(e);
      const farThigh: Op[] = [
        { kind: "rotate", deg: 6, pivot: SIDE_ANCHORS.hip },
        ...rise,
      ];
      const farShank: Op[] = [
        // Heel up toward the glute (110 puts the ankle behind AND above
        // the knee; at 74 the shin stuck out level like a kick).
        { kind: "rotate", deg: 110, pivot: SIDE_ANCHORS.knee },
        ...farThigh,
      ];
      const arm = armToWorld(rise, CALF_RAIL, ELBOW_LOW);
      return {
        shankL: legOps,
        thighL: rise,
        thighR: farThigh,
        shankR: farShank,
        pelvis: rise,
        torso: rise,
        head: rise,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    scene: () =>
      `<rect x="52" y="${CALF_BLOCK_TOP}" width="26" height="${CALF_FLOOR - CALF_BLOCK_TOP}" rx="1.5" fill="${GEAR}"/>` +
      `<line x1="${CALF_RAIL[0] + 30}" y1="${CALF_RAIL[1] - 50}" x2="${CALF_RAIL[0] + 30}" y2="${CALF_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
      `<line x1="${CALF_RAIL[0] + 30}" y1="${CALF_RAIL[1]}" x2="${CALF_RAIL[0] - 4}" y2="${CALF_RAIL[1]}" stroke="${GEAR}" stroke-width="3.2" stroke-linecap="round"/>` +
      `<line x1="-2" y1="${CALF_FLOOR}" x2="166" y2="${CALF_FLOOR}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "donkey-calf-raise": {
    /* "Set the pad on your lower back and hinge forward to about 90°.
     * Place the balls of your feet on the platform, heels hanging.
     * Rise up onto your toes ... lower slowly to a deep stretch." The
     * calf raise's rise under a trunk hinged to horizontal (pinned),
     * hands on a rail ahead (pinned), the pad drawn over the hips. */
    view: "side",
    concentricTo: 1,
    startsAt: "stretch",
    viewBox: "-4 30 172 188",
    groundY: CALF_FLOOR,
    shadowCx: 70,
    shadowRx: 40,
    tint: { calves: "primary", hamstring: "secondary" },
    pose: (e) => {
      const { legOps, rise } = calfRise(e);
      const HINGE = 88;
      const torso: Op[] = [
        { kind: "rotate", deg: HINGE, pivot: SIDE_ANCHORS.hip },
        ...rise,
      ];
      const head: Op[] = [
        { kind: "rotate", deg: -HINGE * HEAD_LIFT, pivot: SIDE_ANCHORS.neck },
        ...torso,
      ];
      const pelvis: Op[] = [
        {
          kind: "rotate",
          deg: HINGE * PELVIS_FOLLOW * 0.5,
          pivot: SIDE_ANCHORS.hip,
        },
        ...rise,
      ];
      const arm = armToWorld(torso, DONKEY_RAIL, ELBOW_LOW);
      return {
        shankL: legOps,
        shankR: legOps,
        thighL: rise,
        thighR: rise,
        pelvis,
        torso,
        head,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    scene: (_e, pose) => {
      const hip = applyToPoint(SIDE_ANCHORS.hip, pose.pelvis ?? []);
      return (
        `<rect x="52" y="${CALF_BLOCK_TOP}" width="26" height="${CALF_FLOOR - CALF_BLOCK_TOP}" rx="1.5" fill="${GEAR}"/>` +
        // The machine's pad over the lower back, on an arm from the post.
        `<rect x="${(hip[0] - 12).toFixed(1)}" y="${(hip[1] - 22).toFixed(1)}" width="26" height="8" rx="3" fill="${GEAR}"/>` +
        `<line x1="${(hip[0] + 1).toFixed(1)}" y1="${(hip[1] - 22).toFixed(1)}" x2="${(hip[0] + 1).toFixed(1)}" y2="${(hip[1] - 60).toFixed(1)}" stroke="${GEAR_DARK}" stroke-width="3"/>` +
        `<line x1="${DONKEY_RAIL[0] + 22}" y1="${DONKEY_RAIL[1] - 50}" x2="${DONKEY_RAIL[0] + 22}" y2="${CALF_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
        `<line x1="${DONKEY_RAIL[0] + 22}" y1="${DONKEY_RAIL[1]}" x2="${DONKEY_RAIL[0] - 4}" y2="${DONKEY_RAIL[1]}" stroke="${GEAR}" stroke-width="3.2" stroke-linecap="round"/>` +
        `<line x1="-2" y1="${CALF_FLOOR}" x2="166" y2="${CALF_FLOOR}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },

  "barbell-step-ups": {
    /* "Position a sturdy box at knee height, bar racked on your upper
     * traps. Step one foot fully onto the box, drive through that heel
     * to stand up. Bring the trailing leg up." The front foot planted
     * on the box (pinned) with the hip rising from standing on the
     * floor to standing on the box; the trailing foot leaves the floor
     * and lands on the box beside it (pinned at both ends); the bar
     * rides the traps as the squat's does (pinned). */
    view: "side",
    equip: "plate-end",
    plateR: 11,
    sleeveDir: -1,
    viewBox: "-12 -10 172 222",
    groundY: 204,
    shadowCx: 56,
    shadowRx: 40,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { quadriceps: "primary", gluteal: "secondary" },
    pose: (e) => {
      const hip: Pt = [lerp(36, 82, e), lerp(100, 48, e)];
      const body: Op[] = [
        {
          kind: "translate",
          dx: hip[0] - SIDE_ANCHORS.hip[0],
          dy: hip[1] - SIDE_ANCHORS.hip[1],
        },
      ];
      const backAnkle: Pt = [
        lerp(STEP_BACK_ANKLE_FLOOR[0], STEP_BACK_ANKLE_BOX[0], smooth(e)),
        lerp(STEP_BACK_ANKLE_FLOOR[1], STEP_BACK_ANKLE_BOX[1], smooth(e)),
      ];
      const front = plantedLeg(hip, STEP_FRONT_ANKLE, KNEE_FORWARD);
      const back = plantedLeg(hip, backAnkle, KNEE_LOW);
      const arm = backRackArms();
      return {
        head: body,
        torso: body,
        pelvis: body,
        thighL: front.thigh,
        shankL: front.shank,
        thighR: back.thigh,
        shankR: back.shank,
        upperArmL: [...arm.upper, ...body],
        foreArmL: [...arm.fore, ...body],
        handL: [...arm.fore, ...body],
        upperArmR: [...arm.upper, ...body],
        foreArmR: [...arm.fore, ...body],
        handR: [...arm.fore, ...body],
      };
    },
    bar: (_e, pose) => {
      const c = applyToPoint(BACK_RACK, pose.torso ?? []);
      return [c, c];
    },
    scene: () =>
      `<rect x="58" y="${STEP_BOX_TOP}" width="72" height="${MACHINE_FLOOR - STEP_BOX_TOP}" rx="2" fill="${GEAR}"/>` +
      `<line x1="-6" y1="${MACHINE_FLOOR + 1}" x2="156" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "pistol-squat": {
    /* "Stand on one leg, other leg extended straight in front, arms
     * forward for balance. Sit back and down on the working leg ...
     * lower until your butt nearly touches the heel of your working
     * foot." The squat chain driven far past parallel on the near leg
     * (foot planted — pinned; hip within a shin of the heel — pinned),
     * the far leg held straight out ahead and off the floor every frame
     * (pinned), both arms reaching forward. */
    view: "side",
    viewBox: "-30 -2 200 212",
    groundY: 204,
    shadowCx: 50,
    shadowRx: 40,
    concentricTo: 0,
    tint: { quadriceps: "primary", gluteal: "secondary", abs: "secondary" },
    pose: (e) => {
      const c = sideSquatChain(e, 48, -132, 26);
      const shift = c.torsoOps[1];
      const farThigh: Op[] = [
        { kind: "rotate", deg: PISTOL_FAR_LEG, pivot: SIDE_ANCHORS.hip },
        shift,
      ];
      const upper: Op[] = [
        { kind: "rotate", deg: -84, pivot: SIDE_ANCHORS.shoulder },
        ...c.torsoOps,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -4, pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        head: c.headOps,
        torso: c.torsoOps,
        pelvis: c.pelvisOps,
        thighL: c.thighOps,
        shankL: c.legOps,
        thighR: farThigh,
        shankR: farThigh,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    scene: () =>
      `<line x1="-26" y1="${MACHINE_FLOOR + 1}" x2="166" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  thrusters: {
    /* "Hold the bar in a front rack, elbows high ... squat down with an
     * upright torso until thighs are parallel. Drive up explosively and
     * use the leg momentum to press the bar overhead. Lower the bar
     * back to the rack and squat again in one fluid cycle." One
     * continuous e: the first half is the squat rising from parallel
     * (pinned) with the bar racked on the front delts (pinned), the
     * second half the press from the rack to lockout overhead (pinned)
     * standing tall. The eccentric runs it backwards, which IS the
     * cycle the instruction describes. */
    view: "side",
    equip: "plate-end",
    plateR: 11,
    viewBox: "-24 -40 192 250",
    groundY: 204,
    shadowCx: 56,
    shadowRx: 40,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      quadriceps: "primary",
      "front-deltoids": "primary",
      gluteal: "secondary",
      triceps: "secondary",
    },
    pose: (e) => {
      const squatE = clamp01(1 - e * 2); // 1 at e=0 (bottom) → 0 at e=0.5
      const pressE = clamp01(e * 2 - 1); // 0 until e=0.5 → 1 at e=1
      const c = sideSquatChain(squatE, 22);
      const S = SIDE_ANCHORS.shoulder;
      const H: Pt = [
        lerp(FRONT_RACK[0], OVERHEAD[0], pressE),
        lerp(FRONT_RACK[1], OVERHEAD[1], pressE),
      ];
      // Elbow forward (high) in the rack, forward of the bar overhead.
      const arm = aimArm(
        { S, E: SIDE_ANCHORS.elbow, H: SIDE_ANCHORS.hand },
        solveElbow(S, H, SIDE_UPPER_LEN, SIDE_FORE_LEN, -1),
        H,
        0
      );
      return {
        head: c.headOps,
        torso: c.torsoOps,
        pelvis: c.pelvisOps,
        thighL: c.thighOps,
        thighR: c.thighOps,
        shankL: c.legOps,
        shankR: c.legOps,
        upperArmL: [...arm.upper, ...c.torsoOps],
        foreArmL: [...arm.fore, ...c.torsoOps],
        handL: [...arm.fore, ...c.torsoOps],
        upperArmR: [...arm.upper, ...c.torsoOps],
        foreArmR: [...arm.fore, ...c.torsoOps],
        handR: [...arm.fore, ...c.torsoOps],
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
  },

  "chest-supported-db-row": {
    /* "Set an incline bench to 30-45° and lie face down, dumbbells
     * hanging below. Pin your chest to the pad ... row both dumbbells
     * toward your hips ... lower to a full stretch without letting your
     * chest leave the pad." The standing figure leaned forward rigidly
     * onto the pad (chest — the shoulder — never moves: pinned), feet
     * on the floor behind (pinned), the arm from plumb-and-straight at
     * the stretch (pinned) to the hand at the hip (pinned) with the
     * elbow driven up and back. */
    view: "side",
    equip: "dumbbell",
    viewBox: "-12 -6 176 218",
    groundY: 204,
    shadowCx: 70,
    shadowRx: 60,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      "upper-back": "primary",
      biceps: "secondary",
      trapezius: "secondary",
    },
    pose: (e) => {
      const body = rigidLeanForward(CSR_LEAN, CSR_ANKLE);
      const S = applyToPoint(SIDE_ANCHORS.shoulder, body);
      const hip = applyToPoint(SIDE_ANCHORS.hip, body);
      const reach = 0.99 * (SIDE_UPPER_LEN + SIDE_FORE_LEN);
      const H: Pt = [
        lerp(S[0], hip[0] + 6, e),
        lerp(S[1] + reach, hip[1] + 10, e),
      ];
      const arm = armToWorld(body, H, ELBOW_BACK);
      return {
        head: body,
        torso: body,
        pelvis: body,
        thighL: body,
        thighR: body,
        shankL: body,
        shankR: body,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: chestSupportedPadScene,
  },

  /* ── 2026-09-03 build-out, batch 8: the rest of the cables ── */

  "reverse-grip-cable-pushdown": {
    /* "Attach a straight bar to a high pulley, grip underhand ... pin
     * your elbows to your sides ... push the bar down to full lockout."
     * The rope pushdown's arc with a BAR on the cable — the implement
     * the alias-hygiene rule said it had to have before it could leave
     * the static fallback. The underhand grip is a frontal-plane fact
     * the profile cannot show; the pinned elbow and the lockout can. */
    view: "side",
    equip: "cable-handle",
    pulley: HIGH_PULLEY,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { triceps: "primary", forearm: "secondary" },
    pose: (e) => {
      const fore = pushdownFore(e);
      return { foreArmL: fore, handL: fore, foreArmR: fore, handR: fore };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
  },

  "single-arm-cable-pushdown": {
    /* "Attach a single handle to a high pulley, grip neutrally with one
     * hand. Pin your elbow at your side — it stays put the whole set.
     * Push the handle down ... to full lockout." One arm works the
     * pushdown arc on a single handle; the other hangs (unilateral by
     * instruction). */
    view: "side",
    equip: "cable-handle",
    pulley: HIGH_PULLEY,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { triceps: "primary", forearm: "secondary" },
    pose: (e) => {
      const fore = pushdownFore(e);
      return { foreArmL: fore, handL: fore };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
  },

  "overhead-cable-tricep-extension": {
    /* "Face away from a low pulley with a rope held behind your head.
     * Stagger your stance and lean slightly forward ... extend your arms
     * overhead until fully straight, keeping elbows close to your head.
     * Lower slowly to a deep triceps stretch." The dumbbell overhead
     * extension's arm on a staggered, slightly-hinged stance, the cable
     * running from a low pulley BEHIND the lifter up to the grip. The
     * rope's two strands stack in profile, so the grip is drawn as one
     * handle end-on. */
    view: "side",
    equip: "cable-handle",
    pulley: LOW_PULLEY_BEHIND,
    viewBox: "-40 -50 168 262",
    groundY: 204,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { triceps: "primary", "front-deltoids": "secondary" },
    pose: (e) => {
      const st = staggeredStance(12);
      const upper: Op[] = [
        { kind: "rotate", deg: 176, pivot: SIDE_ANCHORS.shoulder },
        ...st.torso,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: lerp(-100, -8, e), pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        head: st.head,
        torso: st.torso,
        pelvis: st.pelvis,
        thighL: st.nearLeg,
        shankL: st.nearLeg,
        thighR: st.farLeg,
        shankR: st.farLeg,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () =>
      `<line x1="${LOW_PULLEY_BEHIND[0] - 4}" y1="-50" x2="${LOW_PULLEY_BEHIND[0] - 4}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
      `<line x1="-40" y1="${MACHINE_FLOOR + 1}" x2="128" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "bayesian-cable-curl": {
    /* "Face away from a low cable, handle in one hand, stagger your
     * stance. Let the cable pull your arm back so the elbow sits behind
     * your torso. Curl your hand up to your shoulder, keeping the elbow
     * behind you." Staggered stance, the working upper arm held BEHIND
     * the trunk line (pinned, every frame) with the cable from the low
     * pulley behind, forearm curling to the shoulder; the other arm
     * hangs (unilateral by instruction). */
    view: "side",
    equip: "cable-handle",
    pulley: LOW_PULLEY_BEHIND,
    viewBox: "-40 -6 168 218",
    groundY: 204,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { biceps: "primary", forearm: "secondary" },
    pose: (e) => {
      const st = staggeredStance(6);
      const upper: Op[] = [
        { kind: "rotate", deg: 24, pivot: SIDE_ANCHORS.shoulder },
        ...st.torso,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -lerp(0, 132, e), pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        head: st.head,
        torso: st.torso,
        pelvis: st.pelvis,
        thighL: st.nearLeg,
        shankL: st.nearLeg,
        thighR: st.farLeg,
        shankR: st.farLeg,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: st.torso,
        foreArmR: st.torso,
        handR: st.torso,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () =>
      `<line x1="${LOW_PULLEY_BEHIND[0] - 4}" y1="-6" x2="${LOW_PULLEY_BEHIND[0] - 4}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
      `<line x1="-40" y1="${MACHINE_FLOOR + 1}" x2="128" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "reverse-barbell-curl": {
    /* "Stand with the bar at your thighs, overhand grip ... pin elbows
     * at your sides ... curl the bar up to shoulder height." The strict
     * curl's arc — an overhand grip is invisible end-on and does not
     * change it — with the emphasis the catalogue gives it: forearm
     * (brachioradialis) first, biceps second. Own demo rather than an
     * alias because an alias would inherit the barbell curl's tints. */
    view: "side",
    equip: "plate-end",
    plateR: 10,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { forearm: "primary", biceps: "secondary" },
    pose: strictCurlPose,
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
  },

  "spider-db-curl": {
    /* "Lie face down on an incline bench with arms hanging straight ...
     * chest pinned to the pad. Curl the dumbbells up to your shoulders
     * without moving your upper arms." The chest-supported row's body on
     * the pad; the upper arm hangs PLUMB and stays there (pinned), the
     * forearm curls to the shoulder. */
    view: "side",
    equip: "dumbbell",
    viewBox: "-12 -6 176 218",
    groundY: 204,
    shadowCx: 70,
    shadowRx: 60,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { biceps: "primary", forearm: "secondary" },
    pose: (e) => {
      const body = rigidLeanForward(CSR_LEAN, CSR_ANKLE);
      // The body leans (90 − CSR_LEAN) forward; hanging plumb means
      // cancelling exactly that in the arm's own frame.
      const upper: Op[] = [
        { kind: "rotate", deg: -(90 - CSR_LEAN), pivot: SIDE_ANCHORS.shoulder },
        ...body,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -lerp(0, 128, e), pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        head: body,
        torso: body,
        pelvis: body,
        thighL: body,
        thighR: body,
        shankL: body,
        shankR: body,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: chestSupportedPadScene,
  },

  "single-arm-lat-pulldown": {
    /* "Attach a single handle to a high pulley and sit ... facing it.
     * Grip the handle neutrally and lean slightly away for a deeper
     * stretch. Pull the handle down toward your side, elbow driving
     * back behind your torso. Return slowly to a full overhead
     * stretch." Seated under the knee pad, trunk leaned 12 away from the
     * stack, one arm from full reach toward the high pulley down to the
     * side with the elbow solved BEHIND the trunk; the other hand holds
     * the seat (unilateral by instruction). */
    view: "side",
    equip: "cable-handle",
    pulley: PULLDOWN_PULLEY,
    viewBox: "-12 -20 160 232",
    groundY: 204,
    shadowCx: 62,
    shadowRx: 40,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { "upper-back": "primary", biceps: "secondary" },
    pose: (e) => {
      const chain = seatedChain(PULLDOWN_SEAT, -74, 74, -12);
      const S = applyToPoint(SIDE_ANCHORS.shoulder, chain.torso);
      // Full reach toward the pulley at the stretch; beside the ribs at
      // the finish.
      const toP: Pt = [PULLDOWN_PULLEY[0] - S[0], PULLDOWN_PULLEY[1] - S[1]];
      const d = Math.hypot(toP[0], toP[1]);
      const H0: Pt = [
        S[0] + (toP[0] / d) * STRAIGHT_ARM,
        S[1] + (toP[1] / d) * STRAIGHT_ARM,
      ];
      const H1: Pt = [S[0] + 4, S[1] + 34];
      const H: Pt = [lerp(H0[0], H1[0], e), lerp(H0[1], H1[1], e)];
      const arm = armToWorld(chain.torso, H, ELBOW_BACK);
      return {
        head: chain.head,
        torso: chain.torso,
        pelvis: chain.body,
        thighL: chain.thigh,
        thighR: chain.thigh,
        shankL: chain.shank,
        shankR: chain.shank,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: chain.arm.upper,
        foreArmR: chain.arm.fore,
        handR: chain.arm.fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: (_e, pose) => {
      const k = applyToPoint(SIDE_ANCHORS.knee, pose.thighL ?? []);
      return (
        machineSeatScene(PULLDOWN_SEAT, -12) +
        // Knee pad over the thighs, and the station's post at the pulley.
        `<rect x="${(k[0] - 22).toFixed(1)}" y="${(k[1] - 22).toFixed(1)}" width="26" height="8" rx="3" fill="${GEAR}"/>` +
        // The station: a post clear of the knees, its arm out to the pulley.
        `<line x1="132" y1="-20" x2="132" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
        `<line x1="132" y1="${PULLDOWN_PULLEY[1] - 4}" x2="${PULLDOWN_PULLEY[0]}" y2="${PULLDOWN_PULLEY[1] - 4}" stroke="${GEAR_DARK}" stroke-width="3"/>`
      );
    },
  },

  "cable-glute-kickback": {
    /* "Attach an ankle strap to a low pulley and face the stack. Grip
     * the frame for balance, hinge slightly, core braced. Kick the
     * working leg straight back, squeezing the glute at full extension."
     * Slight hinge held on the planted far leg, hands on the frame; the
     * near leg swings straight back from the hip with the cable running
     * from the low pulley in front to the ankle strap. */
    view: "side",
    equip: "cable-handle",
    pulley: KICKBACK_PULLEY,
    viewBox: "-40 -6 168 218",
    groundY: 204,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { gluteal: "primary", hamstring: "secondary" },
    pose: (e) => {
      const HINGE = 18;
      const LEAN = hipsBack(HINGE);
      const torso: Op[] = [
        { kind: "rotate", deg: HINGE, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      const head: Op[] = [
        { kind: "rotate", deg: -HINGE * HEAD_LIFT, pivot: SIDE_ANCHORS.neck },
        ...torso,
      ];
      const pelvis: Op[] = [
        { kind: "rotate", deg: HINGE * PELVIS_FOLLOW, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      const planted: Op[] = [LEAN];
      const working: Op[] = [
        { kind: "rotate", deg: lerp(-4, 42, e), pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      // Hands on the frame ahead at shoulder height.
      const upper: Op[] = [
        { kind: "rotate", deg: -78, pivot: SIDE_ANCHORS.shoulder },
        ...torso,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -18, pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        head,
        torso,
        pelvis,
        thighL: working,
        shankL: working,
        thighR: planted,
        shankR: planted,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    // The cable runs to the ankle strap, not a hand.
    bar: (_e, pose) => {
      const a = applyToPoint(SIDE_ANCHORS.ankle, pose.shankL ?? []);
      return [a, a];
    },
    scene: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return (
        `<line x1="${KICKBACK_PULLEY[0] + 4}" y1="-6" x2="${KICKBACK_PULLEY[0] + 4}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
        `<line x1="${(h[0] - 4).toFixed(1)}" y1="${(h[1] + 3).toFixed(1)}" x2="${KICKBACK_PULLEY[0] + 4}" y2="${(h[1] + 3).toFixed(1)}" stroke="${GEAR_DARK}" stroke-width="3"/>` +
        `<line x1="-40" y1="${MACHINE_FLOOR + 1}" x2="128" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },

  /* ── 2026-09-03 build-out, batch 9: landmines, levers, inversions ── */

  "landmine-press": {
    /* "Stagger your stance facing the landmine, bar end at shoulder
     * height. Grip the end with one hand, other arm tucked at your side
     * ... press the bar up and forward until your arm is fully
     * extended. Lower under control to your shoulder." The bar is an
     * ARC about the floor sleeve, so the hand rides that arc from the
     * shoulder to the point one straight arm from the shoulder that
     * still lies on it (a circle-circle solve, the same two-bone
     * machinery the elbows use). */
    view: "side",
    equip: "landmine",
    pivot: LANDMINE_PIVOT,
    viewBox: "-24 -30 190 242",
    groundY: 204,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      "front-deltoids": "primary",
      chest: "secondary",
      triceps: "secondary",
    },
    pose: (e) => {
      const st = staggeredStance(4);
      const S = applyToPoint(SIDE_ANCHORS.shoulder, st.torso);
      const H0: Pt = [S[0] + 20, S[1] + 6];
      const r = Math.hypot(
        H0[0] - LANDMINE_PIVOT[0],
        H0[1] - LANDMINE_PIVOT[1]
      );
      // The point one straight arm from the shoulder AND one bar length
      // from the pivot — the upper of the two.
      const H1 = ELBOW_HIGH(
        solveElbow(S, LANDMINE_PIVOT, STRAIGHT_ARM, r, 1),
        solveElbow(S, LANDMINE_PIVOT, STRAIGHT_ARM, r, -1)
      );
      const a0 = Math.atan2(
        H0[1] - LANDMINE_PIVOT[1],
        H0[0] - LANDMINE_PIVOT[0]
      );
      const a1 = Math.atan2(
        H1[1] - LANDMINE_PIVOT[1],
        H1[0] - LANDMINE_PIVOT[0]
      );
      const a = lerp(a0, a1, e);
      const H: Pt = [
        LANDMINE_PIVOT[0] + r * Math.cos(a),
        LANDMINE_PIVOT[1] + r * Math.sin(a),
      ];
      const arm = armToWorld(st.torso, H, ELBOW_LOW);
      return {
        head: st.head,
        torso: st.torso,
        pelvis: st.pelvis,
        thighL: st.nearLeg,
        shankL: st.nearLeg,
        thighR: st.farLeg,
        shankR: st.farLeg,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: st.torso,
        foreArmR: st.torso,
        handR: st.torso,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () =>
      `<line x1="-24" y1="${MACHINE_FLOOR + 1}" x2="166" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "landmine-squat": {
    /* "Grip the loaded end at chest height ... squat down with an
     * upright torso, letting the bar arc in toward your chest. Drive
     * up ... keeping the bar hugged to your chest." The squat chain at
     * a 12-degree hinge (the goblet's upright trunk), the hands FIXED
     * on the chest in trunk space so the bar end rides the body, and
     * the shaft drawn from the floor sleeve through them. */
    view: "side",
    equip: "landmine",
    pivot: LANDMINE_SQUAT_PIVOT,
    viewBox: "-24 -6 196 218",
    groundY: 204,
    shadowCx: 56,
    shadowRx: 40,
    concentricTo: 0,
    tint: { quadriceps: "primary", gluteal: "secondary", abs: "secondary" },
    pose: (e) => {
      const c = sideSquatChain(e, 12);
      const S = SIDE_ANCHORS.shoulder;
      const H: Pt = [S[0] + 14, S[1] + 12];
      // Elbows pinned IN: the low branch, under the bar against the ribs.
      const arm = aimArm(
        { S, E: SIDE_ANCHORS.elbow, H: SIDE_ANCHORS.hand },
        ELBOW_LOW(
          solveElbow(S, H, SIDE_UPPER_LEN, SIDE_FORE_LEN, 1),
          solveElbow(S, H, SIDE_UPPER_LEN, SIDE_FORE_LEN, -1)
        ),
        H,
        0
      );
      return {
        head: c.headOps,
        torso: c.torsoOps,
        pelvis: c.pelvisOps,
        thighL: c.thighOps,
        thighR: c.thighOps,
        shankL: c.legOps,
        shankR: c.legOps,
        upperArmL: [...arm.upper, ...c.torsoOps],
        foreArmL: [...arm.fore, ...c.torsoOps],
        handL: [...arm.fore, ...c.torsoOps],
        upperArmR: [...arm.upper, ...c.torsoOps],
        foreArmR: [...arm.fore, ...c.torsoOps],
        handR: [...arm.fore, ...c.torsoOps],
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () =>
      `<line x1="-24" y1="${MACHINE_FLOOR + 1}" x2="172" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "meadows-row": {
    /* "Anchor one end of a barbell in a landmine and stand perpendicular
     * to it. Stagger your stance and grip the loaded end overhand. Row
     * the end toward your hip, driving your elbow back ... keeping the
     * hinge locked." Perpendicular to the bar means the bar points AT
     * the camera in profile — so the loaded end is the deadlift's end-on
     * plate, at one hand. A locked 45-degree hinge, the near arm rowing
     * from a straight hang to the hip with the elbow behind the trunk;
     * the far hand braces on the far thigh (unilateral by instruction). */
    view: "side",
    equip: "plate-end",
    plateR: 10,
    viewBox: "-30 -6 160 218",
    groundY: 204,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      "upper-back": "primary",
      biceps: "secondary",
      trapezius: "secondary",
    },
    pose: (e) => {
      // 56 at the hip nets ~45 from the rest trunk once the whole body
      // leans back about the heel to balance it.
      const st = staggeredStance(56);
      const S = applyToPoint(SIDE_ANCHORS.shoulder, st.torso);
      const hip = applyToPoint(SIDE_ANCHORS.hip, st.torso);
      const H: Pt = [
        lerp(S[0] + 2, hip[0] + 10, e),
        lerp(S[1] + STRAIGHT_ARM, hip[1] + 4, e),
      ];
      const arm = armToWorld(st.torso, H, ELBOW_BACK);
      // Far arm: braced on the far thigh.
      const brace: Op[] = [
        { kind: "rotate", deg: -56 - 4, pivot: SIDE_ANCHORS.shoulder },
        ...st.torso,
      ];
      const braceFore: Op[] = [
        { kind: "rotate", deg: -18, pivot: SIDE_ANCHORS.elbow },
        ...brace,
      ];
      return {
        head: st.head,
        torso: st.torso,
        pelvis: st.pelvis,
        thighL: st.nearLeg,
        shankL: st.nearLeg,
        thighR: st.farLeg,
        shankR: st.farLeg,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: brace,
        foreArmR: braceFore,
        handR: braceFore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () =>
      `<line x1="-30" y1="${MACHINE_FLOOR + 1}" x2="130" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "chest-press-machine": {
    /* "Handles level with your mid-chest. Pin your back to the pad and
     * plant your feet ... press the handles forward until your arms are
     * fully extended. Return slowly." Seated against a backrest, feet
     * flat, the hand travelling a horizontal line at mid-chest from
     * beside the chest to full extension, the lever arm drawn from the
     * machine's pivot to the handle. */
    view: "side",
    equip: "lever-handle",
    pivot: CHEST_PRESS_PIVOT,
    viewBox: "-12 -6 172 218",
    groundY: 204,
    shadowCx: 60,
    shadowRx: 40,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      chest: "primary",
      triceps: "secondary",
      "front-deltoids": "secondary",
    },
    pose: (e) => {
      const chain = seatedChain(PREACHER_SEAT, -80, 80, -6);
      const S = applyToPoint(SIDE_ANCHORS.shoulder, chain.torso);
      const H: Pt = [lerp(S[0] + 16, S[0] + STRAIGHT_ARM, e), S[1] + 16];
      const arm = armToWorld(chain.torso, H, ELBOW_LOW);
      return {
        head: chain.head,
        torso: chain.torso,
        pelvis: chain.body,
        thighL: chain.thigh,
        thighR: chain.thigh,
        shankL: chain.shank,
        shankR: chain.shank,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () =>
      machineSeatScene(PREACHER_SEAT, -6) +
      `<line x1="${CHEST_PRESS_PIVOT[0] + 10}" y1="${CHEST_PRESS_PIVOT[1] - 30}" x2="${CHEST_PRESS_PIVOT[0] + 10}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
      `<line x1="${CHEST_PRESS_PIVOT[0] + 10}" y1="${CHEST_PRESS_PIVOT[1]}" x2="${CHEST_PRESS_PIVOT[0]}" y2="${CHEST_PRESS_PIVOT[1]}" stroke="${GEAR_DARK}" stroke-width="3"/>`,
  },

  "shoulder-press-machine": {
    /* "Handles line up with shoulder height. Pin your back to the pad
     * ... press straight up to full extension without shrugging your
     * traps. Lower under control." Same seat; the hand from beside the
     * shoulder straight up to lockout, the shoulder itself never moving
     * (pinned — that is the no-shrug), lever from a pivot behind-above. */
    view: "side",
    equip: "lever-handle",
    pivot: SHOULDER_PRESS_PIVOT,
    viewBox: "-12 -40 172 252",
    groundY: 204,
    shadowCx: 60,
    shadowRx: 40,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { "front-deltoids": "primary", triceps: "secondary" },
    pose: (e) => {
      const chain = seatedChain(PREACHER_SEAT, -80, 80, -6);
      const S = applyToPoint(SIDE_ANCHORS.shoulder, chain.torso);
      const H: Pt = [
        lerp(S[0] + 16, S[0] + 4, e),
        lerp(S[1] + 6, S[1] - STRAIGHT_ARM, e),
      ];
      const arm = armToWorld(chain.torso, H, ELBOW_LOW);
      return {
        head: chain.head,
        torso: chain.torso,
        pelvis: chain.body,
        thighL: chain.thigh,
        thighR: chain.thigh,
        shankL: chain.shank,
        shankR: chain.shank,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () =>
      machineSeatScene(PREACHER_SEAT, -6) +
      `<line x1="${SHOULDER_PRESS_PIVOT[0] + 10}" y1="${SHOULDER_PRESS_PIVOT[1] - 20}" x2="${SHOULDER_PRESS_PIVOT[0] + 10}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
      `<line x1="${SHOULDER_PRESS_PIVOT[0] + 10}" y1="${SHOULDER_PRESS_PIVOT[1]}" x2="${SHOULDER_PRESS_PIVOT[0]}" y2="${SHOULDER_PRESS_PIVOT[1]}" stroke="${GEAR_DARK}" stroke-width="3"/>`,
  },

  "jm-press": {
    /* "Lie flat, bar pressed up over your chest ... lower the bar toward
     * your upper chin by bending the elbows forward. Let the bar sink
     * close to your throat but never touch down. Press back to lockout
     * by driving the elbows forward and up." The bench chain with a
     * different bar path: lockout over the shoulder, bottom at the chin
     * — and the elbow on the ANTERIOR branch (forward of the bar, which
     * lying down is above it), the opposite of the bench's tuck. */
    view: "side",
    equip: "plate-end",
    concentricTo: 1,
    viewBox: "-64 20 186 162",
    groundY: 172,
    shadowCx: 40,
    shadowRx: 68,
    tint: {
      triceps: "primary",
      chest: "secondary",
      "front-deltoids": "secondary",
    },
    pose: (e) => {
      const G: Op = { kind: "rotate", deg: -90, pivot: [44, 100] };
      const S = SIDE_ANCHORS.shoulder;
      // Body space: +x anterior (up off the bench), -y toward the head.
      const H: Pt = [S[0] + lerp(15, BENCH_LOCKOUT, e), S[1] + lerp(-14, 4, e)];
      const arm = aimArm(
        { S, E: SIDE_ANCHORS.elbow, H: SIDE_ANCHORS.hand },
        ELBOW_FRONT(
          solveElbow(S, H, SIDE_UPPER_LEN, SIDE_FORE_LEN, 1),
          solveElbow(S, H, SIDE_UPPER_LEN, SIDE_FORE_LEN, -1)
        ),
        H,
        0
      );
      const leg: Op[] = [
        { kind: "rotate", deg: BENCH_THIGH, pivot: SIDE_ANCHORS.hip },
        G,
      ];
      const shank: Op[] = [
        { kind: "rotate", deg: 90 - BENCH_THIGH, pivot: SIDE_ANCHORS.knee },
        { kind: "rotate", deg: BENCH_THIGH, pivot: SIDE_ANCHORS.hip },
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
        upperArmR: [...arm.upper, G],
        foreArmR: [...arm.fore, G],
        handR: [...arm.fore, G],
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: flatBenchScene,
  },

  "pike-push-up": {
    /* "Downward-dog with hands shoulder-width and hips stacked high
     * ... torso nearly vertical over your hands. Bend your elbows and
     * lower the crown of your head toward the floor. Press back up to
     * straight arms, keeping your hips piked high." Hands and feet
     * FIXED on the floor; the shoulder sits over the hands at the arm's
     * current reach, and the hip is solved from the ankle and the
     * shoulder as the apex of a leg-and-trunk pair — a pike by
     * construction, with the legs straight. */
    view: "side",
    viewBox: "-12 -6 176 218",
    groundY: 204,
    shadowCx: 54,
    shadowRx: 56,
    concentricTo: 0,
    tint: {
      "front-deltoids": "primary",
      triceps: "secondary",
      chest: "secondary",
    },
    pose: (e) => {
      const reach = lerp(STRAIGHT_ARM, HEAD_ABOVE_SHOULDER + 4, e);
      const S: Pt = [PIKE_HAND[0] - 6, PIKE_HAND[1] - reach];
      const hip = ELBOW_HIGH(
        solveElbow(PIKE_ANKLE, S, LEG_LEN * 0.995, TRUNK_LEN, 1),
        solveElbow(PIKE_ANKLE, S, LEG_LEN * 0.995, TRUNK_LEN, -1)
      );
      const torso = trunkBetween(hip, S);
      const leg = plantedLeg(hip, PIKE_ANKLE, KNEE_HIGH);
      const arm = armToWorld(torso, PIKE_HAND, ELBOW_BACK);
      return {
        head: torso,
        torso,
        pelvis: torso,
        thighL: leg.thigh,
        thighR: leg.thigh,
        shankL: leg.shank,
        shankR: leg.shank,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    scene: () =>
      `<line x1="-12" y1="${MACHINE_FLOOR + 1}" x2="164" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "handstand-push-ups": {
    /* "Kick into a handstand against a wall, arms locked, body stacked
     * ... lower by bending your elbows until the top of your head
     * touches the floor. Press back up to full arm extension, keeping
     * the line tight." The standing figure turned over: hands FIXED on
     * the floor, the whole body stacked plumb above the shoulder, which
     * sits at the arm's current reach; at the bottom that reach is the
     * skull's height, so the crown meets the floor. */
    view: "side",
    viewBox: "-40 -40 190 252",
    groundY: 204,
    shadowCx: 50,
    shadowRx: 30,
    concentricTo: 0,
    tint: {
      "front-deltoids": "primary",
      triceps: "secondary",
      trapezius: "secondary",
    },
    pose: (e) => {
      const reach = lerp(STRAIGHT_ARM, HEAD_ABOVE_SHOULDER + 2, e);
      const S: Pt = [HSPU_HAND[0], HSPU_HAND[1] - reach];
      const body: Op[] = [
        { kind: "rotate", deg: 180, pivot: SIDE_ANCHORS.shoulder },
        {
          kind: "translate",
          dx: S[0] - SIDE_ANCHORS.shoulder[0],
          dy: S[1] - SIDE_ANCHORS.shoulder[1],
        },
      ];
      const arm = armToWorld(body, HSPU_HAND, ELBOW_BACK);
      return {
        head: body,
        torso: body,
        pelvis: body,
        thighL: body,
        thighR: body,
        shankL: body,
        shankR: body,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    scene: () =>
      `<line x1="${HSPU_WALL_X}" y1="-40" x2="${HSPU_WALL_X}" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="3"/>` +
      `<line x1="-40" y1="${MACHINE_FLOOR + 1}" x2="150" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "dragon-flag": {
    /* "Lie on a bench, gripping the edge behind your head. Raise your
     * whole body vertically, supported only on your upper back. Lower
     * as one rigid plank until nearly parallel to the bench ... never
     * letting the hips bend." The supine body on a bench, the trunk +
     * pelvis + straight legs rotating as ONE piece about the shoulder
     * (the only support) from vertical to just above the bench; the
     * arms reach back to the bench edge and stay there. */
    view: "side",
    viewBox: "-70 -20 190 232",
    groundY: 204,
    shadowCx: 20,
    shadowRx: 60,
    concentricTo: 0,
    tint: { abs: "primary", "lower-back": "secondary" },
    pose: (e) => {
      const G: Op = { kind: "rotate", deg: -90, pivot: [44, 100] };
      const sG = applyToPoint(SIDE_ANCHORS.shoulder, [G]);
      const T0: Op = {
        kind: "translate",
        dx: 0,
        dy: DRAGON_BENCH_Y - 8 - sG[1],
      };
      const base: Op[] = [G, T0];
      const Sw: Pt = [sG[0], DRAGON_BENCH_Y - 8];
      // Negative = hips UP about the shoulder (the bridge's convention).
      const body: Op[] = [
        ...base,
        { kind: "rotate", deg: lerp(-84, -14, e), pivot: Sw },
      ];
      const arms: Op[] = [
        { kind: "rotate", deg: 172, pivot: SIDE_ANCHORS.shoulder },
        ...base,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -22, pivot: SIDE_ANCHORS.elbow },
        ...arms,
      ];
      return {
        head: base,
        torso: body,
        pelvis: body,
        thighL: body,
        thighR: body,
        shankL: body,
        shankR: body,
        upperArmL: arms,
        foreArmL: fore,
        handL: fore,
        upperArmR: arms,
        foreArmR: fore,
        handR: fore,
      };
    },
    scene: () =>
      `<rect x="-90" y="${DRAGON_BENCH_Y}" width="138" height="8" rx="2.6" fill="${GEAR}"/>` +
      `<line x1="-76" y1="${DRAGON_BENCH_Y + 8}" x2="-50" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
      `<line x1="34" y1="${DRAGON_BENCH_Y + 8}" x2="34" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
      `<line x1="-70" y1="${MACHINE_FLOOR + 1}" x2="120" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  /* ── 2026-09-03 build-out, batch 10: holds with a set-up, two transitions ── */

  plank: {
    /* "Get on your forearms, elbows directly under your shoulders.
     * Extend your legs back, tuck your toes under, and lift your hips
     * off the floor. Make one straight line from the back of your head
     * to your heels ... hold for time." A hold has no rep, but its first
     * three instructions are a MOTION, and that is what is drawn: the
     * shoulder fixed over the elbow on the floor, the feet extending
     * back as the hips lift from the floor into the line. */
    view: "side",
    viewBox: "-90 40 220 168",
    groundY: 204,
    shadowCx: 20,
    shadowRx: 70,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      abs: "primary",
      gluteal: "secondary",
      "front-deltoids": "secondary",
    },
    pose: (e) => plankPose(e),
    scene: () =>
      `<line x1="-90" y1="${MACHINE_FLOOR + 1}" x2="130" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "weighted-plank": {
    /* "Get into a forearm plank ... have a partner place a plate on your
     * upper back over the shoulder blades ... hold rigid for time." The
     * plank's set-up with the plate on the upper back once the line is
     * made — drawn on the back, over the shoulder blades, riding the
     * trunk. */
    view: "side",
    viewBox: "-90 40 220 168",
    groundY: 204,
    shadowCx: 20,
    shadowRx: 70,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { abs: "primary", gluteal: "secondary", "upper-back": "secondary" },
    pose: (e) => plankPose(e),
    scene: (_e, pose) => {
      // The plate: a slab on the back over the shoulder blades, in trunk
      // space so it rides the line.
      const c = applyToPoint(
        [SIDE_ANCHORS.shoulder[0] - 14, SIDE_ANCHORS.shoulder[1] + 12],
        pose.torso ?? []
      );
      const S = applyToPoint(SIDE_ANCHORS.shoulder, pose.torso ?? []);
      const hip = applyToPoint(SIDE_ANCHORS.hip, pose.pelvis ?? []);
      const ang = (Math.atan2(S[1] - hip[1], S[0] - hip[0]) * 180) / Math.PI;
      return (
        `<line x1="-90" y1="${MACHINE_FLOOR + 1}" x2="130" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>` +
        `<rect x="${(c[0] - 11).toFixed(1)}" y="${(c[1] - 7).toFixed(1)}" width="22" height="5" rx="1.6" fill="${GEAR_DARK}" stroke="${GEAR_EDGE}" stroke-width="0.8" transform="rotate(${ang.toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)})"/>`
      );
    },
  },

  "l-sit": {
    /* "Support yourself on parallel bars or the floor with straight
     * arms, shoulders packed. Raise your legs straight out in front of
     * you until they're parallel to the ground ... hold." Straight arms
     * down to parallettes with the hips off the floor; the legs, kept
     * straight, swing from heels-on-the-floor to horizontal. */
    view: "side",
    viewBox: "-12 -6 176 218",
    groundY: 204,
    shadowCx: 70,
    shadowRx: 50,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      abs: "primary",
      triceps: "secondary",
      "front-deltoids": "secondary",
    },
    pose: (e) => {
      const body: Op[] = [
        {
          kind: "translate",
          dx: LSIT_HIP[0] - SIDE_ANCHORS.hip[0],
          dy: LSIT_HIP[1] - SIDE_ANCHORS.hip[1],
        },
      ];
      const legs: Op[] = [
        { kind: "rotate", deg: lerp(-77, -92, e), pivot: SIDE_ANCHORS.hip },
        ...body,
      ];
      const arm = armToWorld(body, LSIT_HAND, ELBOW_BACK);
      return {
        head: body,
        torso: body,
        pelvis: body,
        thighL: legs,
        thighR: legs,
        shankL: legs,
        shankR: legs,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    scene: () =>
      // Parallettes: a short bar under each hand (one in profile) on two feet.
      `<line x1="${LSIT_HAND[0] - 14}" y1="${LSIT_HAND[1] + 3}" x2="${LSIT_HAND[0] + 14}" y2="${LSIT_HAND[1] + 3}" stroke="${GEAR}" stroke-width="3.2" stroke-linecap="round"/>` +
      `<line x1="${LSIT_HAND[0] - 10}" y1="${LSIT_HAND[1] + 4}" x2="${LSIT_HAND[0] - 10}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="2.4"/>` +
      `<line x1="${LSIT_HAND[0] + 10}" y1="${LSIT_HAND[1] + 4}" x2="${LSIT_HAND[0] + 10}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="2.4"/>` +
      `<line x1="-12" y1="${MACHINE_FLOOR + 1}" x2="164" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "muscle-ups": {
    /* "Hang from the bar ... pull yourself up explosively, leaning back
     * ... roll your wrists forward over the bar as chest passes it.
     * Press up to full lockout above the bar, then lower with control."
     * Two halves on one e: a pull (the shoulder rising to the bar, body
     * leaned back) then the transition and press (the shoulder passing
     * over the bar to one straight arm ABOVE it). Hands fixed on the
     * bar throughout; the elbow branch flips at the bar, which is where
     * the wrists roll. */
    view: "side",
    // The bar is drawn as an end-on grip hanging from its stem, IN FRONT
    // of the body: at lockout the thighs pass in front of the bar's
    // height, and a scene-drawn bar vanished behind them.
    equip: "cable-handle",
    pulley: [MUSCLE_UP_BAR[0], -100],
    viewBox: "-50 -100 220 350",
    groundY: 246,
    shadowCx: 50,
    shadowRx: 34,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { "upper-back": "primary", chest: "secondary", triceps: "secondary" },
    pose: (e) => {
      const S = muscleUpShoulder(e);
      const lean = e < 0.5 ? lerp(-4, -16, e * 2) : lerp(-16, 0, (e - 0.5) * 2);
      const body: Op[] = [
        { kind: "rotate", deg: lean, pivot: SIDE_ANCHORS.shoulder },
        {
          kind: "translate",
          dx: S[0] - SIDE_ANCHORS.shoulder[0],
          dy: S[1] - SIDE_ANCHORS.shoulder[1],
        },
      ];
      const arm = armToWorld(
        body,
        MUSCLE_UP_BAR,
        e < 0.5 ? ELBOW_FRONT : ELBOW_BACK
      );
      return {
        head: body,
        torso: body,
        pelvis: body,
        thighL: body,
        thighR: body,
        shankL: body,
        shankR: body,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    bar: () => [MUSCLE_UP_BAR, MUSCLE_UP_BAR],
    scene: () =>
      `<line x1="-40" y1="247" x2="150" y2="247" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "clean-and-press": {
    /* "Set up over the bar like a deadlift ... explosively extend hips
     * and catch the bar on your front delts. Dip into a quarter squat
     * and drive the bar overhead to lockout. Lower to shoulders, then to
     * the floor." Three movements on one e, in the order the
     * instructions give them: the deadlift's own hinge to standing
     * (0-0.4), the catch — hands from the hang to the front rack (0.3-
     * 0.45) — then the thruster's dip and press (0.45-1). Played back
     * the other way it is instruction 4. */
    view: "side",
    equip: "plate-end",
    plateR: 14,
    viewBox: "-24 -40 192 250",
    groundY: 204,
    shadowCx: 56,
    shadowRx: 44,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      hamstring: "primary",
      gluteal: "primary",
      "front-deltoids": "primary",
      quadriceps: "secondary",
      triceps: "secondary",
    },
    pose: (e) => {
      const pullE = clamp01(1 - e / 0.4); // deadlift depth: 1 at e=0 → 0 at 0.4
      const catchE = smooth((e - 0.3) / 0.15); // hang → rack
      const dipE =
        e < 0.45
          ? 0
          : e < 0.6
            ? smooth((e - 0.45) / 0.15)
            : smooth(1 - (e - 0.6) / 0.25);
      const pressE = clamp01((e - 0.6) / 0.4);
      // Legs + trunk: the hinge until standing, then the dip.
      const lift = hingeLift(pullE, pullE, 70, -64, 8, lerp(8, -5, pullE));
      const dip = sideSquatChain(dipE * 0.35, 8);
      const standing = e >= 0.45;
      const torso = standing ? dip.torsoOps : lift.torso!;
      const head = standing ? dip.headOps : lift.head!;
      const pelvis = standing ? dip.pelvisOps : lift.pelvis!;
      const thigh = standing ? dip.thighOps : lift.thighL!;
      const shank = standing ? dip.legOps : lift.shankL!;
      // Hands, in WORLD: hanging plumb from the shoulder through the
      // pull (the deadlift's own bar line), to the front rack over the
      // catch, then overhead — the rack and overhead points ride the
      // trunk.
      const Sw = applyToPoint(SIDE_ANCHORS.shoulder, torso);
      const hangW: Pt = [Sw[0] + lerp(8, -5, pullE), Sw[1] + STRAIGHT_ARM];
      const rackW = applyToPoint(FRONT_RACK, torso);
      const overW = applyToPoint(OVERHEAD, torso);
      const caughtW: Pt = [
        lerp(hangW[0], rackW[0], catchE),
        lerp(hangW[1], rackW[1], catchE),
      ];
      const HW: Pt = [
        lerp(caughtW[0], overW[0], pressE),
        lerp(caughtW[1], overW[1], pressE),
      ];
      const arm = armToWorld(torso, HW, ELBOW_FRONT);
      return {
        head,
        torso,
        pelvis,
        thighL: thigh,
        thighR: thigh,
        shankL: shank,
        shankR: shank,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
  },

  /* ── 2026-09-03 build-out, batch 11: the frontal plane ── */

  "db-flyes": {
    /* "Lie flat with dumbbells pressed straight up over your chest. Set
     * a soft bend in your elbows — lock that angle ... lower the weights
     * in a wide arc until you feel a stretch across your chest. Squeeze
     * ... back together above your chest." The camera is ABOVE the
     * bench: the wide stretch lies in the picture plane, and at the top
     * both arms point at the viewer, drawn foreshortened with the bells
     * meeting over the chest. */
    view: "anterior",
    equip: "dumbbell",
    viewBox: "-44 -14 188 224",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { chest: "primary", "front-deltoids": "secondary" },
    pose: (e) => {
      const spread = lerp(FLY_WIDE, 7, e);
      const y = lerp(56, 42, e);
      const L = antArmToward("L", [50 - spread, y]);
      const R = antArmToward("R", [50 + spread, y]);
      return {
        upperArmL: L.upper,
        foreArmL: L.fore,
        upperArmR: R.upper,
        foreArmR: R.fore,
      };
    },
    bar: antHands,
  },

  "cable-fly": {
    /* "Set pulleys at chest height, grab a handle in each hand, step
     * forward. Set a soft bend ... bring your hands together in front of
     * your chest in a wide arc. Open slowly to a full chest stretch."
     * Standing, front-on, cables from chest-height pulleys either side;
     * the hands sweep from wide to together in front of the chest — the
     * finish is toward the viewer, so the arms foreshorten. */
    view: "anterior",
    equip: "frontal-cables",
    pivots: CHEST_PULLEYS,
    viewBox: "-44 -14 188 224",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { chest: "primary", "front-deltoids": "secondary" },
    pose: (e) => {
      const spread = lerp(78, 6, e);
      const y = lerp(54, 52, e);
      const L = antArmToward("L", [50 - spread, y]);
      const R = antArmToward("R", [50 + spread, y]);
      return {
        upperArmL: L.upper,
        foreArmL: L.fore,
        upperArmR: R.upper,
        foreArmR: R.fore,
      };
    },
    bar: antHands,
  },

  "cable-crossover": {
    /* "Set both pulleys high ... step forward with a slight forward lean
     * and a soft bend at the elbows. Pull the handles down and together
     * in front of your hips in a wide arc. Squeeze hard at the bottom."
     * Cables from high pulleys either side; hands from high-and-wide to
     * together in front of the hips. */
    view: "anterior",
    equip: "frontal-cables",
    pivots: HIGH_PULLEYS,
    viewBox: "-44 -30 188 240",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { chest: "primary", "front-deltoids": "secondary" },
    pose: (e) => {
      const spread = lerp(72, 6, e);
      const y = lerp(20, 106, e);
      const L = antArmToward("L", [50 - spread, y]);
      const R = antArmToward("R", [50 + spread, y]);
      return {
        upperArmL: L.upper,
        foreArmL: L.fore,
        upperArmR: R.upper,
        foreArmR: R.fore,
      };
    },
    bar: antHands,
  },

  "pec-deck": {
    /* "Place your forearms on the pads with elbows at shoulder height.
     * Squeeze the pads together in front of your chest ... open slowly
     * to a full stretch." Elbows held at shoulder height (pinned) and
     * swung from out wide to in front of the chest — toward the viewer,
     * so the upper arms foreshorten — with the forearms standing
     * vertical on the pads throughout. */
    view: "anterior",
    viewBox: "-24 -14 148 224",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { chest: "primary", "front-deltoids": "secondary" },
    pose: (e) => {
      // Out wide → in FRONT and inward: the upper arms cross toward the
      // midline as they come at the viewer, so the pads meet.
      const out = lerp(23, PEC_DECK_IN, e);
      const L = antElbowAt(
        "L",
        [ANT.shoulderL[0] - out, ANT.shoulderL[1]],
        "up"
      );
      const R = antElbowAt(
        "R",
        [ANT.shoulderR[0] + out, ANT.shoulderR[1]],
        "up"
      );
      return {
        upperArmL: L.upper,
        foreArmL: L.fore,
        upperArmR: R.upper,
        foreArmR: R.fore,
      };
    },
    scene: (e) => {
      // The pads: a slab along each forearm, from the elbow up.
      const out = lerp(23, PEC_DECK_IN, e);
      const pad = (x: number) =>
        `<rect x="${(x - 5).toFixed(1)}" y="${(ANT.shoulderL[1] - ANT_FORE_LEN - 2).toFixed(1)}" width="10" height="${(ANT_FORE_LEN + 6).toFixed(1)}" rx="3" fill="${GEAR}"/>`;
      return pad(ANT.shoulderL[0] - out) + pad(ANT.shoulderR[0] + out);
    },
  },

  "machine-chest-fly": {
    /* "Sit with your back flat and grip the handles at chest height. Set
     * a soft bend in your elbows and lock that angle ... bring the
     * handles together in front of your chest." The cable fly's sweep on
     * a machine's lever arms, from pivots above the shoulders. */
    view: "anterior",
    equip: "frontal-levers",
    pivots: FLY_LEVERS,
    viewBox: "-44 -14 188 224",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { chest: "primary", "front-deltoids": "secondary" },
    pose: (e) => {
      const spread = lerp(76, 6, e);
      const L = antArmToward("L", [50 - spread, 50]);
      const R = antArmToward("R", [50 + spread, 50]);
      return {
        upperArmL: L.upper,
        foreArmL: L.fore,
        upperArmR: R.upper,
        foreArmR: R.fore,
      };
    },
    bar: antHands,
  },

  "lu-raise": {
    /* "Raise your arms out to shoulder height like a lateral raise. At
     * the top, rotate forward and bring the dumbbells together in
     * front. Reverse through both segments." The lateral raise's own
     * sweep for the first half, then the arms swing forward at shoulder
     * height to meet in front — toward the viewer, foreshortened. */
    view: "anterior",
    equip: "dumbbell",
    viewBox: "-44 -14 188 224",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { "front-deltoids": "primary" },
    pose: (e) => {
      if (e <= 0.5) return lateralRaiseOps(e * 2);
      const top = lateralRaiseOps(1);
      const hL = applyToPoint(ANT.handL, top.foreArmL ?? []);
      const hR = applyToPoint(ANT.handR, top.foreArmR ?? []);
      const k = smooth((e - 0.5) * 2);
      const L = antArmToward("L", [
        lerp(hL[0], 44, k),
        lerp(hL[1], ANT.shoulderL[1], k),
      ]);
      const R = antArmToward("R", [
        lerp(hR[0], 56, k),
        lerp(hR[1], ANT.shoulderR[1], k),
      ]);
      return {
        upperArmL: L.upper,
        foreArmL: L.fore,
        upperArmR: R.upper,
        foreArmR: R.fore,
      };
    },
    bar: antHands,
  },

  "arnold-press": {
    /* "Dumbbells at chest height, palms facing you. As you press up,
     * rotate the dumbbells so palms face forward at lockout. Press to
     * full extension." The rotation is what the front shows: the elbows
     * start IN FRONT of the body (upper arms pointing at the viewer,
     * forearms up with the bells before the face), swing out to the
     * sides at shoulder height, then the press goes overhead. */
    view: "anterior",
    equip: "dumbbell",
    viewBox: "-24 -40 148 250",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { "front-deltoids": "primary", triceps: "secondary" },
    pose: (e) => {
      const SWING = 0.35;
      if (e <= SWING) {
        const k = smooth(e / SWING);
        const out = lerp(7, 23, k);
        const L = antElbowAt(
          "L",
          [ANT.shoulderL[0] - out, ANT.shoulderL[1] + lerp(3, 0, k)],
          "up"
        );
        const R = antElbowAt(
          "R",
          [ANT.shoulderR[0] + out, ANT.shoulderR[1] + lerp(3, 0, k)],
          "up"
        );
        return {
          upperArmL: L.upper,
          foreArmL: L.fore,
          upperArmR: R.upper,
          foreArmR: R.fore,
        };
      }
      const k = smooth((e - SWING) / (1 - SWING));
      const startL: Pt = [
        ANT.shoulderL[0] - 23,
        ANT.shoulderL[1] - ANT_FORE_LEN,
      ];
      const startR: Pt = [
        ANT.shoulderR[0] + 23,
        ANT.shoulderR[1] - ANT_FORE_LEN,
      ];
      const hl: Pt = [
        lerp(startL[0], ANT.shoulderL[0] - 6, k),
        lerp(startL[1], ANT.shoulderL[1] - ANT_ARM_LEN * 0.995, k),
      ];
      const hr: Pt = [
        lerp(startR[0], ANT.shoulderR[0] + 6, k),
        lerp(startR[1], ANT.shoulderR[1] - ANT_ARM_LEN * 0.995, k),
      ];
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
    bar: antHands,
  },

  "cuban-press": {
    /* "Upright-row to chest height with elbows leading. From there,
     * rotate your shoulders so the dumbbells point up. Press overhead,
     * then reverse each segment." Three segments on one e: the row (hands
     * up the front, elbows high and wide), the external rotation (the
     * forearm swings from hanging to upright THROUGH the viewer — drawn
     * shortest as it passes), then the press. */
    view: "anterior",
    equip: "dumbbell",
    viewBox: "-24 -40 148 250",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { "front-deltoids": "primary", triceps: "secondary" },
    pose: (e) => {
      const ROW = 1 / 3;
      const ROT = 2 / 3;
      const elbowL: Pt = [ANT.shoulderL[0] - 22, ANT.shoulderL[1] + 2];
      const elbowR: Pt = [ANT.shoulderR[0] + 22, ANT.shoulderR[1] + 2];
      if (e <= ROW) {
        const k = smooth(e / ROW);
        // Row: hands rise up the front, elbows leading out and up.
        const hl: Pt = [
          lerp(ANT.shoulderL[0] + 6, elbowL[0], k),
          lerp(104, elbowL[1] + ANT_FORE_LEN, k),
        ];
        const hr: Pt = [
          lerp(ANT.shoulderR[0] - 6, elbowR[0], k),
          lerp(104, elbowR[1] + ANT_FORE_LEN, k),
        ];
        // "Elbows leading": of the two elbow solutions, the HIGH one.
        const L = aimArm(
          { S: ANT.shoulderL, E: ANT.elbowL, H: ANT.handL },
          ELBOW_HIGH(
            solveElbow(ANT.shoulderL, hl, ANT_UPPER_LEN, ANT_FORE_LEN, 1),
            solveElbow(ANT.shoulderL, hl, ANT_UPPER_LEN, ANT_FORE_LEN, -1)
          ),
          hl,
          0
        );
        const R = aimArm(
          { S: ANT.shoulderR, E: ANT.elbowR, H: ANT.handR },
          ELBOW_HIGH(
            solveElbow(ANT.shoulderR, hr, ANT_UPPER_LEN, ANT_FORE_LEN, 1),
            solveElbow(ANT.shoulderR, hr, ANT_UPPER_LEN, ANT_FORE_LEN, -1)
          ),
          hr,
          0
        );
        return {
          upperArmL: L.upper,
          foreArmL: L.fore,
          upperArmR: R.upper,
          foreArmR: R.fore,
        };
      }
      const upL = antElbowAt("L", elbowL, "up");
      const upR = antElbowAt("R", elbowR, "up");
      if (e <= ROT) {
        const t = (e - ROW) / (ROT - ROW);
        const fL = antForeRotate("L", elbowL, t);
        const fR = antForeRotate("R", elbowR, t);
        return {
          upperArmL: upL.upper,
          foreArmL: fL.fore,
          upperArmR: upR.upper,
          foreArmR: fR.fore,
        };
      }
      const k = smooth((e - ROT) / (1 - ROT));
      const hl: Pt = [
        lerp(upL.hand[0], ANT.shoulderL[0] - 6, k),
        lerp(upL.hand[1], ANT.shoulderL[1] - ANT_ARM_LEN * 0.995, k),
      ];
      const hr: Pt = [
        lerp(upR.hand[0], ANT.shoulderR[0] + 6, k),
        lerp(upR.hand[1], ANT.shoulderR[1] - ANT_ARM_LEN * 0.995, k),
      ];
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
    bar: antHands,
  },

  shrugs: {
    /* "Stand tall with dumbbells at your sides, arms straight. Shrug
     * your shoulders straight up toward your ears — no rolling." The
     * front figure's deltoids ride the upper-arm group, so the whole
     * arm-and-cap rises with the bells while the trunk stays put — a
     * shrug is the shoulders rising, and that is what rises. Strictly
     * vertical (pinned). */
    view: "anterior",
    equip: "dumbbell",
    concentricTo: 1,
    startsAt: "stretch",
    // The traps are not drawn on the front figure; the deltoid cap is the
    // part that visibly rises.
    tint: { "front-deltoids": "primary", forearm: "secondary" },
    pose: (e) => {
      const lift: Op[] = [{ kind: "translate", dx: 0, dy: -SHRUG_RISE * e }];
      return {
        upperArmL: lift,
        foreArmL: lift,
        upperArmR: lift,
        foreArmR: lift,
      };
    },
    bar: antHands,
  },

  "barbell-shrug": {
    /* "Stand with the bar at your thighs ... shrug your shoulders straight
     * up toward your ears, arms straight ... strictly vertical — no
     * rolling, no rocking." The shrug with the bar across the thighs. */
    view: "anterior",
    equip: "barbell",
    plateR: 9,
    concentricTo: 1,
    startsAt: "stretch",
    // The traps are not drawn on the front figure; the deltoid cap is the
    // part that visibly rises.
    tint: { "front-deltoids": "primary", forearm: "secondary" },
    pose: (e) => {
      const lift: Op[] = [{ kind: "translate", dx: 0, dy: -SHRUG_RISE * e }];
      return {
        upperArmL: lift,
        foreArmL: lift,
        upperArmR: lift,
        foreArmR: lift,
      };
    },
    bar: antHands,
  },

  /* ── 2026-09-03 build-out, batch 12: legs, the back figure, the twists ── */

  "hip-abduction-machine": {
    /* "Sit with your back pinned to the pad, pads on the outside of your
     * knees ... push your legs apart as wide as the machine allows."
     * Seated facing the viewer: the thighs point at the camera (drawn
     * short), the shins hang from the drawn knees, and both legs swing
     * apart about the hips. Hips never move (pinned). */
    view: "anterior",
    viewBox: "-24 -14 148 224",
    groundY: HIP_MACHINE_FLOOR,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { abductors: "primary", quadriceps: "secondary" },
    pose: (e) => {
      const swing = lerp(0, 26, e);
      const L = antLegToward("L", HIP_MACHINE_K, swing);
      const R = antLegToward("R", HIP_MACHINE_K, -swing);
      return {
        thighL: L.thigh,
        shankL: L.shank,
        thighR: R.thigh,
        shankR: R.shank,
      };
    },
    scene: (e) => {
      const swing = lerp(0, 26, e);
      const L = antLegToward("L", HIP_MACHINE_K, swing);
      const R = antLegToward("R", HIP_MACHINE_K, -swing);
      // Pads on the OUTSIDE of the knees.
      return (
        antSeatScene(HIP_MACHINE_FLOOR) +
        `<rect x="${(L.knee[0] - 12).toFixed(1)}" y="${(L.knee[1] - 8).toFixed(1)}" width="7" height="18" rx="2.5" fill="${GEAR}"/>` +
        `<rect x="${(R.knee[0] + 5).toFixed(1)}" y="${(R.knee[1] - 8).toFixed(1)}" width="7" height="18" rx="2.5" fill="${GEAR}"/>`
      );
    },
  },

  "hip-adduction-machine": {
    /* "Sit with your back pinned to the pad, pads on the inside of your
     * knees ... squeeze your legs together, contracting the inner
     * thighs." The abduction machine run the other way: legs start
     * apart and close. */
    view: "anterior",
    viewBox: "-24 -14 148 224",
    groundY: HIP_MACHINE_FLOOR,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { abductors: "primary", quadriceps: "secondary" },
    pose: (e) => {
      const swing = lerp(26, 2, e);
      const L = antLegToward("L", HIP_MACHINE_K, swing);
      const R = antLegToward("R", HIP_MACHINE_K, -swing);
      return {
        thighL: L.thigh,
        shankL: L.shank,
        thighR: R.thigh,
        shankR: R.shank,
      };
    },
    scene: (e) => {
      const swing = lerp(26, 2, e);
      const L = antLegToward("L", HIP_MACHINE_K, swing);
      const R = antLegToward("R", HIP_MACHINE_K, -swing);
      // Pads on the INSIDE of the knees.
      return (
        antSeatScene(HIP_MACHINE_FLOOR) +
        `<rect x="${(L.knee[0] + 5).toFixed(1)}" y="${(L.knee[1] - 8).toFixed(1)}" width="7" height="18" rx="2.5" fill="${GEAR}"/>` +
        `<rect x="${(R.knee[0] - 12).toFixed(1)}" y="${(R.knee[1] - 8).toFixed(1)}" width="7" height="18" rx="2.5" fill="${GEAR}"/>`
      );
    },
  },

  "reverse-flyes": {
    /* "Hinge forward at the hips ... hold dumbbells below your chest,
     * palms facing each other, elbows soft. Raise the dumbbells out to
     * the sides, squeezing your rear delts." The BACK figure: the arms
     * start hanging toward the floor beneath the chest — away from the
     * viewer, drawn short — and sweep out wide to shoulder height. The
     * hinge itself is toward the camera and does not show; the sweep,
     * which is the exercise, does. */
    view: "posterior",
    equip: "dumbbell",
    viewBox: "-44 -14 188 244",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { "back-deltoids": "primary", "upper-back": "secondary" },
    pose: (e) => {
      const spread = lerp(10, 80, e);
      const y = lerp(80, 46, e);
      const L = postArmToward("L", [50 - spread, y]);
      const R = postArmToward("R", [50 + spread, y]);
      return {
        upperArmL: L.upper,
        foreArmL: L.fore,
        upperArmR: R.upper,
        foreArmR: R.fore,
      };
    },
    bar: postHands,
  },

  "rear-delt-machine-fly": {
    /* "Sit facing the pec deck pad with chest pinned, grips at shoulder
     * height. Start with arms extended forward ... push the handles
     * apart by squeezing your rear delts, opening wide." From behind:
     * the arms start reaching away from the viewer (short) at shoulder
     * height and open to wide, on the machine's lever arms. */
    view: "posterior",
    equip: "frontal-levers",
    pivots: REAR_FLY_LEVERS,
    viewBox: "-44 -14 188 244",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { "back-deltoids": "primary", "upper-back": "secondary" },
    pose: (e) => {
      const spread = lerp(8, 80, e);
      const L = postArmToward("L", [50 - spread, 48]);
      const R = postArmToward("R", [50 + spread, 48]);
      return {
        upperArmL: L.upper,
        foreArmL: L.fore,
        upperArmR: R.upper,
        foreArmR: R.fore,
      };
    },
    bar: postHands,
  },

  "reverse-pec-deck": {
    /* "Sit facing the pad with chest pinned, grips at shoulder height.
     * Start with arms extended forward, soft bend in the elbows locked.
     * Pull the handles back and out in a wide arc." The rear-delt
     * machine fly's arc — the same machine, the same picture from
     * behind. */
    view: "posterior",
    equip: "frontal-levers",
    pivots: REAR_FLY_LEVERS,
    viewBox: "-44 -14 188 244",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { "back-deltoids": "primary", "upper-back": "secondary" },
    pose: (e) => {
      const spread = lerp(8, 82, e);
      const L = postArmToward("L", [50 - spread, 48]);
      const R = postArmToward("R", [50 + spread, 48]);
      return {
        upperArmL: L.upper,
        foreArmL: L.fore,
        upperArmR: R.upper,
        foreArmR: R.fore,
      };
    },
    bar: postHands,
  },

  "cross-body-hammer-curl": {
    /* "Pin your elbow and curl one dumbbell across your body to the
     * opposite shoulder ... alternate arms and keep the torso still."
     * One arm: the elbow held at the side (it drifts a few units
     * forward, which a pinned elbow does), the forearm sweeping up and
     * ACROSS the midline toward the far pec; the other arm hangs. */
    view: "anterior",
    equip: "dumbbell",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { biceps: "primary", forearm: "secondary" },
    pose: (e) => {
      // Elbow: at rest, drifting a touch forward (toward the viewer,
      // foreshortened upper arm) as the bell crosses.
      const elbow: Pt = [
        lerp(ANT.elbowL[0], ANT.elbowL[0] + 3, e),
        lerp(ANT.elbowL[1], ANT.elbowL[1] - 3, e),
      ];
      const up = antElbowAt("L", elbow, "down");
      const hand: Pt = [lerp(ANT.handL[0], 58, e), lerp(ANT.handL[1], 56, e)];
      const fore = antForeToward("L", elbow, hand);
      return { upperArmL: up.upper, foreArmL: fore };
    },
    bar: antHands,
  },

  "cable-woodchopper": {
    /* "Set the cable to the highest position, grip the handle with both
     * hands. Stand sideways to the pulley ... pull the handle diagonally
     * across your body from high to low, rotating your torso." Both
     * hands on one handle, the cable from a high pulley at the corner,
     * the handle sweeping from high on one side to low on the other;
     * the trunk leans with it — the projection of the twist the front
     * camera can show. */
    view: "anterior",
    equip: "frontal-cables",
    pivots: [WOODCHOP_PULLEY, WOODCHOP_PULLEY],
    viewBox: "-44 -24 188 234",
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      obliques: "primary",
      abs: "secondary",
      "front-deltoids": "secondary",
    },
    pose: (e) => {
      // Both hands on one handle: the path stays within BOTH shoulders'
      // reach (the front figure's arms are short), the trunk twist
      // carrying the far shoulder around, and the target is pulled back
      // through that twist so the arms land on it after it.
      const deg = lerp(-16, 16, e);
      const twist: Op[] = [{ kind: "rotate", deg, pivot: [50, 100] }];
      const hand = preTwist([lerp(28, 70, e), lerp(14, 88, e)], deg, [50, 100]);
      const L = antArmToward("L", hand);
      const R = antArmToward("R", hand);
      return {
        torso: twist,
        head: twist,
        upperArmL: [...L.upper, ...twist],
        foreArmL: [...L.fore, ...twist],
        upperArmR: [...R.upper, ...twist],
        foreArmR: [...R.fore, ...twist],
      };
    },
    bar: antHands,
  },

  "dead-bug": {
    /* "Lie on your back, arms straight up toward the ceiling, knees bent
     * at 90°. Press your lower back into the floor ... slowly extend one
     * arm overhead and straighten the opposite leg. Return to start and
     * alternate." Camera above: at the start both arms and both thighs
     * point at the viewer (drawn short) with the shins folded; one arm
     * sweeps overhead along the floor and the opposite leg straightens
     * along it. One side per rep. */
    view: "anterior",
    viewBox: "-24 -30 148 240",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { abs: "primary", obliques: "secondary" },
    pose: (e) => {
      const armUp = antArmToward("R", [
        ANT.shoulderR[0] + 2,
        ANT.shoulderR[1] - 10,
      ]);
      const armL = antArmToward("L", [
        lerp(ANT.shoulderL[0] - 2, ANT.shoulderL[0] - 6, e),
        lerp(ANT.shoulderL[1] - 10, ANT.shoulderL[1] - ANT_ARM_LEN, e),
      ]);
      const legL = antLegToward("L", 0.36, 0);
      const legR = antLegToward("R", lerp(0.36, 1, e), 0);
      // Folded shin at the start: the shin points at the viewer too, so
      // it is foreshortened about the drawn knee; straight leg: unscaled.
      const shinK = lerp(0.35, 1, e);
      const shankR: Op[] = [
        { kind: "scaleAxis", k: shinK, deg: 0, pivot: ANT.kneeR },
        ...legR.shank,
      ];
      const shankL: Op[] = [
        { kind: "scaleAxis", k: 0.35, deg: 0, pivot: ANT.kneeL },
        ...legL.shank,
      ];
      return {
        upperArmL: armL.upper,
        foreArmL: armL.fore,
        upperArmR: armUp.upper,
        foreArmR: armUp.fore,
        thighL: legL.thigh,
        shankL,
        thighR: legR.thigh,
        shankR,
      };
    },
  },

  "bicycle-crunch": {
    /* "Lie on your back, hands behind your head, legs lifted at 90°.
     * Bring one knee toward your chest while rotating the opposite
     * elbow to meet it. Extend the opposite leg straight out ...
     * alternate sides in a smooth, controlled pedal." Camera above: the
     * pedal swaps which knee is tucked (short thigh, folded shin) and
     * which leg is long, while the trunk turns toward the tucked knee;
     * elbows out with the hands behind the head. */
    view: "anterior",
    viewBox: "-24 -14 148 224",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { obliques: "primary", abs: "secondary" },
    pose: (e) => {
      const kL = lerp(0.36, 1, e); // left leg: tucked → long
      const kR = lerp(1, 0.36, e); // right leg: long → tucked
      const legL = antLegToward("L", kL, 0);
      const legR = antLegToward("R", kR, 0);
      const shankL: Op[] = [
        { kind: "scaleAxis", k: lerp(0.35, 1, e), deg: 0, pivot: ANT.kneeL },
        ...legL.shank,
      ];
      const shankR: Op[] = [
        { kind: "scaleAxis", k: lerp(1, 0.35, e), deg: 0, pivot: ANT.kneeR },
        ...legR.shank,
      ];
      // Trunk turns toward the tucked knee; elbows wide, hands behind the head.
      const twist: Op[] = [
        { kind: "rotate", deg: lerp(-8, 8, e), pivot: [50, 100] },
      ];
      const eL = antElbowAt(
        "L",
        [ANT.shoulderL[0] - 16, ANT.shoulderL[1] - 4],
        "up"
      );
      const eR = antElbowAt(
        "R",
        [ANT.shoulderR[0] + 16, ANT.shoulderR[1] - 4],
        "up"
      );
      const foreL = [
        { kind: "scaleAxis" as const, k: 0.55, deg: 0, pivot: ANT.elbowL },
        ...eL.fore,
      ];
      const foreR = [
        { kind: "scaleAxis" as const, k: 0.55, deg: 0, pivot: ANT.elbowR },
        ...eR.fore,
      ];
      return {
        torso: twist,
        head: twist,
        upperArmL: [...eL.upper, ...twist],
        foreArmL: [...foreL, ...twist],
        upperArmR: [...eR.upper, ...twist],
        foreArmR: [...foreR, ...twist],
        thighL: legL.thigh,
        shankL,
        thighR: legR.thigh,
        shankR,
      };
    },
  },

  "russian-twist": {
    /* "Sit on the floor, knees bent, lean back to about 45° ... clasp
     * your hands together in front of your chest. Rotate your torso side
     * to side, tapping the weight just outside your hips." Camera above:
     * knees bent (thighs short toward the viewer), the clasped hands
     * sweeping from just outside one hip to just outside the other as
     * the trunk turns. One side to the other is a rep. */
    view: "anterior",
    viewBox: "-24 -14 148 224",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { obliques: "primary", abs: "secondary" },
    pose: (e) => {
      const deg = lerp(-25, 25, e);
      const twist: Op[] = [{ kind: "rotate", deg, pivot: [50, 104] }];
      const hand = preTwist([lerp(24, 76, e), 92], deg, [50, 104]);
      const L = antArmToward("L", hand);
      const R = antArmToward("R", hand);
      const legL = antLegToward("L", 0.5, 0);
      const legR = antLegToward("R", 0.5, 0);
      return {
        torso: twist,
        head: twist,
        upperArmL: [...L.upper, ...twist],
        foreArmL: [...L.fore, ...twist],
        upperArmR: [...R.upper, ...twist],
        foreArmR: [...R.fore, ...twist],
        thighL: legL.thigh,
        shankL: legL.shank,
        thighR: legR.thigh,
        shankR: legR.shank,
      };
    },
  },

  /* ── 2026-09-03 build-out, batch 13: the profile's last rows ── */

  "mountain-climbers": {
    /* "Start in a high plank, hands under shoulders, body straight.
     * Drive one knee toward your chest without letting hips pike up.
     * Quickly switch legs." The high plank held (hands, far foot and
     * the hips all pinned — no pike), the near knee driving forward and
     * up to the chest with the shin folded under. One knee per rep. */
    view: "side",
    viewBox: "-60 -6 200 218",
    groundY: 204,
    shadowCx: 40,
    shadowRx: 70,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      abs: "primary",
      quadriceps: "secondary",
      "front-deltoids": "secondary",
    },
    pose: (e) => {
      const b = highPlankBase();
      // The hip sits a thigh's length above the floor in a high plank,
      // so a thigh swinging under it would pass through the floor at
      // mid-swing. The hips rise a few units through the swing — a
      // ripple, not a pike (pinned ≤ 10) — with the hands and the far
      // foot re-solved to stay planted.
      const lift = MC_HIP_LIFT * Math.sin(Math.PI * e);
      const body: Op[] = [...b.body, { kind: "translate", dx: 0, dy: -lift }];
      const hipW = applyToPoint(SIDE_ANCHORS.hip, body);
      // The thigh swings from along the body line to pointing at the
      // chest (nearly a half turn in its own frame), the shin folding
      // back under it so the foot tucks beneath the hips; the fold
      // leads the swing.
      const drive: Op[] = [
        {
          kind: "rotate",
          deg: -170 * smooth((e - 0.06) / 0.94),
          pivot: SIDE_ANCHORS.hip,
        },
        ...body,
      ];
      const shin: Op[] = [
        {
          kind: "rotate",
          deg: 130 * smooth(e / 0.45),
          pivot: SIDE_ANCHORS.knee,
        },
        ...drive,
      ];
      // A touch of slack in the far leg (its ankle target 3 in from the
      // rigid lean's), so it can stay planted while the hips ripple.
      const far = plantedLeg(hipW, MC_FAR_ANKLE, KNEE_LOW);
      const arm = armToWorld(body, b.hand, ELBOW_BACK);
      return {
        head: body,
        torso: body,
        pelvis: body,
        thighL: drive,
        shankL: shin,
        thighR: far.thigh,
        shankR: far.shank,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    scene: () =>
      `<line x1="-60" y1="${MACHINE_FLOOR + 1}" x2="140" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "battle-ropes": {
    /* "Grip one end of the rope in each hand, stance wide, soft knees.
     * Drop into a quarter squat and brace your core. Drive waves by
     * alternating arms up and down." A quarter squat held; the near arm
     * rises as the far arm falls (and back), each rope drawn as a wave
     * from the hand to the anchor ahead. */
    view: "side",
    viewBox: "-12 -6 176 218",
    groundY: 204,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      "front-deltoids": "primary",
      abs: "secondary",
      forearm: "secondary",
    },
    pose: (e) => {
      const c = sideSquatChain(0.3, 14);
      const near: Op[] = [
        {
          kind: "rotate",
          deg: lerp(-20, -95, e),
          pivot: SIDE_ANCHORS.shoulder,
        },
        ...c.torsoOps,
      ];
      const nearFore: Op[] = [
        { kind: "rotate", deg: -28, pivot: SIDE_ANCHORS.elbow },
        ...near,
      ];
      const far: Op[] = [
        {
          kind: "rotate",
          deg: lerp(-95, -20, e),
          pivot: SIDE_ANCHORS.shoulder,
        },
        ...c.torsoOps,
      ];
      const farFore: Op[] = [
        { kind: "rotate", deg: -28, pivot: SIDE_ANCHORS.elbow },
        ...far,
      ];
      return {
        head: c.headOps,
        torso: c.torsoOps,
        pelvis: c.pelvisOps,
        thighL: c.thighOps,
        thighR: c.thighOps,
        shankL: c.legOps,
        shankR: c.legOps,
        upperArmL: near,
        foreArmL: nearFore,
        handL: nearFore,
        upperArmR: far,
        foreArmR: farFore,
        handR: farFore,
      };
    },
    scene: (e, pose) => {
      const hL = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      const hR = applyToPoint(SIDE_ANCHORS.hand, [
        ...(pose.handR ?? []),
        { kind: "translate", dx: FAR_ARM_SHIFT[0], dy: FAR_ARM_SHIFT[1] },
      ]);
      // Each rope: a wave from the hand to the anchor, its phase driven
      // by the arm so the crest leaves the hand as the hand rises.
      const wave = (h: Pt, phase: number, colour: string) => {
        const A = BATTLE_ANCHOR;
        const n = 24;
        let d = `M ${h[0].toFixed(1)} ${h[1].toFixed(1)}`;
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const x = lerp(h[0], A[0], t);
          const base = lerp(h[1], A[1], t);
          const amp = 14 * (1 - t) * Math.min(1, t * 6);
          const y =
            base + amp * Math.sin(t * 3 * Math.PI * 2 - phase * Math.PI * 2);
          d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
        }
        return `<path d="${d}" fill="none" stroke="${colour}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
      };
      return (
        `<rect x="${BATTLE_ANCHOR[0] - 4}" y="${BATTLE_ANCHOR[1] - 10}" width="8" height="10" rx="2" fill="${GEAR_DARK}"/>` +
        wave(hR, 0.5 + e * 0.5, GEAR_FAR) +
        wave(hL, e * 0.5, GEAR) +
        `<line x1="-12" y1="${MACHINE_FLOOR + 1}" x2="164" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },

  "side-plank": {
    /* "Lie on your side with your forearm on the floor, elbow under your
     * shoulder. Stack your feet ... lift your hips off the floor into a
     * straight line from head to feet. Hold for time." The front figure
     * laid on its side, facing the viewer: the shoulder fixed over the
     * elbow on the floor, the hips lifting from a sag into the line.
     * The set-up is the motion; the hold is t = 1. */
    view: "anterior",
    viewBox: "-90 40 220 168",
    groundY: 204,
    shadowCx: 20,
    shadowRx: 70,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      obliques: "primary",
      abs: "secondary",
      "front-deltoids": "secondary",
    },
    pose: (e) => antSidePlank(e),
    scene: () =>
      `<line x1="-90" y1="${MACHINE_FLOOR + 1}" x2="130" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "rowing-machine": {
    /* "Start compressed with shins vertical. Drive with your legs first,
     * then lean back, then pull the handle to your ribs. Return in
     * reverse order: arms out, hinge forward, then slide the seat in."
     * Feet on the footplate, the hip sliding back along the rail (legs
     * first), the trunk swinging from a forward lean to a lean back,
     * then the arms pulling to the ribs — three overlapping segments on
     * one e, so the reverse is the recovery in its own order. */
    view: "side",
    equip: "cable-handle",
    pulley: ROWER_PULLEY,
    viewBox: "-16 -6 204 218",
    groundY: 204,
    shadowCx: 70,
    shadowRx: 60,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      quadriceps: "primary",
      "upper-back": "primary",
      hamstring: "secondary",
      biceps: "secondary",
    },
    pose: (e) => {
      const legE = smooth(e / 0.55);
      const leanE = smooth((e - 0.3) / 0.4);
      const armE = smooth((e - 0.55) / 0.45);
      const hip: Pt = [
        lerp(ROWER_HIP_X[0], ROWER_HIP_X[1], legE),
        ROWER_SEAT_Y,
      ];
      const lean = lerp(14, -14, leanE);
      const body: Op[] = [
        {
          kind: "translate",
          dx: hip[0] - SIDE_ANCHORS.hip[0],
          dy: hip[1] - SIDE_ANCHORS.hip[1],
        },
      ];
      const torso: Op[] = [
        { kind: "rotate", deg: lean, pivot: SIDE_ANCHORS.hip },
        ...body,
      ];
      const head: Op[] = [
        { kind: "rotate", deg: -lean * HEAD_LIFT, pivot: SIDE_ANCHORS.neck },
        ...torso,
      ];
      const leg = plantedLeg(hip, ROWER_ANKLE, KNEE_HIGH);
      const S = applyToPoint(SIDE_ANCHORS.shoulder, torso);
      // Hand: straight ahead at handle height, then to the lower ribs.
      const H: Pt = [
        lerp(S[0] + STRAIGHT_ARM * 0.97, S[0] + 8, armE),
        lerp(ROWER_PULLEY[1] - 4, S[1] + 26, armE),
      ];
      const arm = armToWorld(torso, H, ELBOW_BACK);
      return {
        head,
        torso,
        pelvis: body,
        thighL: leg.thigh,
        thighR: leg.thigh,
        shankL: leg.shank,
        shankR: leg.shank,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: (e, pose) => {
      const hip = applyToPoint(SIDE_ANCHORS.hip, pose.pelvis ?? []);
      void e;
      return (
        // Rail, the sliding seat under the hips, the footplate, the
        // flywheel housing at the pulley, the floor.
        `<line x1="10" y1="${ROWER_SEAT_Y + 14}" x2="140" y2="${ROWER_SEAT_Y + 14}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
        `<rect x="${(hip[0] - 14).toFixed(1)}" y="${ROWER_SEAT_Y + 6}" width="28" height="8" rx="2.6" fill="${GEAR}"/>` +
        `<rect x="${ROWER_ANKLE[0] + 4}" y="${ROWER_ANKLE[1] - 18}" width="7" height="34" rx="2" fill="${GEAR}" transform="rotate(-22 ${ROWER_ANKLE[0] + 7} ${ROWER_ANKLE[1] - 1})"/>` +
        `<rect x="${ROWER_PULLEY[0] - 6}" y="${ROWER_PULLEY[1] - 30}" width="14" height="68" rx="5" fill="${GEAR_DARK}"/>` +
        `<line x1="20" y1="${ROWER_SEAT_Y + 18}" x2="20" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
        `<line x1="-16" y1="${MACHINE_FLOOR + 1}" x2="188" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },

  "ski-erg": {
    /* "Stand facing the machine, grip both handles overhead, soft knees.
     * Hinge at the hips and pull the handles down past your thighs ...
     * stand up and reach overhead smoothly for the next pull." Standing
     * under the handles, the trunk hinging from upright to 50 as the
     * straight-ish arms sweep from overhead to behind the thighs, the
     * cable solved from the machine's top pulley. */
    view: "side",
    equip: "cable-handle",
    pulley: SKI_ERG_PULLEY,
    viewBox: "-30 -50 176 262",
    groundY: 204,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { "upper-back": "primary", abs: "secondary", triceps: "secondary" },
    pose: (e) => {
      // 58 at the hip nets ~47 from the rest trunk once the body leans
      // back about the heels to balance it.
      const hinge = lerp(4, 58, e);
      const knee = lerp(4, 14, e);
      const LEAN = hipsBack(hinge);
      const torso: Op[] = [
        { kind: "rotate", deg: hinge, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      const head: Op[] = [
        { kind: "rotate", deg: -hinge * HEAD_LIFT, pivot: SIDE_ANCHORS.neck },
        ...torso,
      ];
      const pelvis: Op[] = [
        { kind: "rotate", deg: hinge * PELVIS_FOLLOW, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      const leg: Op[] = [
        { kind: "rotate", deg: knee, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      const shank: Op[] = [
        { kind: "rotate", deg: -knee, pivot: SIDE_ANCHORS.knee },
        { kind: "rotate", deg: knee, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      // Arm about the shoulder: overhead-forward → down past the thigh.
      const swing = lerp(-160, 18, e);
      const upper: Op[] = [
        { kind: "rotate", deg: swing, pivot: SIDE_ANCHORS.shoulder },
        ...torso,
      ];
      const fore: Op[] = [
        { kind: "rotate", deg: -14, pivot: SIDE_ANCHORS.elbow },
        ...upper,
      ];
      return {
        head,
        torso,
        pelvis,
        thighL: leg,
        thighR: leg,
        shankL: shank,
        shankR: shank,
        upperArmL: upper,
        foreArmL: fore,
        handL: fore,
        upperArmR: upper,
        foreArmR: fore,
        handR: fore,
      };
    },
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () =>
      `<line x1="${SKI_ERG_PULLEY[0] + 6}" y1="-50" x2="${SKI_ERG_PULLEY[0] + 6}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
      `<line x1="-30" y1="${MACHINE_FLOOR + 1}" x2="146" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "jump-rope": {
    /* "Hold handles at your hips, elbows pinned close to your ribs ...
     * jump just an inch or two off the floor — enough to clear the rope.
     * Land softly on the balls of your feet." A small hop with the
     * elbows at the ribs and the hands at the hips; the rope is a loop
     * held at the hands, swinging from under the feet (0) forward and
     * over the head (1). */
    view: "side",
    viewBox: "-40 -30 176 244",
    groundY: 204,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { calves: "primary", forearm: "secondary" },
    pose: (e) => {
      const hop: Op[] = [{ kind: "translate", dx: 0, dy: -JUMP_HOP * e }];
      const fore: Op[] = [
        { kind: "rotate", deg: -32, pivot: SIDE_ANCHORS.elbow },
        ...hop,
      ];
      return {
        head: hop,
        torso: hop,
        pelvis: hop,
        thighL: hop,
        thighR: hop,
        shankL: hop,
        shankR: hop,
        upperArmL: hop,
        foreArmL: fore,
        handL: fore,
        upperArmR: hop,
        foreArmR: fore,
        handR: fore,
      };
    },
    scene: (e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      // The loop: a circle through the hands whose far side swings from
      // under the feet, through the front, to over the head.
      const a = Math.PI / 2 - e * Math.PI; // centre direction: down → up via front
      const cx = h[0] + JUMP_ROPE_R * Math.cos(a);
      const cy = h[1] + JUMP_ROPE_R * Math.sin(a);
      return (
        `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${JUMP_ROPE_R}" fill="none" stroke="${GEAR}" stroke-width="1.6"/>` +
        `<line x1="-40" y1="${MACHINE_FLOOR + 1}" x2="136" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },

  "pallof-press": {
    /* "Stand sideways to the cable at chest height, grip the handle with
     * both hands ... press the handle straight out in front of your
     * chest, resisting the rotation. Return slowly to your chest." The
     * cable runs to the camera and cannot be drawn; the press can: both
     * hands together at the sternum, out to full extension at chest
     * height, the trunk never turning (pinned still). */
    view: "side",
    viewBox: "-12 -6 152 218",
    groundY: 204,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      abs: "primary",
      obliques: "primary",
      "front-deltoids": "secondary",
    },
    pose: (e) => {
      const S = SIDE_ANCHORS.shoulder;
      const H: Pt = [S[0] + lerp(14, STRAIGHT_ARM * 0.995, e), S[1] + 12];
      const arm = aimArm(
        { S, E: SIDE_ANCHORS.elbow, H: SIDE_ANCHORS.hand },
        solveElbow(S, H, SIDE_UPPER_LEN, SIDE_FORE_LEN, 1),
        H,
        0
      );
      return {
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    scene: (_e, pose) => {
      // The handle's end-on grip at the hands (the cable leaves toward
      // the viewer), and the floor.
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return (
        `<circle cx="${h[0].toFixed(1)}" cy="${h[1].toFixed(1)}" r="4" fill="${GEAR}" stroke="${GEAR_EDGE}" stroke-width="0.8"/>` +
        `<line x1="-12" y1="${MACHINE_FLOOR + 1}" x2="140" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },

  /* ── 2026-09-03 build-out, batch 14: the burpee ── */

  burpees: {
    /* "Drop into a squat with your hands on the floor in front of you.
     * Kick your feet back into a plank, lower your chest to the floor.
     * Press back up, jump your feet forward to your hands. Explode
     * upward into a jump with arms overhead, then repeat." Six keyed
     * positions on one e (`burpeePose`); the hands stay on the floor
     * from the drop to the feet-forward, then go overhead with the jump.
     * Played back, the order is a burpee's own next rep. */
    view: "side",
    viewBox: "-60 -50 200 262",
    groundY: 204,
    shadowCx: 40,
    shadowRx: 60,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      quadriceps: "primary",
      chest: "primary",
      abs: "secondary",
      "front-deltoids": "secondary",
    },
    pose: burpeePose,
    scene: () =>
      `<line x1="-60" y1="${MACHINE_FLOOR + 1}" x2="140" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  /* ── 2026-09-03 build-out, batch 15: cycles — the walks, the stairs, the box ── */

  treadmill: {
    /* "Run or walk with upright posture and a natural arm swing. Don't
     * hold the handrails — let your arms drive the pace." A stride
     * CYCLE: the figure stays put, the belt moves under it, each foot
     * slides back in stance and lifts forward in swing, the arms
     * counter-swinging, hands off the rails (pinned). */
    view: "side",
    cycle: true,
    viewBox: "-12 -6 152 218",
    groundY: 204,
    concentricTo: 1,
    tint: {
      quadriceps: "primary",
      calves: "primary",
      gluteal: "secondary",
      hamstring: "secondary",
    },
    pose: (e) => gaitPose(gaitChain(e, { armSwing: 24, elbow: 28 })),
    scene: treadmillScene,
  },

  "incline-treadmill-walk": {
    /* "Set the incline between 10-15% ... keep a slight forward lean
     * from the ankles, not the hips. Let your arms swing naturally,
     * glutes and calves doing the work." The same stride on a belt
     * tilted 7° (a 12% grade): the BELT tilts and the body stays
     * upright with a 5° forward lean (pinned) — the first draft rotated
     * the whole figure with the belt, which leans it BACK against
     * gravity, the opposite of walking uphill. */
    view: "side",
    cycle: true,
    cycleMs: 1800,
    viewBox: "-12 -16 152 228",
    groundY: 204,
    concentricTo: 1,
    tint: {
      gluteal: "primary",
      calves: "primary",
      quadriceps: "secondary",
      hamstring: "secondary",
    },
    pose: (e) =>
      gaitPose(
        gaitChain(e, {
          lean: 5,
          armSwing: 18,
          elbow: 20,
          beltTilt: { deg: -INCLINE_WALK_DEG, pivot: INCLINE_PIVOT },
        })
      ),
    scene: () =>
      `<g transform="rotate(${-INCLINE_WALK_DEG} ${INCLINE_PIVOT[0]} ${INCLINE_PIVOT[1]})">` +
      `<rect x="6" y="${GAIT_BELT_Y + 3}" width="96" height="7" rx="3" fill="${GEAR}"/>` +
      `<line x1="112" y1="${GAIT_BELT_Y + 6}" x2="112" y2="86" stroke="${GEAR_DARK}" stroke-width="4"/>` +
      `<rect x="104" y="72" width="18" height="10" rx="2" fill="${GEAR_DARK}"/>` +
      `</g>` +
      `<line x1="6" y1="${MACHINE_FLOOR + 1}" x2="140" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "farmers-carry": {
    /* "Stand tall with shoulders packed down and back, core braced.
     * Walk forward in short controlled steps, eyes up, chest proud."
     * The stride cycle with the bells hanging from straight arms at the
     * sides (pinned: no swing, arms >170°), the trunk upright (pinned). */
    view: "side",
    cycle: true,
    cycleMs: 1800,
    equip: "dumbbell",
    viewBox: "-12 -6 152 218",
    groundY: 204,
    concentricTo: 1,
    tint: {
      forearm: "primary",
      trapezius: "secondary",
      abs: "secondary",
      quadriceps: "secondary",
    },
    pose: (e) => gaitPose(gaitChain(e, { armSwing: 0, elbow: 0 })),
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
    scene: () =>
      `<line x1="-12" y1="${MACHINE_FLOOR + 1}" x2="140" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "sled-push-pull": {
    /* "For the push: grip the handles low, lean in, drive through your
     * feet in short powerful strides." The stride cycle under a trunk
     * leaned 40° into the sled, straight arms to its handles (hands
     * pinned on them), the sled ahead. The pull is the same drill
     * facing the other way; the push is the one drawn. */
    view: "side",
    cycle: true,
    cycleMs: 1500,
    viewBox: "-12 -6 176 218",
    groundY: 204,
    shadowCx: 60,
    shadowRx: 40,
    concentricTo: 1,
    tint: {
      quadriceps: "primary",
      gluteal: "primary",
      calves: "secondary",
      abs: "secondary",
    },
    pose: (e) => gaitPose(gaitChain(e, { lean: 40, hands: SLED_HANDLE })),
    scene: () =>
      // The sled: runners on the floor, an upright post carrying the
      // handle, a plate on the runners; the floor.
      `<rect x="104" y="${MACHINE_FLOOR - 6}" width="52" height="5" rx="2" fill="${GEAR_DARK}"/>` +
      `<line x1="${SLED_HANDLE[0]}" y1="${MACHINE_FLOOR - 6}" x2="${SLED_HANDLE[0]}" y2="${SLED_HANDLE[1] - 6}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
      `<rect x="120" y="${MACHINE_FLOOR - 34}" width="26" height="28" rx="3" fill="${GEAR}"/>` +
      `<line x1="-12" y1="${MACHINE_FLOOR + 1}" x2="164" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  stairmaster: {
    /* "Stand tall with shoulders stacked over hips, light grip on the
     * rails. Climb with full steps — drive your whole foot down each
     * time." A step CYCLE: the stance foot rides its step down, the
     * swing foot lifts up and over onto the next; trunk upright
     * (pinned), hands resting on the rail ahead (pinned). */
    view: "side",
    cycle: true,
    cycleMs: 1700,
    viewBox: "-12 -6 152 218",
    groundY: 204,
    concentricTo: 1,
    tint: { gluteal: "primary", quadriceps: "primary", calves: "secondary" },
    pose: (e) => {
      const bob = 1.5 * (0.5 - 0.5 * Math.cos(4 * Math.PI * e));
      const hip: Pt = [GAIT_CX - 6, GAIT_HIP_Y - 4 + bob];
      const body: Op[] = [
        {
          kind: "translate",
          dx: hip[0] - SIDE_ANCHORS.hip[0],
          dy: hip[1] - SIDE_ANCHORS.hip[1],
        },
      ];
      const nearLeg = plantedLeg(hip, stairAnkle(e), KNEE_FORWARD);
      const farLeg = plantedLeg(hip, stairAnkle(e + 0.5), KNEE_FORWARD);
      const arm = armToWorld(body, STAIR_RAIL, ELBOW_LOW);
      return {
        head: body,
        torso: body,
        pelvis: body,
        thighL: nearLeg.thigh,
        shankL: nearLeg.shank,
        thighR: farLeg.thigh,
        shankR: farLeg.shank,
        upperArmL: arm.upper,
        foreArmL: arm.fore,
        handL: arm.fore,
        upperArmR: arm.upper,
        foreArmR: arm.fore,
        handR: arm.fore,
      };
    },
    scene: () => {
      // The stair block: a run of steps rising ahead, the rail.
      let steps = "";
      for (let i = -2; i <= 3; i++) {
        const x = GAIT_CX - 2 + i * 12;
        const y = GAIT_BELT_Y - i * STAIR_STEP;
        steps += `<rect x="${x}" y="${y + 2}" width="12" height="${STAIR_STEP - 1}" fill="${GEAR}"/>`;
      }
      return (
        steps +
        `<line x1="${STAIR_RAIL[0] + 2}" y1="${STAIR_RAIL[1] + 2}" x2="${STAIR_RAIL[0] + 2}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="3"/>` +
        `<line x1="${STAIR_RAIL[0] - 14}" y1="${STAIR_RAIL[1] + 2}" x2="${STAIR_RAIL[0] + 14}" y2="${STAIR_RAIL[1] + 2}" stroke="${GEAR_DARK}" stroke-width="3" stroke-linecap="round"/>` +
        `<line x1="-12" y1="${MACHINE_FLOOR + 1}" x2="140" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },

  "box-jumps": {
    /* "Dip into a quarter squat and swing your arms back for momentum.
     * Explode up onto the box, landing softly with both feet at the same
     * time. Stand fully upright on the box, then step down — don't jump
     * down." A CYCLE, so the step-down is a step-down and never a jump
     * played backwards: stand, dip with the arms back, flight, land on
     * the box with both feet, stand tall, step down backwards one foot
     * at a time, stand. */
    view: "side",
    cycle: true,
    cycleMs: 2600,
    viewBox: "-30 -56 190 268",
    groundY: 204,
    shadowCx: 70,
    shadowRx: 50,
    concentricTo: 1,
    tint: { quadriceps: "primary", gluteal: "primary", calves: "secondary" },
    pose: boxJumpPose,
    scene: () =>
      `<rect x="${BOX_X[0]}" y="${BOX_TOP}" width="${BOX_X[1] - BOX_X[0]}" height="${MACHINE_FLOOR - BOX_TOP}" rx="2" fill="${GEAR}"/>` +
      `<line x1="-30" y1="${MACHINE_FLOOR + 1}" x2="160" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  /* ── 2026-09-03 build-out, batch 16: pedals, the pool, the Zottman ── */

  bike: {
    /* "Adjust the seat so your leg has a slight bend at the bottom of
     * the pedal. Sit with a neutral spine, grip the bars loosely. Pedal
     * at a steady cadence." A crank CYCLE: seated, hands on the bars,
     * each foot riding the pedal circle, the far leg half a turn
     * behind. The seat height leaves a slight bend at the bottom
     * (pinned), never a locked knee. */
    view: "side",
    cycle: true,
    cycleMs: 1400,
    viewBox: "-12 -6 160 218",
    groundY: 204,
    shadowCx: 60,
    shadowRx: 50,
    concentricTo: 1,
    tint: {
      quadriceps: "primary",
      hamstring: "secondary",
      calves: "secondary",
    },
    pose: (e) =>
      pedalChain(e, {
        hip: BIKE_HIP,
        lean: 24,
        crank: CRANK,
        rx: CRANK_R,
        ry: CRANK_R,
        hands: BIKE_BARS,
      }),
    scene: () => bikeScene(BIKE_HIP, BIKE_BARS, CRANK, CRANK_R),
  },

  "spin-bike": {
    /* "Seat level with the bars ... pedal at a high cadence, alternating
     * seated and standing drives." The bike's crank cycle at a faster
     * cadence, lower bars and a deeper lean — the seated drive is the
     * one drawn. */
    view: "side",
    cycle: true,
    cycleMs: 1000,
    viewBox: "-12 -6 160 218",
    groundY: 204,
    shadowCx: 60,
    shadowRx: 50,
    concentricTo: 1,
    tint: { quadriceps: "primary", gluteal: "secondary", calves: "secondary" },
    pose: (e) =>
      pedalChain(e, {
        hip: SPIN_HIP,
        lean: 38,
        crank: CRANK,
        rx: CRANK_R,
        ry: CRANK_R,
        hands: SPIN_BARS,
      }),
    scene: () => bikeScene(SPIN_HIP, SPIN_BARS, CRANK, CRANK_R),
  },

  "assault-bike": {
    /* "Grip the moving handles, place feet on the pedals. Push and pull
     * with the arms while driving the pedals hard." The crank cycle
     * with the handles on a lever that swings with the stroke: the near
     * hand pushes forward as the near foot drives down (pinned: the
     * handle travels, the hand stays on it). */
    view: "side",
    cycle: true,
    cycleMs: 1200,
    viewBox: "-12 -6 160 218",
    groundY: 204,
    shadowCx: 60,
    shadowRx: 50,
    concentricTo: 1,
    tint: {
      quadriceps: "primary",
      "front-deltoids": "primary",
      "upper-back": "secondary",
      triceps: "secondary",
    },
    pose: (e) =>
      pedalChain(e, {
        hip: ASSAULT_HIP,
        lean: 20,
        crank: CRANK,
        rx: CRANK_R,
        ry: CRANK_R,
        hands: swingHandle(e, ASSAULT_HANDLE_PIVOT, 84, 0.28, 0),
      }),
    scene: (e) => {
      const h = swingHandle(e, ASSAULT_HANDLE_PIVOT, 84, 0.28, 0);
      return (
        bikeScene(ASSAULT_HIP, [h[0] - 40, h[1] + 30], CRANK, CRANK_R, false) +
        // The fan, and the handle lever from its pivot to the grip.
        `<circle cx="${ASSAULT_HANDLE_PIVOT[0] + 24}" cy="${ASSAULT_HANDLE_PIVOT[1] - 40}" r="24" fill="none" stroke="${GEAR_DARK}" stroke-width="3"/>` +
        `<line x1="${ASSAULT_HANDLE_PIVOT[0]}" y1="${ASSAULT_HANDLE_PIVOT[1]}" x2="${h[0].toFixed(1)}" y2="${h[1].toFixed(1)}" stroke="${GEAR_DARK}" stroke-width="3.4" stroke-linecap="round"/>` +
        `<circle cx="${ASSAULT_HANDLE_PIVOT[0]}" cy="${ASSAULT_HANDLE_PIVOT[1]}" r="3.2" fill="${GEAR_DARK}" stroke="${GEAR_EDGE}" stroke-width="0.8"/>`
      );
    },
  },

  elliptical: {
    /* "Step on the pedals with feet evenly placed, grip the moving
     * handles ... push and pull with arms and legs together for
     * full-body drive. Stand tall — no leaning on the console." Standing
     * (pinned upright), the feet riding a flat ellipse — the stride the
     * machine makes — and the hands on levers that swing with it. */
    view: "side",
    cycle: true,
    cycleMs: 1500,
    viewBox: "-12 -6 160 218",
    groundY: 204,
    shadowCx: 60,
    shadowRx: 50,
    concentricTo: 1,
    tint: {
      quadriceps: "primary",
      gluteal: "primary",
      "front-deltoids": "secondary",
      "upper-back": "secondary",
    },
    pose: (e) =>
      pedalChain(e, {
        hip: ELLIPTICAL_HIP,
        lean: 4,
        crank: ELLIPTICAL_CRANK,
        rx: 20,
        ry: 6,
        hands: swingHandle(e, ELLIPTICAL_HANDLE_PIVOT, 96, 0.22, Math.PI),
      }),
    scene: (e) => {
      const h = swingHandle(e, ELLIPTICAL_HANDLE_PIVOT, 96, 0.22, Math.PI);
      const c = ELLIPTICAL_CRANK;
      return (
        `<ellipse cx="${c[0]}" cy="${c[1]}" rx="22" ry="8" fill="none" stroke="${GEAR_DARK}" stroke-width="2.4"/>` +
        `<line x1="${ELLIPTICAL_HANDLE_PIVOT[0]}" y1="${ELLIPTICAL_HANDLE_PIVOT[1]}" x2="${h[0].toFixed(1)}" y2="${h[1].toFixed(1)}" stroke="${GEAR_DARK}" stroke-width="3.4" stroke-linecap="round"/>` +
        `<circle cx="${ELLIPTICAL_HANDLE_PIVOT[0]}" cy="${ELLIPTICAL_HANDLE_PIVOT[1]}" r="3.2" fill="${GEAR_DARK}" stroke="${GEAR_EDGE}" stroke-width="0.8"/>` +
        `<line x1="${ELLIPTICAL_HANDLE_PIVOT[0] + 24}" y1="${ELLIPTICAL_HANDLE_PIVOT[1] + 6}" x2="${ELLIPTICAL_HANDLE_PIVOT[0] + 24}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
        `<line x1="-12" y1="${MACHINE_FLOOR + 1}" x2="150" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },

  swimming: {
    /* "Focus on a streamlined body position — hips at the surface.
     * Breathe on a consistent rhythm for the stroke." Freestyle,
     * side-on: the body prone just under the water line with the hips
     * at the surface (pinned), each arm turning a full stroke about the
     * shoulder — recovery over the water, pull under it — the far arm
     * half a stroke behind, a flutter kick. */
    view: "side",
    cycle: true,
    cycleMs: 1800,
    viewBox: "-80 10 260 190",
    groundY: 204,
    shadowCx: 40,
    shadowRx: 0,
    concentricTo: 1,
    tint: {
      "upper-back": "primary",
      chest: "secondary",
      "front-deltoids": "secondary",
      gluteal: "secondary",
    },
    pose: swimPose,
    scene: () =>
      `<line x1="-70" y1="${WATER_Y}" x2="130" y2="${WATER_Y}" stroke="${GEAR}" stroke-width="1.4" stroke-dasharray="6 4"/>`,
  },

  "zottman-curl": {
    /* "Curl up with supinated (palms up) grip to shoulder height. At the
     * top, rotate your wrists so palms face down. Lower slowly in the
     * pronated grip." The curl's arc is the dumbbell curl's; the wrist
     * turn at the top is a grip change no camera on this rig can show.
     * What the split DOES change is who works: biceps on the way up,
     * forearm on the way down — so both are lit. */
    view: "side",
    equip: "dumbbell",
    concentricTo: 1,
    startsAt: "stretch",
    tint: { biceps: "primary", forearm: "primary" },
    pose: strictCurlPose,
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, h];
    },
  },

  /* ── 2026-09-03 build-out, batch 17: the man-maker and the get-up ── */

  "man-maker": {
    /* "Start in a high plank gripping dumbbells, body straight. Do a
     * push-up, then row each dumbbell in turn to your ribs. Jump your
     * feet forward to your hands and clean the dumbbells to your
     * shoulders. Press overhead, then reverse back into plank for the
     * next rep." A CYCLE of thirteen keyframes from plank to plank: the
     * push-up, each row (one hand to the ribs while the other holds the
     * plank — unilateral by instruction), the feet forward, the clean
     * to the shoulders, the press, and back down into the plank. */
    view: "side",
    cycle: true,
    cycleMs: 5200,
    equip: "dumbbell",
    viewBox: "-60 -50 200 262",
    groundY: 204,
    shadowCx: 40,
    shadowRx: 60,
    concentricTo: 1,
    tint: {
      chest: "primary",
      "upper-back": "primary",
      "front-deltoids": "primary",
      quadriceps: "secondary",
      abs: "secondary",
    },
    pose: (e) => keyedPose(MM_KEYS, e),
    bar: (_e, pose) => [
      applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []),
      applyToPoint(SIDE_ANCHORS.hand, [
        ...(pose.handR ?? []),
        { kind: "translate", dx: FAR_ARM_SHIFT[0], dy: FAR_ARM_SHIFT[1] },
      ]),
    ],
    scene: () =>
      `<line x1="-60" y1="${MACHINE_FLOOR + 1}" x2="140" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "turkish-get-up": {
    /* "Lie on your back, kettlebell pressed straight up with one arm ...
     * rise through a sequence: to elbow, to hand, to bridge, to
     * kneeling, to standing. Keep the arm locked and bell vertical
     * through every position. Reverse the sequence with the same
     * control." Seven keyframes in that order; the near arm holds the
     * bell plumb over the shoulder at every one (pinned), the far arm
     * posts on the floor until the kneel. Instruction 4 makes the rep
     * player's there-and-back the right player for it. */
    view: "side",
    equip: "kettlebell",
    viewBox: "-40 -50 200 262",
    groundY: 204,
    shadowCx: 60,
    shadowRx: 60,
    concentricTo: 1,
    startsAt: "stretch",
    tint: {
      abs: "primary",
      "front-deltoids": "primary",
      gluteal: "secondary",
      obliques: "secondary",
    },
    pose: (e) => keyedPose(TGU_KEYS, e),
    bar: (_e, pose) => {
      const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
      return [h, [h[0], h[1] - 8]];
    },
    scene: () =>
      `<line x1="-40" y1="${MACHINE_FLOOR + 1}" x2="160" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  /* ── 2026-09-03 build-out, batch 18: the ankle — the last row ── */

  "seated-calf-raise": {
    /* "Sit with the pads on your lower thighs, balls of your feet on the
     * platform. Release the safety lever and drop your heels below the
     * platform for a stretch. Raise your heels as high as possible,
     * squeezing the soleus at the top." The ball of the foot FIXED on
     * the platform (pinned), the foot rotating about it from heels
     * below the platform to heels high, the shin and the thigh pad
     * rising with the ankle, the hips on the seat (pinned). The rig's
     * foot became its own piece for this: the ledger's last row. */
    view: "side",
    viewBox: "-12 -6 172 218",
    groundY: 204,
    shadowCx: 62,
    shadowRx: 36,
    concentricTo: 1,
    startsAt: "stretch",
    tint: { calves: "primary" },
    pose: seatedCalfPose,
    scene: (_e, pose) => {
      const knee = applyToPoint(SIDE_ANCHORS.knee, pose.thighL ?? []);
      return (
        // Seat, backrest, the thigh pad riding the knee, the platform
        // the ball rests on (open below it for the heel), the floor.
        `<rect x="${(SCR_SEAT[0] - 26).toFixed(1)}" y="${(SCR_SEAT[1] + 6).toFixed(1)}" width="56" height="8" rx="2.6" fill="${GEAR}"/>` +
        `<rect x="${(SCR_SEAT[0] - 20).toFixed(1)}" y="${(SCR_SEAT[1] - 78).toFixed(1)}" width="8" height="86" rx="2.6" fill="${GEAR}" transform="rotate(-4 ${(SCR_SEAT[0] - 12).toFixed(1)} ${(SCR_SEAT[1] + 4).toFixed(1)})"/>` +
        `<line x1="${SCR_SEAT[0]}" y1="${(SCR_SEAT[1] + 14).toFixed(1)}" x2="${SCR_SEAT[0]}" y2="${MACHINE_FLOOR}" stroke="${GEAR_DARK}" stroke-width="4"/>` +
        `<rect x="${(knee[0] - 22).toFixed(1)}" y="${(knee[1] - 16).toFixed(1)}" width="30" height="8" rx="3" fill="${GEAR}"/>` +
        `<line x1="${(knee[0] - 7).toFixed(1)}" y1="${(knee[1] - 16).toFixed(1)}" x2="${(knee[0] - 7).toFixed(1)}" y2="${(knee[1] - 40).toFixed(1)}" stroke="${GEAR_DARK}" stroke-width="3"/>` +
        `<rect x="${SCR_PLATFORM[0] - 4}" y="${SCR_PLATFORM[1]}" width="20" height="${MACHINE_FLOOR - SCR_PLATFORM[1]}" rx="1.5" fill="${GEAR}"/>` +
        `<line x1="-12" y1="${MACHINE_FLOOR + 1}" x2="160" y2="${MACHINE_FLOOR + 1}" stroke="${GEAR_DARK}" stroke-width="1.6"/>`
      );
    },
  },
};

/** Sibling exercises that share a demo's motion pattern.
 *
 * Alias hygiene (Motion Rig V2 roadmap, owner-decided 2026-07-16): an
 * alias is only legitimate when the variant genuinely shares the
 * canonical's grip, prop, and support geometry. `db-curl`/`hammer-curl`/
 * `ez-bar-curl`/`cable-curl` (different implement + grip semantics) and
 * `reverse-grip-cable-pushdown` (straight bar, not a rope attachment)
 * were removed — they fell back to the static reference until each had
 * its own prop/grip contract. Every one of them has one now (batches
 * 1, 3 and 8 of the 2026-09-03 build-out). */
const DEMO_ALIASES: Record<string, string> = {
  "db-shoulder-press": "overhead-press",
  "smith-shoulder-press": "overhead-press",
  "sumo-deadlift": "deadlift",
  "trap-bar-deadlift": "deadlift",
  "db-rdl": "romanian-deadlift",
  "front-squat": "squat",
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
  /* 2026-09-03 build-out, batch 1. Each alias is honest in PROFILE
     specifically: the difference between the variant and its canonical
     is grip width or hand orientation, which an end-on profile cannot
     show and which does not change the arc. */
  "hammer-curl": "db-curl", // neutral vs supinated grip: invisible end-on
  "ez-bar-curl": "barbell-curl", // EZ vs straight bar: same end-on plate
  "close-grip-bench": "bench-press", // grip width: both hands stack in profile
  "bodyweight-lunge": "lunges", // gear-free (stripped below)
  "walking-dumbbell-lunges": "lunges",
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

/** Aliases that share their canonical's MOTION but not its held gear.
 *  The moment `squat` gained a back-rack barbell, three of its aliases
 *  became lies: a bodyweight squat holds nothing, a goblet squat holds
 *  a dumbbell at the chest, a front squat racks the bar on the FRONT
 *  delts. Same movement, wrong implement — which is exactly the
 *  alias-hygiene criterion that removed db-curl et al. on 2026-07-16.
 *  These keep the animation and drop the gear (the pre-bar status quo,
 *  already accepted as honest), rather than falling all the way back
 *  to the static reference. smith-machine-squat keeps the bar: a bar
 *  on the traps is true of it, just minus the rails. */
const HELD_GEAR_FREE_VARIANTS: ReadonlySet<string> = new Set([
  "bodyweight-squat",
  "front-squat",
  "bodyweight-lunge",
]);

function stripHeldGear(demo: BodyDemo): BodyDemo {
  const { equip: _equip, bar: _bar, plateR: _plateR, ...rest } = demo;
  return rest;
}

/* ── Form beats: the placard sequence ────────────────────────────────
 *
 * A named position, the frame that shows it, and the cue that belongs
 * to it — the numbered panels of a gym form placard (owner reference,
 * 2026-09-03: a six-panel chest-dip card, every panel captioned under
 * its own drawing). Where a demo has beats the player STEPS through
 * them, holding on each long enough to read, instead of running the
 * two-way rep — and the cue sits under the figure it describes rather
 * than in an instruction list further down the page.
 *
 * Keyed by EXERCISE ID, and deliberately NOT alias-resolved.
 * `tricep-dips` and `weighted-chest-dip` render the `dips` GEOMETRY,
 * which is already an approximation for the upright triceps variant —
 * whose own catalogue entry reads "don't lean forward like a chest
 * dip". Inheriting these captions would promote a silent visual
 * approximation into written coaching that contradicts the exercise.
 * A variant earns beats by having its own row.
 */
export interface FormBeat {
  /** The demo's own progress value — this beat IS a frame of it, and
   *  the legacy rig coordinate; image load failures use the frame player retry state. */
  t: number;
  /** The position's name: the panel heading. */
  label: string;
  /** What the lifter does here. Authored to the placard read budget in
   *  `PLACARD_TIMING` — about seven words, one instruction. */
  cue: string;
  /** SUPPLIED ART for this position: a path under `public/`, resolved
   *  against the app's base URL by the player. Where a placard has
   *  them, the frames ARE the animation and the rig figure is the
   *  fallback for when they fail to load. */
  image?: string;
}

/** A placard: the positions, and — where the frames are supplied art
 *  rather than the rig's own figure — the key that describes THAT art. */
export interface FormPlacard {
  beats: readonly FormBeat[];
  /** The muscle key for SUPPLIED art. The catalogue names the muscle
   *  groups an exercise trains, which is a true statement about the
   *  exercise and not necessarily about the picture: the dips card
   *  shades a pec solid and hatches the serratus, neither of which the
   *  catalogue's "chest / triceps / shoulders" describes. A key is a
   *  key to what is ON SCREEN, so supplied art brings its own. */
  key?: DemoMuscleKey;
}

export interface DemoMuscleKey {
  primary: string[];
  secondary: string[];
  /** How the secondary muscles are painted. The rig pales the purple;
   *  the supplied card hatches it, and a solid swatch beside a hatched
   *  muscle is a key describing something that is not there. */
  secondaryFill: "solid" | "hatch";
}

const FORM_BEATS: Record<string, FormPlacard> = {
  "db-curl": {
    beats: [
      { t: 0, label: "Set up", cue: "Stand tall, palms forward, elbows by ribs." },
      { t: 0.25, label: "Initiate curl", cue: "Bend both elbows; keep your torso still." },
      { t: 0.6, label: "Mid curl", cue: "Upper arms still, wrists straight." },
      { t: 1, label: "Top contraction", cue: "Curl up without lifting your elbows." },
      { t: 0.6, label: "Controlled lower", cue: "Lower slowly along the same arc." },
      { t: 0.15, label: "Finish return", cue: "Return towards straight arms without bouncing." },
    ],
  },

  /* Dips — the first placard demo. Six positions on the dip's own t,
   * where 0 is the locked-out top and 1 the bottom. The cues are the
   * catalogue's four authored steps re-cut into the six frames the
   * geometry actually passes through: the lean (step 2) belongs to the
   * descent because the rig leans continuously, 12° → 30°, as it
   * sinks, and "keeping the forward lean locked" (step 4) belongs to
   * the press. */
  dips: {
    /* The FRAMES are the owner's own card, cut into six by
       `scripts/extract-form-frames.mjs` — the card's art, unretouched
       apart from its panel text, which the app renders itself so it
       can be themed, selected, translated and read at any size.
       
       Each beat keeps its `t` as well. That is not redundancy: it is
       the fallback the rig renders when a frame cannot load, and it is
       what every geometry pin below still measures. */
    beats: [
      {
        t: 0,
        label: "Top position",
        cue: "Arms locked, chest tall, core braced.",
        image: "form-frames/dips/1.webp",
      },
      {
        t: 0.22,
        label: "Initiate descent",
        cue: "Unlock the elbows and lean forward.",
        image: "form-frames/dips/2.webp",
      },
      {
        t: 0.62,
        label: "Mid descent",
        cue: "Elbows travel back as the chest sinks.",
        image: "form-frames/dips/3.webp",
      },
      {
        t: 1,
        label: "Bottom position",
        cue: "Stop when upper arms reach parallel.",
        image: "form-frames/dips/4.webp",
      },
      {
        t: 0.5,
        label: "Press up",
        cue: "Drive through the palms, holding the lean.",
        image: "form-frames/dips/5.webp",
      },
      {
        t: 0,
        label: "Return to top",
        cue: "Lock the elbows out, ready to repeat.",
        image: "form-frames/dips/6.webp",
      },
    ],
    /* The card's own names, because the card's art is what is on
       screen. Finer than the catalogue's groups, and the two hatched
       entries are hatched in the pictures. */
    key: {
      primary: ["Pectoralis major"],
      secondary: [
        "Triceps",
        "Anterior deltoids",
        "Lower chest",
        "Serratus anterior",
      ],
      secondaryFill: "hatch",
    },
  },

  "bench-press": {
    /* Card-sourced (2026-09-03), so the figure region is 451px against
       the 900 the player renders — softer than the dips set, which came
       from six per-position images at 754. Labels follow the card's own
       panel headings so the two agree. */
    beats: [
      {
        t: 1,
        label: "Set up",
        cue: "Shoulder blades pinched, feet planted.",
        image: "form-frames/bench-press/1.webp",
      },
      {
        t: 0.75,
        label: "Unrack",
        cue: "Bar over the shoulders, arms locked.",
        image: "form-frames/bench-press/2.webp",
      },
      {
        t: 0.35,
        label: "Lower",
        cue: "Elbows about 45 degrees from the torso.",
        image: "form-frames/bench-press/3.webp",
      },
      {
        t: 0,
        label: "Bottom position",
        cue: "Bar touches the mid-chest, no bounce.",
        image: "form-frames/bench-press/4.webp",
      },
      {
        t: 0.5,
        label: "Drive",
        cue: "Press up and slightly back.",
        image: "form-frames/bench-press/5.webp",
      },
      {
        t: 1,
        label: "Lockout",
        cue: "Arms straight, ribs still down.",
        image: "form-frames/bench-press/6.webp",
      },
    ],
  },

  "rope-tricep-pushdown": {
    /* RE-ART 2026-09-04. The first set drew the cable machine as a
       bare post with a pulley — no stack, no guide rods, no housing —
       and this one draws the whole tower, with the plate block moving
       through the rep. That is the change worth having; it is also the
       one a consistency metric MISSES, because a machine with more
       parts in it scores slightly WORSE on frame-to-frame overlap
       while being strictly better art. The overlap reading nearly
       argued against adopting it.

       Six per-position images, edited from one original: figure height
       936px and foot line y=1080 in all six, back edge within 8px.
       Registration declines to move any frame.

       `t` runs stretch (elbows bent, rope high) to lockout, which is
       this demo's own direction: concentricTo 1, startsAt "stretch".

       The stack ladder is monotonic 1 -> 5 and descends at 6, which is
       right — but it is DECORATION, not a readout. Measured across the
       set the cable is not conserved: between "set elbows" and
       "controlled return" the hands rise 68px and the stack rises with
       them, the wrong way. This is a known replacement requirement:
       the new release gate must reject contradictory cable physics. */
    beats: [
      {
        t: 0,
        label: "Start",
        cue: "Elbows pinned, rope high, triceps stretched.",
        image: "form-frames/rope-tricep-pushdown/1.webp",
      },
      {
        t: 0.1,
        label: "Set elbows",
        cue: "Pin the elbows; upper arms stay still.",
        image: "form-frames/rope-tricep-pushdown/2.webp",
      },
      {
        t: 0.4,
        label: "Initiate push",
        cue: "Drive the rope down by extending.",
        image: "form-frames/rope-tricep-pushdown/3.webp",
      },
      {
        t: 0.7,
        label: "Mid pushdown",
        cue: "Keep pushing; the triceps contract.",
        image: "form-frames/rope-tricep-pushdown/4.webp",
      },
      {
        t: 1,
        label: "Lockout",
        cue: "Elbows fully extended, hands at the thighs.",
        image: "form-frames/rope-tricep-pushdown/5.webp",
      },
      {
        t: 0,
        label: "Controlled return",
        cue: "Return slowly; elbows must not drift.",
        image: "form-frames/rope-tricep-pushdown/6.webp",
      },
    ],
  },

  /* Supplied art, 2026-09-04. The labels are the card's, not the ones
     authored ahead of it: the pictures decide, the same way the
     pushdown's cues follow its drawings.

     THREE cues from the authored set are gone, all for one reason —
     this card is a FRONT view and they are sagittal claims. "Head back
     slightly", "head through as the bar passes it" and "bar over the
     mid-foot" are all true of the lift and none of them is visible
     from the front, so each would have been a caption asserting
     something the frame beneath it cannot show. That is the dips
     lockout mistake in another form: there the caption said "arms
     locked" over a 152-degree elbow. A cue has to be checkable against
     its own picture. */
  "overhead-press": {
    beats: [
      {
        t: 0,
        label: "Start position",
        cue: "Bar on the front delts, elbows under.",
        image: "form-frames/overhead-press/1.webp",
      },
      {
        t: 0.1,
        label: "Brace and set",
        cue: "Ribs down, glutes tight, grip outside shoulders.",
        image: "form-frames/overhead-press/2.webp",
      },
      {
        t: 0.4,
        label: "Initiate press",
        cue: "Drive the bar straight past the chin.",
        image: "form-frames/overhead-press/3.webp",
      },
      {
        t: 0.7,
        label: "Drive up",
        cue: "Keep pushing; the bar clears the head.",
        image: "form-frames/overhead-press/4.webp",
      },
      {
        t: 1,
        label: "Lockout",
        cue: "Elbows locked, bar centred over the head.",
        image: "form-frames/overhead-press/5.webp",
      },
      {
        t: 0,
        label: "Controlled return",
        cue: "Same path down, elbows stay under.",
        image: "form-frames/overhead-press/6.webp",
      },
    ],
    /* Solid, not hatched: this card fills its secondaries with flat
       lilac where the dips card cross-hatched them. The names are the
       card's own — it shades the anterior delt caps darkest and pales
       the chest, abs and upper arms, which is finer than the
       catalogue's "Deltoids / Triceps, Upper Chest, Core". */
    key: {
      primary: ["Anterior deltoids"],
      secondary: ["Upper chest", "Triceps", "Core"],
      secondaryFill: "solid",
    },
  },

  /* Supplied art, 2026-09-04. The first card whose registration
     EARNED itself: `MID LOWER` was drawn 31px low (its bench pad sits
     at y=718 where the other five sit at 687), and the gated shift
     caught it — 28% aligned before, 62.4% after. Every earlier card
     either needed no shift or had the shift declined, so this is the
     first evidence the pass does anything on real art.

     The bench is furniture, so the DEFAULT station anchor is correct
     here; `--anchor base` exists for the free-weight case (see the
     overhead press) and would be wrong on a lying exercise, where the
     figure's ground contact is the bench it is lying on. */
  "skull-crushers": {
    beats: [
      {
        t: 0,
        label: "Start",
        cue: "Bar over the chest, elbows locked.",
        image: "form-frames/skull-crushers/1.webp",
      },
      {
        t: 0.15,
        label: "Initiate lower",
        cue: "Tilt the upper arms back, unlock elbows.",
        image: "form-frames/skull-crushers/2.webp",
      },
      {
        t: 0.5,
        label: "Mid lower",
        cue: "Only the forearms move; upper arms hold.",
        image: "form-frames/skull-crushers/3.webp",
      },
      {
        t: 1,
        label: "Bottom",
        cue: "Bar past the forehead, triceps stretched.",
        image: "form-frames/skull-crushers/4.webp",
      },
      {
        t: 0.55,
        label: "Extend",
        cue: "Drive back up; elbows stay stacked.",
        image: "form-frames/skull-crushers/5.webp",
      },
      {
        t: 0,
        label: "Return to lockout",
        cue: "Elbows locked again, ready to repeat.",
        image: "form-frames/skull-crushers/6.webp",
      },
    ],
    /* The card's own reading, which is NARROWER than the catalogue's.
       `secondaryMuscles` claims Chest and Front Delts; the art shades
       neither. It shades the triceps solid and pales the forearms —
       the same two-tier convention as the rope pushdown card, from the
       same generator. A key describes what is on screen. */
    key: {
      primary: ["Triceps"],
      secondary: ["Forearms"],
      secondaryFill: "solid",
    },
  },

  /* Supplied art, 2026-09-04. The tightest source set so far — foot
     line within 4px and stance width within 3px across all six, which
     is what lets registration sit at 84-97% with a single 4px nudge.

     `--anchor base` again, and for the same reason as the overhead
     press: the dumbbells travel from the thighs to shoulder height, so
     the grey-equipment mask is the WORST thing in frame to align on.
     The rule that decides it is not "free weight" but "does the load
     move" — the skull-crusher bench is furniture and takes the default
     anchor even though a barbell is in shot. */
  "lateral-raise": {
    beats: [
      {
        t: 0,
        label: "Start",
        cue: "Dumbbells at the thighs, arms straight.",
        image: "form-frames/lateral-raise/1.webp",
      },
      {
        t: 0.1,
        label: "Set position",
        cue: "Slight bend in the elbows, ribs down.",
        image: "form-frames/lateral-raise/2.webp",
      },
      {
        t: 0.4,
        label: "Initiate raise",
        cue: "Lead with the elbows, not the hands.",
        image: "form-frames/lateral-raise/3.webp",
      },
      {
        t: 0.7,
        label: "Mid raise",
        cue: "Keep the elbow angle fixed throughout.",
        image: "form-frames/lateral-raise/4.webp",
      },
      {
        t: 1,
        label: "Top position",
        cue: "Arms level with the shoulders.",
        image: "form-frames/lateral-raise/5.webp",
      },
      {
        t: 0,
        label: "Controlled return",
        cue: "Lower slowly; resist all the way down.",
        image: "form-frames/lateral-raise/6.webp",
      },
    ],
    /* Read off the art at the top position, where the shading is
       clearest: the side-delt cap is solid, and the pale wash covers
       the trap, the FOREARM and the abs — the upper arm is unshaded.
       Broader than the catalogue, which claims Traps alone. */
    key: {
      primary: ["Side deltoids"],
      secondary: ["Traps", "Forearms", "Core"],
      secondaryFill: "solid",
    },
  },

  /* ── Authored ahead of the art (2026-09-03) ──────────────────────
   * Positions only: no `image`, so `getFormBeats` returns null and
   * these play as ordinary reps until their cards arrive. They exist
   * so `form-card-prompt.ts` can ask a generator for exactly these six
   * panels — a prompt built from four catalogue instructions produces
   * a card the app cannot use.
   *
   * This header used to sit above bench-press, and stayed put as three
   * placards below it were given art — so it went on calling them
   * imageless long after they stopped being. It belongs immediately
   * above the first entry it is still true of; move it DOWN again as
   * the remaining cards arrive.
   *
   * `t` runs in each demo's OWN direction, which differs: row locks
   * out at t=1, squat and deadlift at t=0. The order pins in
   * bodyRig.test.ts check the labels against that, not against a
   * convention assumed here. */

  squat: {
    beats: [
      { t: 0, label: "Set up", cue: "Bar on the traps, chest tall, brace." },
      { t: 0.3, label: "Descend", cue: "Hips back and knees out together." },
      { t: 0.7, label: "Parallel", cue: "Hip crease level with the knee." },
      { t: 1, label: "Bottom", cue: "Depth without the lower back rounding." },
      { t: 0.45, label: "Drive", cue: "Push the floor away, chest up." },
      { t: 0, label: "Stand", cue: "Hips and knees lock out together." },
    ],
  },

  deadlift: {
    beats: [
      { t: 1, label: "Set up", cue: "Bar over mid-foot, shins close." },
      {
        t: 0.8,
        label: "Take the slack",
        cue: "Chest up, lats tight, arms straight.",
      },
      {
        t: 0.5,
        label: "Break the floor",
        cue: "Push the legs, bar stays against you.",
      },
      {
        t: 0.25,
        label: "Past the knees",
        cue: "Hips and shoulders rise together.",
      },
      { t: 0, label: "Lockout", cue: "Stand tall, glutes squeezed." },
      { t: 1, label: "Return", cue: "Hips back first, then bend the knees." },
    ],
  },

  "pull-ups": {
    beats: [
      { t: 0, label: "Dead hang", cue: "Arms straight, shoulders active." },
      {
        t: 0.3,
        label: "Initiate",
        cue: "Pull the shoulder blades down first.",
      },
      { t: 0.6, label: "Mid pull", cue: "Elbows drive down toward the ribs." },
      { t: 1, label: "Top", cue: "Chin over the bar, chest to it." },
      { t: 0.5, label: "Lower", cue: "Control the descent, no dropping." },
      { t: 0, label: "Hang", cue: "Back to straight arms, stay tight." },
    ],
  },

  /* Supplied art, 2026-09-04. The cleanest registration of any set:
     95.8-98.7%, not one shift applied. The shoes are why — a rigid,
     high-contrast ground contact that never moves (L=540, R=762, sole
     at y=1069-1070 across all six, a 1px spread), which is exactly
     what `--anchor base` wants. Load moves, so base anchor; see the
     lateral raise for why the test is "does the load move" and not
     "is it a free weight".

     The authored cue said "torso about 45 degrees". MEASURED off this
     art it is 27-30 degrees below horizontal — so 45 was wrong on the
     horizontal reading and wrong on the vertical one (63) too. The cue
     now describes the hinge without asserting a number, which is the
     dips-lockout lesson: a caption is a claim about its own frame. */
  "barbell-row": {
    beats: [
      {
        t: 0,
        label: "Start",
        cue: "Hinged over, arms straight, lats stretched.",
        image: "form-frames/barbell-row/1.webp",
      },
      {
        t: 0.1,
        label: "Set position",
        cue: "Back flat, hinged from the hips.",
        image: "form-frames/barbell-row/2.webp",
      },
      {
        t: 0.4,
        label: "Initiate pull",
        cue: "Shoulder blades pull before the arms.",
        image: "form-frames/barbell-row/3.webp",
      },
      {
        t: 0.7,
        label: "Mid row",
        cue: "Elbows track back, not out.",
        image: "form-frames/barbell-row/4.webp",
      },
      {
        t: 1,
        label: "Top contract",
        cue: "Bar to the lower ribs, squeeze.",
        image: "form-frames/barbell-row/5.webp",
      },
      {
        t: 0,
        label: "Controlled lower",
        cue: "Control it; the torso angle holds.",
        image: "form-frames/barbell-row/6.webp",
      },
    ],
    /* Broader than the catalogue again: it claims Rhomboids, Rear
       Delts and Biceps, and the art additionally washes the traps and
       the whole posterior chain — glutes and hamstrings are shaded
       because they hold the hinge. Rhomboids are not separable from
       the lat wedge at this size, so they are not named. */
    key: {
      primary: ["Lats"],
      secondary: ["Traps", "Rear deltoids", "Biceps", "Glutes", "Hamstrings"],
      secondaryFill: "solid",
    },
  },
};

/**
 * The placard sequence for an exercise, or null where the demo plays as
 * an ordinary rep or a cycle.
 *
 * A placard is LIVE only once its card exists. The positions are
 * authored AHEAD of the art, because the generator prompt is built from
 * them — asking for six panels while the app knows only four
 * instructions produces a card that does not match the code. Until
 * every position has a frame, the exercise plays as an ordinary rep and
 * nothing about it changes.
 */
export function getFormBeats(exerciseId: string): readonly FormBeat[] | null {
  const placard = FORM_BEATS[exerciseId];
  const artwork = getReleasedFormArtwork(exerciseId);
  if (!placard || placard.beats.length !== 6 || !artwork) return null;
  return placard.beats.every((beat, i) => beat.image === artwork.frames[i])
    ? placard.beats : null;
}

/** The authored positions whether or not their art has arrived — for
 *  `form-card-prompt.ts`, which exists to go and ask for that art. */
export function getAuthoredBeats(
  exerciseId: string
): readonly FormBeat[] | null {
  return FORM_BEATS[exerciseId]?.beats ?? null;
}

/** Every id that has one, for the tests that pin them against the
 *  geometry they caption. */
export const FORM_BEAT_IDS = Object.keys(FORM_BEATS);

/** The muscle key a demo's own art needs, or null where the catalogue's
 *  groups describe the picture perfectly well (every rig-drawn demo:
 *  it tints the muscles the catalogue names). */
export function getDemoMuscleKey(exerciseId: string): DemoMuscleKey | null {
  return FORM_BEATS[exerciseId]?.key ?? null;
}

/** PRODUCTION lookup — what the Form surface may mount. Applies the
 *  alias map, the side-demo flag, the misrepresentation gate, and the
 *  held-gear strip for gear-incompatible aliases. */
export function getBodyDemo(exerciseId: string): BodyDemo | null {
  const canonical = DEMO_ALIASES[exerciseId] ?? exerciseId;
  if (GATED_PENDING_REPAIR.has(canonical)) return null;
  const demo = BODY_DEMOS[canonical] ?? null;
  if (demo && demo.view === "side" && !SIDE_DEMOS_ENABLED) return null;
  if (demo && HELD_GEAR_FREE_VARIANTS.has(exerciseId)) {
    return stripHeldGear(demo);
  }
  return demo;
}

/** REVIEW lookup — alias-aware registry resolution with no production
 *  gates, so contact sheets and mechanics tests keep rendering gated
 *  demos while their repairs are iterated. */
function resolveDemoForReview(exerciseId: string): BodyDemo | null {
  const demo = BODY_DEMOS[DEMO_ALIASES[exerciseId] ?? exerciseId] ?? null;
  return demo && HELD_GEAR_FREE_VARIANTS.has(exerciseId)
    ? stripHeldGear(demo)
    : demo;
}

/* ── Props ────────────────────────────────────────────────────── */

/**
 * Map a demo's declared equipment and its SOLVED contact points onto the
 * typed prop state, then render it (see `bodyProps.ts`).
 *
 * Both renderers come through here, which is the point. They used to
 * carry separate `equip` branch chains that had already drifted: the
 * side copy of `plate-end` grew a collar, a sleeve tip and `plateR`
 * support while the anterior copy stayed a bare r=10 disc. And since
 * every `plate-end` demo is a side demo, the anterior copy was also
 * unreachable — a divergent DEAD mirror of a live renderer, so nothing
 * failed as they came apart.
 *
 * Empty layers when a demo declares no apparatus: most free-weight
 * movements carry their meaning in the movement and the muscle tint.
 */
function resolveProp(
  demo: BodyDemo,
  e: number,
  pose: Partial<Record<GroupName, Op[]>>,
  scene: { frameY: number; floorY: number }
): PropLayers {
  const ends = demo.bar?.(e, pose);
  if (!ends || !demo.equip) return { behind: "", front: "" };
  const [left, right] = ends;

  let state: PropState | null = null;
  switch (demo.equip) {
    case "fixed-bar":
      state = { kind: "fixedBar", left, right, frameY: scene.frameY };
      break;
    case "cable-bar":
      state = { kind: "cableBar", left, right, frameY: scene.frameY };
      break;
    case "dip-bars":
      state = { kind: "dipBars", left, right, floorY: scene.floorY };
      break;
    case "back-barbell":
      // Racked on the traps: the torso occludes the shaft's middle, so
      // only the ends + plates show beside the shoulders — which is
      // exactly what a back squat looks like from the front.
      state = {
        kind: "rigidBar",
        view: "frontal",
        left,
        right,
        plateR: demo.plateR ?? 10,
        layer: "behind",
      };
      break;
    case "barbell":
      // Frontal: the two grips ARE the bar's ends, so grip width is bar
      // width and the shaft cannot drift off the hands.
      state = {
        kind: "rigidBar",
        view: "frontal",
        left,
        right,
        plateR: demo.plateR ?? 10,
      };
      break;
    case "goblet-bell": {
      // ONE dumbbell held VERTICALLY at the sternum — top head cupped
      // in the hands, handle down through the palms, bottom head
      // hanging below (owner review 2026-09-02: "the actual weight
      // should be a goblet" — it drew a flat plate disc). Centred on
      // the grip, rides wherever the hands ride.
      const mid: Pt = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
      state = { kind: "gobletDumbbell", hand: mid };
      break;
    }
    case "dumbbell":
      // One bell per solved grip, end-on. 5.5 sits between the fist
      // (~7 long) and the press plate (9): clearly gear, clearly
      // lighter than a barbell plate.
      state = { kind: "dumbbell", hands: [left, right], bellR: 5.5 };
      break;
    case "plate-end":
      // Profile: both grips stack behind one another, so the near hand
      // IS the bar's on-screen position.
      state = {
        kind: "rigidBar",
        view: "profile",
        hand: left,
        plateR: demo.plateR ?? 10,
        sleeveDir: demo.sleeveDir ?? 1,
      };
      break;
    case "kettlebell":
      // `bar` returns [grip, ball centre]: the demo decides where the
      // bell hangs or floats relative to the arm.
      state = { kind: "kettlebell", hand: left, bell: right };
      break;
    case "landmine":
      if (demo.pivot)
        state = { kind: "landmine", pivot: demo.pivot, hand: left };
      break;
    case "frontal-cables":
    case "frontal-levers":
      if (demo.pivots) {
        state = {
          kind: "frontalPair",
          anchors: demo.pivots,
          hands: [left, right],
          style: demo.equip === "frontal-cables" ? "cable" : "lever",
        };
      }
      break;
    case "lever-handle":
      if (demo.pivot) {
        state = { kind: "leverHandle", pivot: demo.pivot, hand: left };
      }
      break;
    case "cable-handle":
      // One grip end-on (both hands stack in profile), the cable solved
      // from wherever the station's pulley is to the hand every frame.
      if (demo.pulley) {
        state = { kind: "cableHandle", pulley: demo.pulley, hand: left };
      }
      break;
    case "rope":
      // Spread opens with the rep — the exercise's own instruction is
      // "spreading the ends apart as your arms lock out".
      if (demo.pulley) {
        state = {
          kind: "ropeAttachment",
          pulley: demo.pulley,
          hand: left,
          spread: e,
        };
      }
      break;
  }
  return state ? renderProp(state) : { behind: "", front: "" };
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
  /* 0.22, down from 0.4 (owner device review 2026-09-02: "in the front
     the shoulders move weird"): at a raise to parallel the 0.4 follow
     swung each cap ~29° up and out of the trap line, so the shoulders
     read as epaulettes lifting off the torso. The cap now tilts ~16°
     at parallel and still rides the girdle lift. */
  const DELTOID_FOLLOW = 0.22;
  /** Cap on the cap: scapular upward rotation tops out (~60 deg of a
   *  180-deg reach), which reads as ~38 deg of deltoid tilt in this 2D
   *  stylization — beyond that the wedge visibly lifts off the traps. */
  const DELTOID_MAX_DEG = 20;
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

  /* Parts the vendored figure omits — feet (anterior only; the
     posterior art already runs past the heel) and fists (both views).
     Each rides its declared group's transform, so they inherit the arm
     and leg solves rather than being placed independently. */
  const extras = [
    ...(view === "anterior" ? ANTERIOR_FEET : []),
    ...(view === "anterior" ? ANTERIOR_HANDS : POSTERIOR_HANDS),
  ]
    .map((part) => {
      const pts = applyOps(part.points, pose[part.group] ?? []);
      return `<polygon points="${pts
        .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
        .join(" ")}" fill="${BODY}"/>`;
    })
    .join("");

  /* Structural equipment only. Held weights were removed — see the
     header. A bare line reads as NOTHING ("is that a treadmill?"), so
     every apparatus carries enough construction to be identifiable:
     the pull-up bar hangs from ceiling stems, cable machines get a
     pulley block feeding the cable, dip bars get base feet and a
     tube end-cap at each grip. Lines default to BEHIND the body; a
     pushdown bar draws in front (the hands work in front of the torso)
     while its cable stays behind, naturally occluded by the figure. */
  const viewTop = Number((demo.viewBox ?? "-8 -14 116 224").split(/\s+/)[1]);
  const { behind: barBehind, front: barFront } = resolveProp(demo, e, pose, {
    frameY: viewTop,
    floorY: demo.groundY ?? 220,
  });

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

  // Free scene furniture (pads, a rope anchor) behind the body — the
  // front/back views gained this with the batch-11 frontal-plane demos.
  const scene = demo.scene?.(e, pose) ?? "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${demo.viewBox ?? (demo.view === "anterior" ? "-8 -14 116 224" : "-12 -14 124 244")}" role="img">` +
    shadow +
    scene +
    barBehind +
    glow +
    caps +
    polys +
    extras +
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
  /* A foot rides its shank unless the pose moves it on its own (the
     seated calf raise is the one that does — the ankle joint). */
  const opsFor = (group: GroupName): Op[] =>
    pose[group] ??
    (group === "footL"
      ? pose.shankL
      : group === "footR"
        ? pose.shankR
        : undefined) ??
    [];
  const body = SIDE_PIECES.map((piece) => {
    const posed = opsFor(piece.group);
    // A far limb's depth offset is a fact about the camera, so it lands
    // AFTER the pose: baked in, it rode the limb's rotation and put the
    // far arm in front of the near one at the top of a curl.
    const ops: Op[] = piece.depthShift
      ? [
          ...posed,
          {
            kind: "translate",
            dx: piece.depthShift[0],
            dy: piece.depthShift[1],
          },
        ]
      : posed;
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
    // Underlay in the SEAM tone: shows through the facet gaps as a
    // shadowed groove, and keeps overlapped pieces below fully
    // occluded (it is opaque, like the stage fill it replaced).
    return (
      `<polygon points="${P(outline)}" fill="${SEAM}"/>` +
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
          // A far piece's tint sits in shadow too (×FAR_TINT), so the
          // second arm reads as depth rather than as a second highlight.
          const op = f.level
            ? ` fill-opacity="${(tintOpacity(f.level) * (piece.far ? FAR_TINT : 1)).toFixed(3)}"`
            : "";
          return `<polygon points="${P(f.pts)}" fill="${fill}"${op}/>`;
        })
        .join("")
    );
  }).join("");

  /* Joint caps, the same recipe the front view uses: a body-grey disc at
     each MOVING joint, painted BEHIND the pieces so it shows only in the
     wedge a rotation opens and nowhere else. The profile is built from
     overlapping slabs, so it needs them at fewer joints than the facet
     mosaic does — but a curl swings the forearm ~120 degrees about a
     pivot on the arm's centre line, and past ~60 the far corner of the
     forearm's outline clears the upper arm and the elbow opens a notch.
     Emitted only where the group actually rotates, so a resting figure
     keeps its clean seams. */
  const sideTurn = (ops?: Op[]) =>
    (ops ?? []).reduce(
      (sum, o) => sum + (o.kind === "rotate" ? Math.abs(o.deg) : 0),
      0
    );
  const capAt = (group: GroupName, anchor: Pt, r: number, shift?: Pt) => {
    const ops = opsFor(group);
    const turn = sideTurn(ops);
    if (turn < 12) return "";
    const [x, y] = applyToPoint(anchor, ops ?? []);
    const cx = x + (shift?.[0] ?? 0);
    const cy = y + (shift?.[1] ?? 0);
    /* Kept UNDER the limb's half-depth (the upper arm is 9.5 deep, so
       4.75) or the disc pokes out past the silhouette at the elbow and
       reads as a bubble rather than as the joint. */
    const rr = r + (1.2 * Math.min(turn, 150)) / 150;
    return `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${rr.toFixed(2)}" fill="${BODY}"/>`;
  };
  const jointCaps =
    capAt("upperArmR", SIDE_ANCHORS.shoulder, 3.0, FAR_ARM_SHIFT) +
    capAt("foreArmR", SIDE_ANCHORS.elbow, 2.8, FAR_ARM_SHIFT) +
    capAt("shankR", SIDE_ANCHORS.knee, 3.4) +
    capAt("shankL", SIDE_ANCHORS.knee, 3.4) +
    capAt("footR", SIDE_ANCHORS.ankle, 2.6) +
    capAt("footL", SIDE_ANCHORS.ankle, 2.6) +
    capAt("upperArmL", SIDE_ANCHORS.shoulder, 3.0) +
    capAt("foreArmL", SIDE_ANCHORS.elbow, 2.8);

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

  /* Held gear (profile barbell, rope) draws OVER the body — the hands
     work in front of the torso, so a behind-the-body prop would vanish
     into it. Machine frames stay behind. */
  const viewTop = Number(
    (demo.viewBox ?? "-12 -14 124 244").split(/\s+/)[1] as string
  );
  const prop = resolveProp(demo, e, pose, {
    frameY: viewTop,
    floorY: demo.groundY ?? 204,
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${demo.viewBox ?? "-8 -14 116 224"}" role="img">` +
    shadow +
    scene +
    prop.behind +
    glow +
    jointCaps +
    body +
    prop.front +
    `</svg>`
  );
}
