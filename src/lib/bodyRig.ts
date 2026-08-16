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
 * Motion language:
 *  - arms rotate about the measured shoulder/elbow pivots (in-plane);
 *  - CAMERA follows the movement's plane: sagittal movements (squats,
 *    hinges, presses off a bench, curls) get the SIDE rig, where knees,
 *    hips and bar path articulate for real; frontal-plane movements
 *    (lateral raise, pull-up flare) and symmetric placard views stay
 *    front/back. Vertical-compression squat fakes on the frontal figure
 *    were tried and retired (owner feedback 2026-08-15);
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
/* MOSAIC style (2026-08-15 owner decision, pass 10): distinct muscle
 * blocks separated by dark stage channels are the figure's identity —
 * a flesh-weld "one continuous form" direction was tried (passes 5-9)
 * and reverted as blobby. Definition comes from the block shapes, the
 * dark channels between them, and a small deterministic lightness step
 * per facet (faceted sculpt shading). Joints bridge with limb-width
 * SLEEVES, never ball caps. */
/** Stage colour behind the demo card — the side pieces' underlay, so
 *  facet gaps read as the same dark channels as the front/back mosaic
 *  and overlapping pieces occlude what's behind them. */
const STAGE = "#111113";

/** Shift a #rrggbb colour's lightness by delta (additive per channel). */
function tone(hex: string, delta: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + delta));
  const r = c(n >> 16);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Facet shading steps — subtle, cycling deterministically so adjacent
 *  facets of one muscle read as planes of a single sculpted mass. Kept
 *  at the quiet amplitude: in the mosaic style the stage-black channels
 *  do the separating, and louder steps read as patchwork. */
const SHADE_STEPS = [-7, 3, -3, 6, 0, -5, 4] as const;
const shadeFor = (seed: number) => SHADE_STEPS[seed % SHADE_STEPS.length];

/**
 * Closed path with rounded corners (owner pass 2: "why are the knees
 * made of rectangles?"). Every hard vertex is cut with a quadratic —
 * entry/exit points sit `r` along each edge (clamped to 40% of the
 * shorter edge so small facets don't collapse) and the vertex becomes
 * the control point. Polygon corners read as bone/flesh, not boxes.
 */
function roundedPath(pts: Pt[], r: number): string {
  const n = pts.length;
  if (n < 3) return "";
  const seg: string[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const din = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) || 1;
    const dout = Math.hypot(next[0] - cur[0], next[1] - cur[1]) || 1;
    const rIn = Math.min(r, din * 0.4);
    const rOut = Math.min(r, dout * 0.4);
    const a: Pt = [
      cur[0] - ((cur[0] - prev[0]) / din) * rIn,
      cur[1] - ((cur[1] - prev[1]) / din) * rIn,
    ];
    const b: Pt = [
      cur[0] + ((next[0] - cur[0]) / dout) * rOut,
      cur[1] + ((next[1] - cur[1]) / dout) * rOut,
    ];
    seg.push(
      `${i === 0 ? `M${a[0].toFixed(2)},${a[1].toFixed(2)}` : `L${a[0].toFixed(2)},${a[1].toFixed(2)}`} Q${cur[0].toFixed(2)},${cur[1].toFixed(2)} ${b[0].toFixed(2)},${b[1].toFixed(2)}`
    );
  }
  return seg.join(" ") + " Z";
}

/** Rounded-corner shape element. */
function shape(pts: Pt[], r: number, fill: string, extra = ""): string {
  return `<path d="${roundedPath(pts, r)}" fill="${fill}"${extra}/>`;
}
/** Far-side limbs in the profile rig — ~12% darker so overlaps read. */
const BODY_FAR = "#8F969D";

/* ── Measured joint anchors (viewBox 0 0 100 200) ─────────────── */

/* Joint anchors are MEASURED FROM THE ART (2026-08-16 alignment pass),
 * not eyeballed: each elbow is the midpoint between the upper-arm
 * mass's lower end and the forearm mass's upper end, and each wrist is
 * the forearm mass's far end — both taken from the vendored polygons'
 * principal axis. The previous hand anchors sat ~5 units INBOARD of
 * where the forearm art actually ends (measured: ANT L 5.4, ANT R 6.0,
 * POST L 3.9, POST R 3.8), which is what put the grey hand mitt and
 * its bridging sleeve beside the purple muscle instead of on it — and
 * at big rotations (pull-up W-flare, pulldown) swung art and anchor
 * apart into the "doubled, misaligned arm" the owner reported. The
 * shoulder stays the JOINT centre inside the deltoid cap, which
 * legitimately sits above the biceps/triceps mass. */
const ANT = {
  shoulderL: [24, 48] as Pt,
  shoulderR: [76, 48] as Pt,
  elbowL: [18.8, 71.7] as Pt,
  elbowR: [80.3, 71.4] as Pt,
  handL: [5.1, 97.7] as Pt,
  handR: [94.7, 98.2] as Pt,
  hipY: 96,
  kneeL: [32, 148] as Pt,
  kneeR: [68, 148] as Pt,
  ankleY: 196,
};
const POST = {
  shoulderL: [23, 46] as Pt,
  shoulderR: [77, 46] as Pt,
  elbowL: [18, 78.7] as Pt,
  elbowR: [81.9, 79] as Pt,
  handL: [5.8, 103.8] as Pt,
  handR: [94.2, 103.9] as Pt,
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

/** Side-view back-squat bar seat: on the traps, just behind the neck
 *  base ([48,32]) and above the shoulder joint ([47.5,45]). Standing it
 *  sits ~3 units behind the ankle plumb line; at the bottom the torso
 *  hinge carries it forward to land exactly over mid-foot. */
const SQUAT_BAR: Pt = [43.5, 41];

/** Midfoot — the balance line every barbell reference measures a bar
 *  path against. The profile foot runs x 40.3 (heel) to 65.5 (toe), so
 *  its middle is ~52.9; the ankle anchor ([46.6]) is NOT midfoot. */
const MIDFOOT_X = 52.9;

/** Ball-of-foot pivot for the side calf raise: on the step edge, just
 *  behind the toes ([65,199.6] tip, sole ~203). The heel ([42,203])
 *  cantilevers off the step's back edge. */
const CALF_BALL: Pt = [58.5, 202.5];

/* Side-view arm segment lengths. */
const SIDE_UPPER_LEN = Math.hypot(
  SIDE_ANCHORS.elbow[0] - SIDE_ANCHORS.shoulder[0],
  SIDE_ANCHORS.elbow[1] - SIDE_ANCHORS.shoulder[1]
);
const SIDE_FORE_LEN = Math.hypot(
  SIDE_ANCHORS.hand[0] - SIDE_ANCHORS.elbow[0],
  SIDE_ANCHORS.hand[1] - SIDE_ANCHORS.elbow[1]
);

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
/** C1 soft clamp: returns x until `k` short of the limit, then eases in
 *  exponentially, asymptoting AT it. Slope is 1 on both sides of the
 *  handover, so unlike Math.min there is no derivative step. */
function softCap(x: number, hi: number, k: number): number {
  return x < hi - k ? x : hi - k * Math.exp(-(x - hi + k) / k);
}
function softFloor(x: number, lo: number, k: number): number {
  return x > lo + k ? x : lo + k * Math.exp((x - lo - k) / k);
}

function solveElbow(S: Pt, H: Pt, L1: number, L2: number, out: 1 | -1): Pt {
  let dx = H[0] - S[0];
  let dy = H[1] - S[1];
  let d = Math.hypot(dx, dy);
  const max = (L1 + L2) * 0.999;
  const min = Math.abs(L1 - L2) * 1.001;
  /* SMOOTHNESS (owner feedback 2026-08-16, "non smooth movement").
   * The elbow offset is h = sqrt(L1² − a²), which goes to zero with
   * INFINITE slope as the reach approaches full extension — so a hard
   * Math.min clamp made the elbow snap the instant a hand crossed the
   * reachable boundary. Measured as frame-to-frame jerk it was
   * catastrophic exactly where each demo straightens the arm: pull-up
   * dead hang (ratio 47729), pulldown overhead start (122), press
   * lockout (425); every other demo sat under 8. Easing into the limit
   * makes the residual sqrt argument decay exponentially rather than
   * linearly, which cancels the singularity — the arm still reads
   * straight at the extremes, it just stops popping to get there. */
  const K = (L1 + L2) * 0.035;
  const clamped = softFloor(softCap(d, max, K), min, K);
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
 * reads amputee-ish in a full-body demo). Front-view feet (owner pass
 * 5: "the feet look like they're on backwards"): the old wedges swept
 * their sharp toe tip INWARD-down, reading heel-first. A front-on foot
 * is a near-symmetric block under the ankle — narrow at the ankle,
 * flaring evenly to a flat toe line, tipped a couple of units OUTWARD
 * (lateral) the way a natural stance splays. Grouped with the shanks
 * so they inherit leg transforms. */
const ANTERIOR_FEET: { group: GroupName; points: Pt[] }[] = [
  {
    group: "shankL",
    points: [
      [22, 194],
      [29, 194],
      [30, 199],
      [29.5, 203],
      [18.5, 203],
      [18, 199.5],
    ],
  },
  {
    group: "shankR",
    points: [
      [71, 194],
      [78, 194],
      [82, 199.5],
      [81.5, 203],
      [70.5, 203],
      [70, 199],
    ],
  },
];

/* Posterior heels: the back-view art tapers the soleus to a NEEDLE at
 * y≈220, so hanging figures (pull-ups) ended in icicle points. From
 * behind a foot is mostly heel — a compact block capping each soleus
 * tip, riding the shank group. */
const POSTERIOR_FEET: { group: GroupName; points: Pt[] }[] = [
  /* Owner pass 6 ("feet look weird"): the first heel blocks were wide
   * cubes floating below the calf taper. Narrower, tapered, and
   * overlapping the soleus higher so heel and calf read as one leg. */
  {
    group: "shankL",
    points: [
      [26, 210],
      [34, 210],
      [35, 218],
      [33.6, 222],
      [26.4, 222],
      [25, 218],
    ],
  },
  {
    group: "shankR",
    points: [
      [66, 210],
      [74, 210],
      [75, 218],
      [73.6, 222],
      [66.4, 222],
      [65, 218],
    ],
  },
];

/* The vendored posterior art leaves the thoraco-lumbar junction as a
 * deep V of background between the lower-back blades, tapering into
 * the sacrum notch between the glute tops — far wider than any mosaic
 * seam (~7 units at the top). The anatomy plates (operator references,
 * 2026-08-15) show exactly that region as the flat thoraco-lumbar
 * FASCIA diamond + sacrum. Same missing-part precedent as the feet,
 * heels and hands: one darker body-toned wedge riding the torso,
 * painted UNDER the muscle blocks so only the void fills — every
 * normal seam stays a seam. */
const POSTERIOR_SACRUM: { group: GroupName; points: Pt[] } = {
  group: "torso",
  points: [
    [43.5, 84],
    [56.5, 84],
    [55, 98],
    [51.2, 112],
    [48.8, 112],
    [45, 98],
  ],
};

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
  equip?:
    | "fixed-bar"
    | "cable-bar"
    | "dip-bars"
    | "plate-end"
    /** Dumbbell seen END-ON — its axis points at the camera, which is
     *  what a side view of a lying press shows (the bells sit left and
     *  right of the chest). Drawn as a HEXAGON: the hex dumbbell is the
     *  gym's default, and against the barbell's round plate the flat
     *  faces are what let a glance tell the two implements apart. */
    | "db-end"
    /** Dumbbell seen in PROFILE — its axis runs fore-aft, which is what
     *  a NEUTRAL grip (palms facing the legs) shows from the side: two
     *  bells with the handle between them. */
    | "db-side";
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

/** PLANTED-FOOT re-registration (2026-08-16 contact audit). A standing
 *  lift's foot is on the floor: it does not slide, and it certainly
 *  does not sink through it. The squat and deadlift get this free by
 *  building the leg ANKLE-UP, but the row and RDL build it hip-down —
 *  the knee ops displace the ankle, and the balance LEAN then pivots
 *  about where the ankle USED to be. Measured: the RDL's planted
 *  ankle travelled 3.0 units (down, into the floor) across the rep,
 *  and the row's whole figure sat 3.2 below the ground line.
 *
 *  Rather than rebuild those chains (and lose their tuned look), this
 *  measures where the posed ankle actually landed and returns the
 *  rigid translation that snaps it back — applied to EVERY group, so
 *  it re-registers the whole figure about its contact point instead
 *  of detaching the legs. */
function plantFoot(shankOps: Op[]): Op {
  const a = applyToPoint(SIDE_ANCHORS.ankle, shankOps);
  return {
    kind: "translate",
    dx: SIDE_ANCHORS.ankle[0] - a[0],
    dy: SIDE_ANCHORS.ankle[1] - a[1],
  };
}

const lerp = (a: number, b: number, e: number) => a + (b - a) * e;

/** Shared side-squat lower-body chain (barbell + bodyweight variants):
 *  planted-ankle build exactly like the deadlift — shin about the
 *  ankle (8° cap, heel stays visually planted), thigh about the moved
 *  knee (hips back + down), torso about the moved hip, cervical
 *  counter-rotation keeping the gaze near-forward. The hinge is the
 *  variant's knob: the barbell squat leans 35° to keep the trap-riding
 *  bar over mid-foot; the bodyweight squat stays prouder (25°) because
 *  the forward arm reach carries the counterbalance instead. */
function sideStanceChain(
  e: number,
  opts: { shin: number; thighRel: number; hinge: number; headCounter?: number }
) {
  const shin = lerp(0, opts.shin, e);
  const thighRel = lerp(0, opts.thighRel, e);
  const hinge = lerp(0, opts.hinge, e);
  const legOps: Op[] = [
    { kind: "rotate", deg: shin, pivot: SIDE_ANCHORS.ankle },
  ];
  const thighOps: Op[] = [
    { kind: "rotate", deg: thighRel, pivot: SIDE_ANCHORS.knee },
    ...legOps,
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
  const headOps: Op[] = [
    {
      kind: "rotate",
      deg: -hinge * (opts.headCounter ?? 0.6),
      pivot: SIDE_ANCHORS.neck,
    },
    ...torsoOps,
  ];
  return { legOps, thighOps, torsoOps, headOps };
}

function sideSquatChain(e: number, hinge: number) {
  const shin = lerp(0, 8, e);
  const thighRel = lerp(0, -62, e);
  const legOps: Op[] = [
    { kind: "rotate", deg: shin, pivot: SIDE_ANCHORS.ankle },
  ];
  const thighOps: Op[] = [
    { kind: "rotate", deg: thighRel, pivot: SIDE_ANCHORS.knee },
    ...legOps,
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
  const headOps: Op[] = [
    { kind: "rotate", deg: -hinge * 0.6, pivot: SIDE_ANCHORS.neck },
    ...torsoOps,
  ];
  return { legOps, thighOps, torsoOps, headOps };
}

export const BODY_DEMOS: Record<string, BodyDemo> = {
  squat: {
    /* Side-view back squat (owner feedback 2026-08-15: "if this is the
     * animation squatting, it should be from a side angle not a
     * front"). The front view could only FAKE depth — scaleY-compressed
     * thighs, hanging two-section arms, blocky knees, and a back-bar
     * whose end plates floated beside the shoulders (all four called
     * out on device). Profile shows the real mechanism instead: hips
     * travel back + down, knees forward over planted feet, torso
     * inclining as depth builds. Ankle-up chain exactly like the
     * deadlift: shin about the planted ankle (8° max — heel stays
     * visually planted), thigh about the moved knee, torso about the
     * moved hip. Bottom lands the thigh just above parallel with the
     * bar (on the traps) plumb over mid-foot — the balance rule.
     *
     * The bar rests ON THE TRAPS and rides the torso — structural, not
     * held — rendered end-on like every side barbell. The hands grip
     * behind the shoulders: solved ONCE at rest (bar and arm both ride
     * torsoOps, so grip registration is constant through the rep by
     * construction; no per-frame IK needed). */
    view: "side",
    equip: "plate-end",
    plateR: 10,
    concentricTo: 0,
    viewBox: "-24 -2 132 212",
    groundY: 204,
    shadowCx: 42,
    shadowRx: 34,
    tint: { quadriceps: "primary", gluteal: "secondary", abs: "secondary" },
    pose: (e) => {
      const hinge = lerp(0, 35, e); // proud chest vs the deadlift's 70°
      const { legOps, thighOps, torsoOps, headOps } = sideSquatChain(e, hinge);
      /* High-bar grip, FORESHORTENED. The hand sits ~6 units from the
       * shoulder, so rigid 25+29 segments can only reach it via a
       * near-total 2D fold — rendered, that fold fans the arm pieces
       * into a stack of slats down the torso (measured, first cut of
       * this rebuild). In reality the elbow flares out-of-plane
       * (abducted + behind), so in profile BOTH segments project
       * short. scaleAxis is the rig's standing cheat for exactly this
       * (see the Op union), same as the curl used. The elbow tucks
       * down-back of the shoulder; the short forearm runs up to the
       * bar. Solved once at rest — bar and arm both ride torsoOps, so
       * grip registration is constant through the rep by construction. */
      const S = SIDE_ANCHORS.shoulder;
      const E0 = SIDE_ANCHORS.elbow;
      const H0 = SIDE_ANCHORS.hand;
      const EV: Pt = [38.5, 56.5]; // visible (projected) elbow
      const ua = angleBetween(
        [E0[0] - S[0], E0[1] - S[1]],
        [EV[0] - S[0], EV[1] - S[1]]
      );
      const ku = Math.hypot(EV[0] - S[0], EV[1] - S[1]) / SIDE_UPPER_LEN;
      const fa = angleBetween(
        [H0[0] - E0[0], H0[1] - E0[1]],
        [SQUAT_BAR[0] - EV[0], SQUAT_BAR[1] - EV[1]]
      );
      const kf =
        Math.hypot(SQUAT_BAR[0] - EV[0], SQUAT_BAR[1] - EV[1]) / SIDE_FORE_LEN;
      /* scaleAxis's axis is REST-VERTICAL rotated by `deg`, so each
       * segment's rest tilt from vertical must ride along or the
       * anchor slides off its target as the tilt grows (the forearm
       * now carries ~10 deg forward at rest — reference-carry pass —
       * which is what broke the bare-fa version). */
      const tiltOf = (a: Pt, b: Pt) =>
        (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
      const upperOps: Op[] = [
        { kind: "rotate", deg: ua, pivot: S },
        { kind: "scaleAxis", k: ku, deg: ua - tiltOf(S, E0), pivot: S },
      ];
      // The forearm shapes about its own rest elbow, then translates so
      // its elbow end lands exactly on the foreshortened upper's tip —
      // composing the upper's scaleAxis instead would re-squash it.
      const foreOps: Op[] = [
        { kind: "rotate", deg: fa, pivot: E0 },
        { kind: "scaleAxis", k: kf, deg: fa - tiltOf(E0, H0), pivot: E0 },
        { kind: "translate", dx: EV[0] - E0[0], dy: EV[1] - E0[1] },
      ];
      return {
        head: headOps,
        torso: torsoOps,
        pelvis: torsoOps,
        thighL: thighOps,
        thighR: thighOps,
        shankL: legOps,
        shankR: legOps,
        upperArmL: [...upperOps, ...torsoOps],
        foreArmL: [...foreOps, ...torsoOps],
        handL: [...foreOps, ...torsoOps],
      };
    },
    bar: (_e, pose) => {
      const b = applyToPoint(SQUAT_BAR, pose.torso ?? []);
      return [b, b];
    },
  },

  "bodyweight-squat": {
    /* Bar-less squat variant (owner call 2026-08-15, alias hygiene):
     * front-squat / goblet-squat / bodyweight-squat previously aliased
     * the barbell squat and inherited its back bar — a prop-semantics
     * mismatch. Same side-view chain as the barbell squat, but the
     * arms REACH FORWARD as the counterbalance (the standard
     * bodyweight-squat depiction, and per the no-held-weights rule the
     * honest shared read for the goblet/front-rack grips too): the
     * reach rises toward horizontal as depth builds, which is what
     * lets the torso stay prouder (25°) than under the bar. */
    view: "side",
    concentricTo: 0,
    viewBox: "-24 -2 132 212",
    groundY: 204,
    shadowCx: 42,
    shadowRx: 34,
    tint: { quadriceps: "primary", gluteal: "secondary", abs: "secondary" },
    pose: (e) => {
      const hinge = lerp(0, 25, e);
      const { legOps, thighOps, torsoOps, headOps } = sideSquatChain(e, hinge);
      // Counterbalance reach: the whole arm sweeps forward-up about
      // the shoulder; a constant soft elbow keeps it from reading
      // hyper-straight. The torso hinge composes AFTER (arms ride the
      // shoulder), so the world angle nets out just under horizontal.
      const reach = lerp(4, 100, e);
      const upperOps: Op[] = [
        { kind: "rotate", deg: -reach, pivot: SIDE_ANCHORS.shoulder },
      ];
      const foreOps: Op[] = [
        { kind: "rotate", deg: 12, pivot: SIDE_ANCHORS.elbow },
        ...upperOps,
      ];
      return {
        head: headOps,
        torso: torsoOps,
        pelvis: torsoOps,
        thighL: thighOps,
        thighR: thighOps,
        shankL: legOps,
        shankR: legOps,
        upperArmL: [...upperOps, ...torsoOps],
        foreArmL: [...foreOps, ...torsoOps],
        handL: [...foreOps, ...torsoOps],
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
      const drift = lerp(0, 8, e); // elbows ease forward at the top
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
      const flex = lerp(108, 10, e); // folded at the chest → lockout
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
       * The elbows flare outward as the body sinks. */
      const dy = lerp(0, 13, e);
      const L = aimArm(
        { S: ANT.shoulderL, E: ANT.elbowL, H: ANT.handL },
        solveElbow(
          [ANT.shoulderL[0], ANT.shoulderL[1] + dy],
          ANT.handL,
          ANT_UPPER_LEN,
          ANT_FORE_LEN,
          -1
        ),
        ANT.handL,
        dy
      );
      const R = aimArm(
        { S: ANT.shoulderR, E: ANT.elbowR, H: ANT.handR },
        solveElbow(
          [ANT.shoulderR[0], ANT.shoulderR[1] + dy],
          ANT.handR,
          ANT_UPPER_LEN,
          ANT_FORE_LEN,
          1
        ),
        ANT.handR,
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
    bar: () => [ANT.handL, ANT.handR],
  },

  deadlift: {
    view: "side",
    equip: "plate-end",
    plateR: 16,
    concentricTo: 0,
    /* Camera width sets on-screen scale (the card is a fixed 190px
     * wide with auto height, so scale = 190/viewBox-width). This
     * carried 77 units of unused width and rendered its figure 210px
     * tall where most of the set sits at 300-360 — measurably the
     * smallest person in the library. Tightened to the content
     * (x 1.3..110.5) plus margin; the deep-hinge hips still clear the
     * left edge. */
    viewBox: "-10 -6 131 218",
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
      /* Thigh drop 52° (was 64): the deeper drop threw the hips so far
       * back the glutes crossed x=0 while the feet stayed planted —
       * the bum-to-heel gap read ~double a real pull's and the legs
       * looked "too far forward". The shoulder height lost by the
       * higher hips is recovered with a deeper torso hinge (75°),
       * which also matches reference bottom positions: hips above
       * knees, back closer to horizontal. */
      const thighRel = lerp(0, -52, e); // about the knee → hips back+down
      const hinge = lerp(0, 75, e); // torso about the hip
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
      /* Pelvis rotates LESS than the spine in a hinge (lumbopelvic
       * rhythm) — full-rate rotation shelved the glutes out past the
       * back line (owner: "why does the glutes overhang?"). ~72% keeps
       * the glute mass tucked into the hip line while still tilting. */
      const pelvisOps: Op[] = [
        { kind: "rotate", deg: hinge * 0.72, pivot: SIDE_ANCHORS.hip },
        shift,
      ];
      /* Straight arms hang from the hinged shoulder to a bar pinned
       * OVER MIDFOOT (2026-08-16 bar-path audit). The old version
       * offset the hand from the SHOULDER, so as the torso hinged the
       * shoulder dragged the bar forward with it — measured, the bar
       * drifted 11.6 units forward through the pull and sat 17-20
       * units in front of midfoot at the bottom, out past the toes.
       * Every reference is unanimous and specific here: the bar
       * travels a straight VERTICAL line over the middle of the foot,
       * an inch off the shin, with the shoulders slightly in FRONT of
       * it (which now falls out of the geometry rather than being
       * posed). The arms are hooks — never bent — so the hand is
       * simply where a straight arm from the posed shoulder meets the
       * midfoot line, and the bar's height follows the hinge. */
      const S = applyToPoint(SIDE_ANCHORS.shoulder, torsoOps);
      const ARM = SIDE_UPPER_LEN + SIDE_FORE_LEN;
      const dxBar = MIDFOOT_X - S[0];
      const hFinal: Pt = [
        MIDFOOT_X,
        S[1] + Math.sqrt(Math.max(ARM * ARM - dxBar * dxBar, 1)),
      ];
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
      /* Cervical rhythm (same fix-class as the pelvis): the head counters
       * ~40% of the hinge about the POSED neck point, so the gaze stays
       * forward-down instead of burying the face in the floor. */
      const neckPosed = applyToPoint([48, 32], torsoOps);
      const headOps: Op[] = [
        ...torsoOps,
        { kind: "rotate", deg: -hinge * 0.4, pivot: neckPosed },
      ];
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
    // Hanging scene: bar overhead, body travels ~25 units, floor just
    // below the dangling heels at the dead hang.
    viewBox: "-20 -24 140 254",
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
      const dy = lerp(1, -24, e); // dead hang → chin over the bar
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
    scene: () =>
      `<rect x="27" y="106" width="46" height="7" rx="2.5" fill="${GEAR_DARK}" stroke="#565760" stroke-width="0.8"/>` +
      `<line x1="27" y1="106.6" x2="73" y2="106.6" stroke="${GEAR}" stroke-width="1.2"/>` +
      `<line x1="50" y1="113" x2="50" y2="219" stroke="${GEAR_DARK}" stroke-width="2.6"/>` +
      `<line x1="38" y1="219" x2="62" y2="219" stroke="${GEAR_DARK}" stroke-width="2.4" stroke-linecap="round"/>`,
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
       * RIGID BAR (2026-08-16 bar-path audit): the grip x is CONSTANT.
       * It used to lerp outward (12.2→6 and 87.8→94), which stretched
       * the drawn steel bar 13% mid-rep (95.6→108 units) — a bar that
       * grows as you pull it. Grip width is set once, at ~1.4×
       * shoulder width (shoulders sit at x 23/77), the standard
       * pulldown grip.
       *
       * The finish is the UPPER CHEST, not the shoulder line: with the
       * grip pinned, y=52 is what puts the solved elbow at (19.6,
       * 78.9) — driven DOWN and level with the torso, which is the
       * cue every reference gives ("elbows toward the floor, in line
       * with the torso"; bar to upper chest/collarbone). The old y=50
       * finish sat the bar at the shoulder line. */
      const GRIP_L = 12.2;
      const GRIP_R = 87.8;
      const hl: Pt = [GRIP_L, lerp(-14.5, 52, e)];
      const hr: Pt = [GRIP_R, lerp(-14.5, 52, e)];
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
    // Rigid: constant length, only the height travels.
    bar: (e) => {
      const y = lerp(-14.5, 52, e);
      return [
        [2.2, y],
        [97.8, y],
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
      return {
        upperArmL: [{ kind: "rotate", deg: arm, pivot: ANT.shoulderL }],
        foreArmL: [
          { kind: "rotate", deg: -10, pivot: ANT.elbowL },
          { kind: "rotate", deg: arm, pivot: ANT.shoulderL },
        ],
        upperArmR: [{ kind: "rotate", deg: -arm, pivot: ANT.shoulderR }],
        foreArmR: [
          { kind: "rotate", deg: 10, pivot: ANT.elbowR },
          { kind: "rotate", deg: -arm, pivot: ANT.shoulderR },
        ],
      };
    },
  },

  "calf-raise": {
    /* Side-view calf raise (camera-plane audit follow-up: the front
     * view's rise was "nearly imperceptible" — Gate-0 — because a
     * frontal figure can't show plantarflexion). Profile shows the
     * whole story: forefoot on a step, heel hanging off the back edge,
     * and the FOOT rotates about the ball — heel-drop stretch at the
     * bottom, high heel at the top — while the shin stays vertical and
     * the body rides the ankle's arc (up and slightly forward, onto
     * the ball — the real path). This is what the foot/shank piece
     * split exists for; every other demo's foot still follows its
     * shank via the renderer's attachment default. */
    view: "side",
    concentricTo: 1,
    // Content measures x -4..112, y -4.2..209 (the step and floor line
    // reach wider than the body) — the old window clipped the crown of
    // the head at the top of the rise and the floor line on the right.
    viewBox: "-10 -8 128 224",
    groundY: 209,
    shadowCx: 54,
    shadowRx: 24,
    tint: { calves: "primary" },
    pose: (e) => {
      const theta = lerp(-7, 20, e); // heel-drop stretch → top
      const footOps: Op[] = [{ kind: "rotate", deg: theta, pivot: CALF_BALL }];
      const a = applyToPoint(SIDE_ANCHORS.ankle, footOps);
      const ride: Op[] = [
        {
          kind: "translate",
          dx: a[0] - SIDE_ANCHORS.ankle[0],
          dy: a[1] - SIDE_ANCHORS.ankle[1],
        },
      ];
      return {
        head: ride,
        torso: ride,
        pelvis: ride,
        upperArmL: ride,
        foreArmL: ride,
        handL: ride,
        thighL: ride,
        thighR: ride,
        shankL: ride,
        shankR: ride,
        footL: footOps,
        footR: footOps,
      };
    },
    // The step: a low block under the forefoot, heel cantilevered off
    // its back edge; floor line below. Structural scenery.
    scene: () =>
      `<rect x="46" y="202.6" width="27" height="6.4" rx="1" fill="${GEAR_DARK}" stroke="#565760" stroke-width="0.8"/>` +
      `<line x1="46" y1="202.6" x2="73" y2="202.6" stroke="${GEAR}" stroke-width="1.4"/>` +
      `<line x1="-4" y1="209" x2="112" y2="209" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
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
      const H: Pt = [S[0] + lerp(24, 50, e), S[1] + lerp(22, 8, e)];
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
      /* Rack upright at the head end: side-on the pair overlaps into
       * one post, topped with a J-hook cup facing the lifter — the
       * thing the bar racks into. Behind the bench so the figure and
       * bar stay in front. */
      `<line x1="-59" y1="171" x2="-59" y2="66" stroke="${GEAR_DARK}" stroke-width="3"/>` +
      `<line x1="-59" y1="67" x2="-51" y2="67" stroke="${GEAR_DARK}" stroke-width="2.4"/>` +
      `<line x1="-51.6" y1="67" x2="-51.6" y2="62" stroke="${GEAR_DARK}" stroke-width="2"/>` +
      `<rect x="-64" y="109" width="136" height="7" rx="2.5" fill="${GEAR}"/>` +
      `<line x1="-50" y1="116" x2="-50" y2="170" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
      `<line x1="56" y1="116" x2="56" y2="170" stroke="${GEAR_DARK}" stroke-width="3.4"/>` +
      `<line x1="-58" y1="171" x2="118" y2="171" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },

  "barbell-row": {
    view: "side",
    equip: "plate-end",
    concentricTo: 1,
    // Camera (2026-08-16 framing audit): the head poked 13.9 above the
    // old top edge and was sliced off. Content measures y 24.1..203.8,
    // so the window starts at 16. WIDTH is unchanged at 172 because
    // width is the binding dimension when the card letterboxes — the
    // figure keeps exactly its previous scale, it just stops clipping.
    // Tightened with the same scale audit as the deadlift: content is
    // x 28.8..115.4, so 172 units of width rendered the figure at
    // 198px — the smallest in the set.
    viewBox: "7 18 131 192",
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
      // Top of pull raised 26 → 21 below the shoulder (owner-loop
      // pass 9): at 26 the folded arm hid against the torso and the
      // row's defining checkpoint — the elbow driving past the back
      // line — barely registered.
      const hFinal: Pt = [S[0] + 1, lerp(S[1] + 50, S[1] + 21, e)];
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
      const legRaw: Op[] = [
        { kind: "rotate", deg: KNEE, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      const shankRaw: Op[] = [
        { kind: "rotate", deg: -KNEE, pivot: SIDE_ANCHORS.knee },
        { kind: "rotate", deg: KNEE, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      // Foot on the floor: re-register the whole figure about it.
      const P = plantFoot(shankRaw);
      const leg: Op[] = [...legRaw, P];
      const shank: Op[] = [...shankRaw, P];
      return {
        // Cervical rhythm — the head counters ~40% of the hinge about the
        // posed neck so the gaze stays forward, mirroring the pelvis damp.
        head: [
          T,
          LEAN,
          {
            kind: "rotate",
            deg: -T.deg * 0.4,
            pivot: applyToPoint([48, 32], [T, LEAN]),
          },
          P,
        ],
        torso: [T, LEAN, P],
        // Lumbopelvic rhythm: the pelvis tilts ~72% of the spine's hinge
        // (full-rate shelved the glutes out past the back line).
        pelvis: [
          { kind: "rotate", deg: T.deg * 0.72, pivot: T.pivot },
          LEAN,
          P,
        ],
        thighL: leg,
        thighR: leg,
        shankL: shank,
        shankR: shank,
        upperArmL: [...arm.upper, T, LEAN, P],
        foreArmL: [...arm.fore, T, LEAN, P],
        handL: [...arm.fore, T, LEAN, P],
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
    /* Camera must fit BOTH extremes: standing (full height) and hinged
     * (head reaching forward) — locked, so no framing jumps mid-rep.
     * Width tightened to the measured content (x 21.6..118.4) by the
     * scale audit; it was rendering the figure 226px tall against the
     * set's 300-360. */
    viewBox: "4 -6 131 216",
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
      const KNEE = 15; // constant in every frame — the RDL signature
      const LEAN = hipsBack(hinge); // balance rule: hips travel back
      const T: Op = { kind: "rotate", deg: hinge, pivot: SIDE_ANCHORS.hip };
      const unpose: Op[] = [
        { kind: "rotate", deg: -LEAN.deg, pivot: LEAN.pivot },
        { kind: "rotate", deg: -hinge, pivot: SIDE_ANCHORS.hip },
      ];
      /* The bar hugs the LEGS, not the shoulder's arc: a plumb hang
       * from the hinged shoulder swung the bar 23 units in front of
       * the thighs at depth (measured) — the classic stiff-arm form
       * error. The bar rides a fixed near-leg line (drifting back a
       * touch as the hips travel back) and hangs as low as a straight
       * arm reaches toward that line — the RDL's bar-slides-down-the-
       * thigh signature. */
      const S = applyToPoint(SIDE_ANCHORS.shoulder, [T, LEAN]);
      const BAR_X = lerp(56.5, 53.5, e);
      const armLen = SIDE_UPPER_LEN + SIDE_FORE_LEN;
      const drop = Math.sqrt(
        Math.max(armLen * armLen - (BAR_X - S[0]) ** 2, 100)
      );
      const hPre = applyToPoint([BAR_X, S[1] + drop], unpose);
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
      const legRaw: Op[] = [
        { kind: "rotate", deg: KNEE, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      const shankRaw: Op[] = [
        { kind: "rotate", deg: -KNEE, pivot: SIDE_ANCHORS.knee },
        { kind: "rotate", deg: KNEE, pivot: SIDE_ANCHORS.hip },
        LEAN,
      ];
      // Foot on the floor: re-register the whole figure about it.
      const P = plantFoot(shankRaw);
      const leg: Op[] = [...legRaw, P];
      const shank: Op[] = [...shankRaw, P];
      return {
        // Cervical rhythm — the head counters ~40% of the hinge about the
        // posed neck so the gaze stays forward, mirroring the pelvis damp.
        head: [
          T,
          LEAN,
          {
            kind: "rotate",
            deg: -T.deg * 0.4,
            pivot: applyToPoint([48, 32], [T, LEAN]),
          },
          P,
        ],
        torso: [T, LEAN, P],
        // Lumbopelvic rhythm: the pelvis tilts ~72% of the spine's hinge
        // (full-rate shelved the glutes out past the back line).
        pelvis: [
          { kind: "rotate", deg: T.deg * 0.72, pivot: T.pivot },
          LEAN,
          P,
        ],
        thighL: leg,
        thighR: leg,
        shankL: shank,
        shankR: shank,
        upperArmL: [...arm.upper, T, LEAN, P],
        foreArmL: [...arm.fore, T, LEAN, P],
        handL: [...arm.fore, T, LEAN, P],
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
      const TILT: Op = { kind: "rotate", deg: -13, pivot: PUSHUP_HAND };
      const beta = lerp(0, 9.5, e);
      const B: Op = { kind: "rotate", deg: beta, pivot: PUSHUP_TOE };
      const bodyOps: Op[] = [G, TILT, B];
      // Map the fixed hand plant back to standing space for the aim.
      const hPre = applyToPoint(PUSHUP_HAND, [
        { kind: "rotate", deg: -beta, pivot: PUSHUP_TOE },
        { kind: "rotate", deg: 13, pivot: PUSHUP_HAND },
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
      };
    },
    scene: () =>
      `<line x1="-70" y1="158.5" x2="120" y2="158.5" stroke="${GEAR_DARK}" stroke-width="1.6"/>`,
  },
};

/* ── Implement variants ──────────────────────────────────────────
 *
 * Owner call 2026-08-16 ("include them, we need them to be
 * accurate"): several exercises were ALIASED onto a canonical whose
 * demo draws an end-on BARBELL plate while the exercise uses another
 * implement — so a dumbbell bench press showed a barbell. Rather than
 * drop the alias (the alias-hygiene rule's remedy, which costs the
 * exercise its demo), each variant now gets its own entry.
 *
 * These SPREAD the canonical rather than copying its pose. The
 * movement genuinely is the same — only the implement differs — and
 * spreading means the pose can never drift from the canonical it is
 * derived from, which is this project's #1 recurring defect class
 * ("the tested copy does not prove the running copy"). A variant that
 * needs a different POSE, not just a different prop, gets a real entry
 * of its own instead. */
BODY_DEMOS["db-bench"] = {
  ...BODY_DEMOS["bench-press"],
  // Pressed dumbbells sit with their axis ACROSS the body, so a side
  // camera looks straight down the bar of each one: you see a single
  // bell end-on, not the whole dumbbell.
  equip: "db-end",
  plateR: 7,
};
/* Straight arms hanging from a posed shoulder to a bar at fixed x —
 * the deadlift family's arm. Returns the aimed arm ops. */
function hangingArmTo(
  S: Pt,
  barX: number,
  torsoOps: Op[],
  hipPivot: Pt,
  hinge: number,
  // Must be the TRANSLATE variant specifically — a bare `Op` has no
  // dx/dy, and the root tsconfig's project references meant a plain
  // `tsc --noEmit` checked nothing and missed it. Use `npm run
  // typecheck` (tsc -b), which is what CI runs.
  shift: Extract<Op, { kind: "translate" }>
) {
  const ARM = SIDE_UPPER_LEN + SIDE_FORE_LEN;
  const dx = barX - S[0];
  const hFinal: Pt = [barX, S[1] + Math.sqrt(Math.max(ARM * ARM - dx * dx, 1))];
  const unpose: Op[] = [
    { kind: "translate", dx: -shift.dx, dy: -shift.dy },
    { kind: "rotate", deg: -hinge, pivot: hipPivot },
  ];
  const hPre = applyToPoint(hFinal, unpose);
  const arm = aimArm(
    { S: SIDE_ANCHORS.shoulder, E: SIDE_ANCHORS.elbow, H: SIDE_ANCHORS.hand },
    solveElbow(SIDE_ANCHORS.shoulder, hPre, SIDE_UPPER_LEN, SIDE_FORE_LEN, -1),
    hPre,
    0
  );
  return {
    upperArmL: [...arm.upper, ...torsoOps],
    foreArmL: [...arm.fore, ...torsoOps],
    handL: [...arm.fore, ...torsoOps],
  };
}

BODY_DEMOS["sumo-deadlift"] = {
  ...BODY_DEMOS["deadlift"],
  /* Sumo. Be honest about what a side camera can and cannot show: the
   * wide stance and the hands-inside-the-knees grip are almost entirely
   * FORESHORTENED in profile, so they are not the signature here. What
   * IS visible, and what the literature measures, is the trunk: peak
   * trunk angle is 5-9 degrees more vertical than conventional
   * (Escamilla et al.), with the hips starting closer to the bar. So
   * this is the conventional chain with a more upright torso (60 vs 75)
   * and a lower hip (deeper thigh drop), and near-vertical shins. */
  pose: (e) => {
    const { legOps, thighOps, torsoOps, headOps } = sideStanceChain(e, {
      shin: 4,
      thighRel: -64,
      hinge: 68,
    });
    const S = applyToPoint(SIDE_ANCHORS.shoulder, torsoOps);
    const hipNew = applyToPoint(SIDE_ANCHORS.hip, thighOps);
    const shift: Op = {
      kind: "translate",
      dx: hipNew[0] - SIDE_ANCHORS.hip[0],
      dy: hipNew[1] - SIDE_ANCHORS.hip[1],
    };
    return {
      head: headOps,
      torso: torsoOps,
      pelvis: torsoOps,
      thighL: thighOps,
      thighR: thighOps,
      shankL: legOps,
      shankR: legOps,
      ...hangingArmTo(S, MIDFOOT_X, torsoOps, SIDE_ANCHORS.hip, lerp(0, 68, e), shift),
    };
  },
};

BODY_DEMOS["trap-bar-deadlift"] = {
  ...BODY_DEMOS["deadlift"],
  /* Trap/hex bar. The lifter stands INSIDE the frame with the handles
   * at the SIDES in a neutral grip, so the load sits on the body's own
   * line rather than out in front of the shins — the arms hang plumb
   * from the shoulder instead of reaching to a midfoot bar. The
   * references are consistent that this is "closer to a squat than a
   * hinge": more knee flexion, a markedly more upright torso, higher
   * hips. The sleeves run fore AND aft, so a side camera sees a plate
   * in FRONT of the shins and another BEHIND the calves at the same
   * height — that pair is the trap bar's signature and the one thing
   * that cannot be confused with a straight bar. */
  equip: undefined,
  // Content measures x -3.4..94.0 — the fore AND aft plates are what
  // set the width here — and y -0.7..206.4. 140 wide keeps the
  // figure at the same on-screen scale as the rest of the set.
  viewBox: "-13 -6 140 218",
  pose: (e) => {
    const { legOps, thighOps, torsoOps, headOps } = sideStanceChain(e, {
      shin: 12,
      thighRel: -72,
      hinge: 42,
    });
    const S = applyToPoint(SIDE_ANCHORS.shoulder, torsoOps);
    const hipNew = applyToPoint(SIDE_ANCHORS.hip, thighOps);
    const shift: Op = {
      kind: "translate",
      dx: hipNew[0] - SIDE_ANCHORS.hip[0],
      dy: hipNew[1] - SIDE_ANCHORS.hip[1],
    };
    // Handles at the SIDE: the hand hangs plumb below the shoulder.
    return {
      head: headOps,
      torso: torsoOps,
      pelvis: torsoOps,
      thighL: thighOps,
      thighR: thighOps,
      shankL: legOps,
      shankR: legOps,
      ...hangingArmTo(S, S[0], torsoOps, SIDE_ANCHORS.hip, lerp(0, 42, e), shift),
    };
  },
  bar: (_e, pose) => {
    const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
    return [h, h];
  },
  // Rear sleeve + plate, painted BEHIND the figure.
  scene: (_e, pose) => {
    const [x, y] = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
    const rx = x - 30;
    return (
      `<line x1="${rx.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${GEAR}" stroke-width="2.6" stroke-linecap="round"/>` +
      `<circle cx="${rx.toFixed(1)}" cy="${y.toFixed(1)}" r="13" fill="${GEAR_DARK}" stroke="#565760" stroke-width="1"/>` +
      `<circle cx="${rx.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${GEAR}"/>`
    );
  },
  // Front sleeve + plate, painted OVER the figure.
  sceneFront: (_e, pose) => {
    const [x, y] = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
    const fx = x + 30;
    return (
      `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${fx.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${GEAR}" stroke-width="2.6" stroke-linecap="round"/>` +
      `<circle cx="${fx.toFixed(1)}" cy="${y.toFixed(1)}" r="13" fill="${GEAR_DARK}" stroke="#565760" stroke-width="1"/>` +
      `<circle cx="${fx.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${GEAR}"/>`
    );
  },
};

/** T-bar / landmine anchor: the pinned end sits on the floor well in
 *  FRONT of the lifter (they straddle the bar facing it). It is far
 *  enough out that it leaves the frame — which is honest, a 7ft bar is
 *  ~250 rig units — so the bar is drawn running off toward it. */
const TBAR_ANCHOR: Pt = [242, 202];

BODY_DEMOS["t-bar-row"] = {
  ...BODY_DEMOS["barbell-row"],
  /* T-bar row. The one thing that makes this NOT a barbell row: one end
   * of the bar is pinned to the floor, so the handle cannot travel a
   * straight vertical line — it swings on an ARC about that pivot. The
   * references also put the torso nearer 45° than the barbell row's
   * 55°, and say to match the torso angle to the bar angle. */
  equip: undefined,
  // Content measures x 31.2..112.8, y 16.3..204.2 — the 45° torso
  // carries the head higher than the barbell row's, so the window
  // starts at 10. Width 138 keeps the figure inside the set's scale band.
  viewBox: "3 10 138 200",
  pose: (e) => {
    const HINGE = 45;
    const KNEE = 20;
    const LEAN = hipsBack(HINGE);
    const T: Op = { kind: "rotate", deg: HINGE, pivot: SIDE_ANCHORS.hip };
    const unpose: Op[] = [
      { kind: "rotate", deg: -LEAN.deg, pivot: LEAN.pivot },
      { kind: "rotate", deg: -HINGE, pivot: SIDE_ANCHORS.hip },
    ];
    const S = applyToPoint(SIDE_ANCHORS.shoulder, [T, LEAN]);
    /* The handle rides the arc: take the dead-hang point below the
     * shoulder as the bottom of the stroke, then SWING it about the
     * floor anchor. Radius is fixed, so the bar cannot change length. */
    const bottom: Pt = [S[0] + 1, S[1] + 50];
    const R = Math.hypot(bottom[0] - TBAR_ANCHOR[0], bottom[1] - TBAR_ANCHOR[1]);
    const a0 = Math.atan2(
      bottom[1] - TBAR_ANCHOR[1],
      bottom[0] - TBAR_ANCHOR[0]
    );
    /* + not −: the handle sits up-LEFT of the anchor, so increasing the
     * angle sweeps it UP and slightly toward the pivot, which is the
     * arc a landmine actually produces. (Measured the wrong way first:
     * the hand travelled down-and-back 13 units.) 0.22 rad over the
     * ~133-unit radius gives ~29 units of travel — matching the barbell
     * row's stroke, so the two read as the same amount of work. The
     * anchor sits ~190 units from the grip because a 7ft bar is ~250
     * rig units and the lifter straddles near the loaded end — at a
     * closer (shorter-bar) pivot the arc tips too far forward. */
    const a = a0 + lerp(0, 0.16, e);
    const hFinal: Pt = [
      TBAR_ANCHOR[0] + R * Math.cos(a),
      TBAR_ANCHOR[1] + R * Math.sin(a),
    ];
    const hPre = applyToPoint(hFinal, unpose);
    const arm = aimArm(
      { S: SIDE_ANCHORS.shoulder, E: SIDE_ANCHORS.elbow, H: SIDE_ANCHORS.hand },
      solveElbow(SIDE_ANCHORS.shoulder, hPre, SIDE_UPPER_LEN, SIDE_FORE_LEN, -1),
      hPre,
      0
    );
    const legRaw: Op[] = [
      { kind: "rotate", deg: KNEE, pivot: SIDE_ANCHORS.hip },
      LEAN,
    ];
    const shankRaw: Op[] = [
      { kind: "rotate", deg: -KNEE, pivot: SIDE_ANCHORS.knee },
      { kind: "rotate", deg: KNEE, pivot: SIDE_ANCHORS.hip },
      LEAN,
    ];
    const P = plantFoot(shankRaw);
    return {
      head: [
        T,
        LEAN,
        {
          kind: "rotate",
          deg: -T.deg * 0.4,
          pivot: applyToPoint([48, 32], [T, LEAN]),
        },
        P,
      ],
      torso: [T, LEAN, P],
      pelvis: [
        { kind: "rotate", deg: T.deg * 0.72, pivot: T.pivot },
        LEAN,
        P,
      ],
      thighL: [...legRaw, P],
      thighR: [...legRaw, P],
      shankL: [...shankRaw, P],
      shankR: [...shankRaw, P],
      upperArmL: [...arm.upper, T, LEAN, P],
      foreArmL: [...arm.fore, T, LEAN, P],
      handL: [...arm.fore, T, LEAN, P],
    };
  },
  bar: (_e, pose) => {
    const h = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
    return [h, h];
  },
  /* The bar itself runs from the hand out to the floor anchor, and the
   * plates are loaded AT the hand end (they sit under the chest). Drawn
   * in front so the loaded end reads; the shaft leaves the frame. */
  sceneFront: (_e, pose) => {
    const [x, y] = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
    return (
      `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${TBAR_ANCHOR[0]}" y2="${TBAR_ANCHOR[1]}" stroke="${GEAR}" stroke-width="2.6" stroke-linecap="round"/>` +
      `<circle cx="${(x + 3).toFixed(1)}" cy="${(y + 1).toFixed(1)}" r="11" fill="${GEAR_DARK}" stroke="#565760" stroke-width="1"/>` +
      `<circle cx="${(x + 3).toFixed(1)}" cy="${(y + 1).toFixed(1)}" r="2.6" fill="${GEAR}"/>`
    );
  },
};

BODY_DEMOS["db-row"] = {
  ...BODY_DEMOS["barbell-row"],
  /* "Dumbbell Row" unqualified covers both the one-arm bench-supported
   * and the two-arm bent-over form; the references treat the bent-over
   * two-arm row as a standard named variant, and it is the one that
   * shares this demo's support geometry exactly. It also happens to be
   * the honest choice for a SIDE camera: with only the near arm drawn,
   * a one-arm row and a two-arm row are the same silhouette, so
   * building a bench and a supporting arm would add geometry the view
   * cannot distinguish. The grip is NEUTRAL, so the dumbbell's axis
   * runs fore-aft and the camera sees it in profile. */
  equip: "db-side",
};
BODY_DEMOS["db-rdl"] = {
  ...BODY_DEMOS["romanian-deadlift"],
  // An RDL holds the dumbbells in a NEUTRAL grip alongside the thighs,
  // so their axis runs fore-aft and the side camera sees the whole
  // dumbbell in profile — bell, handle, bell.
  equip: "db-side",
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
  /* Squat family (owner call 2026-08-15): only the smith machine keeps
   * the barbell model — front/goblet don't carry a back bar, so they
   * share the bar-less variant (its forward reach is the closest
   * honest read of both grips under the no-held-weights rule). */
  "front-squat": "bodyweight-squat",
  "goblet-squat": "bodyweight-squat",
  "smith-machine-squat": "squat",
  "cable-lateral-raise": "lateral-raise",
  "standing-calf-raise": "calf-raise",
  "chin-ups": "pull-ups",
  "tricep-dips": "dips",
  "weighted-chest-dip": "dips",
  "diamond-push-ups": "push-ups",
  "weighted-push-ups": "push-ups",
  "smith-bench-press": "bench-press",
  "pendlay-row": "barbell-row",
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
  /* Two passes (anatomy-plate rework): the muscle-map polygons carry
   * natural spacing that used to read as BLACK CHANNELS splitting the
   * body into floating blocks. Pass one WELDS the mosaic into one
   * continuous flesh silhouette (each polygon re-painted in BODY with a
   * fat round-joined BODY stroke that bridges the inter-polygon gaps);
   * pass two draws the crisp muscle fills with a thin value-change
   * boundary line — separations DRAWN on the form, textbook-style,
   * instead of voids through it. */
  /* Owner pass 3 ("his neck is too high up"): the skull floats a
   * couple of units above the trap line, stretching a giraffe neck
   * between chin and clavicle. The head SETTLES onto the neck — a
   * static drop applied before pose ops (front/back head poses are
   * translations, so no pivot math is disturbed). */
  const HEAD_SETTLE = 2.2;
  const transformed = data.map((p) => {
    const g = groupOf(view, p);
    let ops = pose[g] ?? [];
    if (p.muscle === "front-deltoids" || p.muscle === "back-deltoids") {
      ops = deltoidOps(ops);
    }
    if (p.muscle === "head") {
      ops = [{ kind: "translate", dx: 0, dy: HEAD_SETTLE }, ...ops];
    }
    const pts = applyOps(p.points as Pt[], ops);
    const level = demo.tint[p.muscle];
    if (level === "primary") {
      const key = `${p.muscle}|${p.side}`;
      primaryPts.set(key, [...(primaryPts.get(key) ?? []), ...pts]);
    }
    // The head is the one form with no interior muscle boundaries — a
    // skull reads as an OVAL, so its corners get a much deeper rounding
    // than the muscle facets (whose crisp edges are the anatomy lines).
    return { pts, level, g, r: p.muscle === "head" ? 3.2 : 1.1 };
  });
  /* MOSAIC style (owner decision, pass 10): the vendored muscle-block
   * look with its stage-black separation channels IS the figure's
   * identity — the flesh weld/hull direction ("passes 5-9") read
   * blobby next to it and is reverted. What stays from those passes is
   * everything that didn't change the style's character: mechanics
   * (cervical/lumbopelvic rhythm, knees-out squat, deltoid rhythm),
   * the oval head + settle, corner rounding, hands, and subtle facet
   * shading. Joints get SLEEVES (below) instead of the old ball caps. */
  const polys = transformed
    .map(({ pts, level, r }, i) => {
      const base =
        level === "primary"
          ? PRIMARY
          : level === "secondary"
            ? SECONDARY
            : BODY;
      const fill = tone(base, shadeFor(i));
      const op = level
        ? ` fill-opacity="${tintOpacity(level).toFixed(3)}"`
        : "";
      return shape(
        pts,
        r,
        fill,
        `${op} stroke="${fill}" stroke-width="0.5" stroke-linejoin="round"`
      );
    })
    .join("");

  /* Joint sleeves (owner pass 5: "these balls that are the circles for
   * the joints … need to look like real arms instead"): the old ball
   * caps bridged articulated joints but read as a mannequin. A sleeve
   * is a round-capped stroke from a point ON the upper segment to a
   * point ON the lower segment, each pushed through its own group's
   * transform — so it follows the actual bend like flesh, at limb
   * width, and hides beneath the muscle blocks except in the joint
   * gap itself. Elbows both views; knees where the leg articulates
   * (anterior). */
  const JA = view === "anterior" ? ANT : POST;
  const seg = (a: Pt, b: Pt, t: number): Pt => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];
  /* The 6th slot names the muscle a sleeve BELONGS TO. A sleeve only
   * shows through the gaps between muscle blocks, so when that muscle
   * is tinted the grey capsule read as a grey stripe cutting the
   * working muscle in half — the "muscles misaligned / model showing
   * through" defect, most visible on the posterior forearm (two thin
   * blades with the capsule between them) and on a raised deltoid cap
   * (which trails the humerus by design, so the gap it opens is real).
   * Tinted sleeves inherit the muscle's colour and opacity instead.
   * ELBOW capsules deliberately carry no muscle: they bridge two
   * DIFFERENT muscles, and a joint gap reading as flesh is correct. */
  const sleeveDefs: [Pt, GroupName, Pt, GroupName, number, string?][] = [
    // Elbow capsules start at 0.58 of the humerus so that, with the
    // shoulder sleeves reaching 0.62, the upper arm's AXIS is covered
    // shoulder to elbow — at 45°+ elevation the narrow arm blocks
    // otherwise split into slats around a bare core (owner pass 7).
    [
      seg(JA.shoulderL, JA.elbowL, 0.58),
      "upperArmL",
      seg(JA.elbowL, JA.handL, 0.25),
      "foreArmL",
      7,
    ],
    [
      seg(JA.shoulderR, JA.elbowR, 0.58),
      "upperArmR",
      seg(JA.elbowR, JA.handR, 0.25),
      "foreArmR",
      7,
    ],
    /* Shoulder sleeves: the deltoid follows the humerus at a capped
     * ~40% (scapulohumeral rhythm), so at a 90° raise the cap and the
     * arm fan APART and a black wedge opens inside the arm silhouette.
     * The torso-side anchor sits just inboard of the shoulder; the
     * arm-side anchor rides the humerus — the capsule spans whatever
     * angle opens between them. Hidden under the deltoid at rest. */
    [
      [JA.shoulderL[0] + 6, JA.shoulderL[1] + 2],
      "torso",
      seg(JA.shoulderL, JA.elbowL, 0.62),
      "upperArmL",
      7,
      view === "anterior" ? "front-deltoids" : "back-deltoids",
    ],
    [
      [JA.shoulderR[0] - 6, JA.shoulderR[1] + 2],
      "torso",
      seg(JA.shoulderR, JA.elbowR, 0.62),
      "upperArmR",
      7,
      view === "anterior" ? "front-deltoids" : "back-deltoids",
    ],
    /* Forearm-axis sleeves: the fist rides the forearm group (no
     * relative rotation), but the thin forearm blocks let the arm END
     * dissolve into offset flakes at big raises, and the channel to
     * the hand left the fist floating. One capsule from mid-forearm to
     * the hand anchor (both in the forearm group) welds the outer
     * forearm and hand into a continuous limb end — together with the
     * elbow sleeve (which reaches 0.25 down the forearm) the arm's
     * axis is covered joint to fingertip. */
    // The posterior forearm is only two thin blades, so its axis
    // capsule carries more of the limb's mass than the anterior's.
    [
      seg(JA.elbowL, JA.handL, 0.35),
      "foreArmL",
      JA.handL,
      "foreArmL",
      view === "anterior" ? 5 : 7.5,
      "forearm",
    ],
    [
      seg(JA.elbowR, JA.handR, 0.35),
      "foreArmR",
      JA.handR,
      "foreArmR",
      view === "anterior" ? 5 : 7.5,
      "forearm",
    ],
  ];
  if (view === "anterior") {
    sleeveDefs.push(
      [
        seg([ANT.kneeL[0], 96], ANT.kneeL, 0.8),
        "thighL",
        seg(ANT.kneeL, [ANT.kneeL[0], ANT.ankleY], 0.2),
        "shankL",
        8,
      ],
      [
        seg([ANT.kneeR[0], 96], ANT.kneeR, 0.8),
        "thighR",
        seg(ANT.kneeR, [ANT.kneeR[0], ANT.ankleY], 0.2),
        "shankR",
        8,
      ]
    );
  } else {
    /* Posterior knee sleeves (posterior part-fit round): the back-view
     * knee shards sit with the same wide natural gaps the anterior
     * knees had before pass 35 — the rest-floor core closes the
     * fragmented read. Posterior demos never bend the knee, so these
     * stay at the rest width for good. Knee point = the vendored
     * posterior knee shards' centroid row. */
    const KNEE_L: Pt = [34.3, 159.8];
    const KNEE_R: Pt = [66.2, 159.8];
    sleeveDefs.push(
      [
        seg([KNEE_L[0], POST.hipY], KNEE_L, 0.8),
        "thighL",
        seg(KNEE_L, [KNEE_L[0], POST.ankleY], 0.2),
        "shankL",
        8,
      ],
      [
        seg([KNEE_R[0], POST.hipY], KNEE_R, 0.8),
        "thighR",
        seg(KNEE_R, [KNEE_R[0], POST.ankleY], 0.2),
        "shankR",
        8,
      ]
    );
  }
  // The knee cluster's shards sit with wider natural gaps than the
  // arm blocks the global 4.2 resting floor was tuned on — knees keep
  // a thicker core at rest.
  const REST_FLOOR = (w: number) => (w >= 8 ? 5.5 : 4.2);
  const sleeves = sleeveDefs
    .map(([pa, ga, pb, gb, w, muscle]) => {
      const a = applyToPoint(pa, pose[ga] ?? []);
      const b = applyToPoint(pb, pose[gb] ?? []);
      /* Deformation-aware width (owner pass 8: at rest the full-width
       * capsules showed past the tapered blocks as "a straight rod
       * with a circle"). A capsule only exists to bridge a joint that
       * has OPENED, so its width follows how much the span between
       * its endpoints has changed vs rest — pure translation (squat
       * dive, pull-up ride) leaves dv = 0 and the capsule stays a
       * narrow core hidden beneath the muscle blocks. */
      const dv = Math.hypot(
        b[0] - a[0] - (pb[0] - pa[0]),
        b[1] - a[1] - (pb[1] - pa[1])
      );
      const wEff = Math.min(w, REST_FLOOR(w) + dv * 0.5);
      const level = muscle ? demo.tint[muscle] : undefined;
      const stroke = level
        ? level === "primary"
          ? PRIMARY
          : SECONDARY
        : BODY;
      const op = level
        ? ` stroke-opacity="${tintOpacity(level).toFixed(3)}"`
        : "";
      return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${stroke}"${op} stroke-width="${wEff.toFixed(1)}" stroke-linecap="round"/>`;
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

  /* Hands (owner pass 2: "why don't the figure have hands?"). Compact
   * rounded mitts at the measured hand anchors, riding the forearm
   * group's transform — on IK arms (pull-ups, dips) they land exactly
   * on the grip because the anchor IS the constraint point. */
  const A = demo.view === "anterior" ? ANT : POST;
  /* Compact FIST, not a paddle (owner pass 3: "his hands look like
   * feet") — the old mitt ran 6 units long past the wrist and read as
   * a flipper wherever the forearm pointed. */
  const HAND_SHAPE: Pt[] = [
    [-2.3, -2.4],
    [2.3, -2.4],
    [2.7, 1.1],
    [1.2, 3],
    [-1.4, 2.9],
    [-2.7, 1],
  ];
  const hands = (
    [
      [A.handL, "foreArmL"],
      [A.handR, "foreArmR"],
    ] as const
  )
    .map(([anchor, group]) => {
      const pts = HAND_SHAPE.map(
        ([dx, dy]) => [anchor[0] + dx, anchor[1] + dy] as Pt
      );
      const posed = applyOps(pts, pose[group] ?? []);
      const fill = tone(BODY, -4);
      return shape(
        posed,
        1.6,
        fill,
        ` stroke="${fill}" stroke-width="1.6" stroke-linejoin="round"`
      );
    })
    .join("");

  // Fascia/sacrum wedge — posterior only, painted under the blocks.
  const sacrum =
    view === "posterior"
      ? (() => {
          const pts = applyOps(
            POSTERIOR_SACRUM.points,
            pose[POSTERIOR_SACRUM.group] ?? []
          );
          const fill = tone(BODY, -4);
          return shape(
            pts,
            2.4,
            fill,
            ` stroke="${fill}" stroke-width="0.5" stroke-linejoin="round"`
          );
        })()
      : "";

  const feet = (view === "anterior" ? ANTERIOR_FEET : POSTERIOR_FEET)
    .map((f) => {
      const pts = applyOps(f.points, pose[f.group] ?? []);
      const fill = tone(BODY, -3);
      return shape(
        pts,
        1.6,
        fill,
        ` stroke="${fill}" stroke-width="0.5" stroke-linejoin="round"`
      );
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

  // Ground shadow: breathes with how LOW the body sits — bigger/darker at
  // the bottom of a squat, smaller/lighter at a press lockout or calf-
  // raise top. Depth is e for descend-first lifts, 1−e for lift-first.
  const depth = demo.concentricTo === 0 ? e : 1 - e;
  const shadowRx = 26 + 6 * depth;
  /* The anterior default was 199 while ANTERIOR_FEET reach y=203, so
     the contact shadow was drawn 4 units UP inside the ankles — the
     figure read as floating over its own shadow (measured in the
     2026-08-16 contact audit; posterior's 222 was already right). */
  const groundY = demo.groundY ?? (demo.view === "anterior" ? 203 : 222);
  const shadow = `<ellipse cx="50" cy="${groundY}" rx="${shadowRx.toFixed(1)}" ry="2.6" fill="#000" opacity="${(0.16 + 0.1 * depth).toFixed(2)}"/>`;

  const scene = demo.scene?.(e, pose) ?? "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${demo.viewBox ?? (demo.view === "anterior" ? "-8 -14 116 224" : "-12 -14 124 244")}" role="img">` +
    shadow +
    scene +
    barBehind +
    glow +
    sleeves +
    sacrum +
    polys +
    hands +
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
  /* Bilateral-by-construction (roadmap P0 "bilateral arms/hands"): a far
   * piece whose group the pose doesn't address mirrors its NEAR
   * counterpart's ops, then every far piece takes a small constant
   * back-parallax so a darker rim of the far limb reads behind the near
   * one — the depth cue a true zero-offset profile can't give. A pose
   * that DOES address a far group (the bench's split legs) keeps full
   * control and still gets the parallax. */
  const FAR_NEAR: Partial<Record<GroupName, GroupName>> = {
    upperArmR: "upperArmL",
    foreArmR: "foreArmL",
    handR: "handL",
    thighR: "thighL",
    shankR: "shankL",
    footR: "footL",
  };
  /* Attachment default: a foot that a pose doesn't address rides its
   * shank (the pre-split behaviour, when the foot was welded into the
   * shank piece) — only the calf raise articulates the ankle. */
  const FOLLOW: Partial<Record<GroupName, GroupName>> = {
    footL: "shankL",
    footR: "shankR",
  };
  /* Depth parallax for the far limb. The offset is expressed in the
   * figure's OWN space (toward its back, −x at rest) and applied
   * FIRST, so the piece's own transform chain rotates it: in a demo
   * that stands the figure up it reads as "behind", and in one that
   * lays the whole body down it rotates with the body and still reads
   * as behind. Applied LAST it was a screen-space nudge — which is
   * fine while the figure is upright, but the bench press rotates the
   * body −90° and the push-up +90°, so a −x screen nudge displaced
   * their far limbs along the body's LENGTH (toward the head) instead
   * of across it, staggering the legs down the bench. */
  const FAR_OFFSET: Op = { kind: "translate", dx: -2.6, dy: 0 };
  const resolveOps = (g: GroupName): Op[] | undefined =>
    pose[g] ?? (FOLLOW[g] ? pose[FOLLOW[g]!] : undefined);
  const opsFor = (piece: (typeof SIDE_PIECES)[number]): Op[] => {
    const own = resolveOps(piece.group);
    const mirrored = piece.far
      ? resolveOps(FAR_NEAR[piece.group] ?? piece.group)
      : undefined;
    const base = own ?? mirrored ?? [];
    return piece.far ? [FAR_OFFSET, ...base] : base;
  };
  /* NOTE (pass 16; re-verified at the hip in pass 25): front/back-
   * style joint sleeves do NOT work in the side view. The pieces'
   * opaque stage underlays overlap every junction — measured twice,
   * including a debug overlay at the bench's 28° hip drop, where even
   * a 12-wide hip capsule sits fully covered. Side junction gaps are
   * FACET-inset gaps and get fixed in bodySideData ranges (waist belt,
   * neck tuck, knee/elbow/ankle rows, pelvis corner). Do not re-add
   * sleeves here. */
  const body = SIDE_PIECES.map((piece) => {
    const ops = opsFor(piece);
    const outline = applyOps(piece.outline as Pt[], ops);
    const facets = piece.facets.map((f) => ({
      level: demo.tint[f.muscle],
      muscle: f.muscle,
      pts: applyOps(f.points as Pt[], ops),
    }));
    for (const f of facets)
      if (f.level === "primary" && !piece.far)
        primaryPts.set(f.muscle, [
          ...(primaryPts.get(f.muscle) ?? []),
          ...f.pts,
        ]);
    /* Mosaic language (pass 10 owner decision): the underlay is the
     * STAGE colour again, so every facet gap reads as the same dark
     * separation channel the front/back muscle blocks use — one visual
     * language across all three views. The stage underlay also keeps
     * overlapping pieces opaque, so joints never crack under rotation
     * (the original design this file was built around). */
    const flesh = piece.far ? BODY_FAR : BODY;
    return (
      `<path d="${roundedPath(outline, 1.5)}" fill="${STAGE}"/>` +
      facets
        .map((f, i) => {
          const base =
            f.level === "primary"
              ? PRIMARY
              : f.level === "secondary"
                ? SECONDARY
                : flesh;
          // Far limbs render FLAT — a single darker mass reads as
          // depth; sculpt-shading it just adds noise behind the near
          // limb.
          const fill =
            piece.far && !f.level ? BODY_FAR : tone(base, shadeFor(i));
          /* Far tints render dimmed — same muscle, further away. Full
             brightness on both limbs flattens the depth the parallax
             just bought. */
          const op = f.level
            ? ` fill-opacity="${(tintOpacity(f.level) * (piece.far ? 0.55 : 1)).toFixed(3)}"`
            : "";
          // The kneecap is the one facet that must read as a PILL,
          // not a band — a rectangle at a bent knee looks like a box
          // (owner pass 10).
          return shape(
            f.pts,
            f.muscle === "knees" ? 3.2 : 1.1,
            fill,
            `${op} stroke="${fill}" stroke-width="0.5" stroke-linejoin="round"`
          );
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

  /* Dumbbells. A held implement pinned to the hand is legitimate in the
     side view (the figure HAS hands here — the no-held-weights rule is
     a front/back-view rule, where it always read detached). */
  if (ends && (demo.equip === "db-end" || demo.equip === "db-side")) {
    const [x, y] = ends[0];
    if (demo.equip === "db-end") {
      const r = demo.plateR ?? 7;
      const hex = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
      }).join(" ");
      plate =
        `<polygon points="${hex}" fill="${GEAR_DARK}" stroke="#565760" stroke-width="1"/>` +
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.3).toFixed(1)}" fill="${GEAR}"/>`;
    } else {
      // Profile dumbbell: bell — handle — bell, along the facing axis.
      const bw = 4.6; // bell width
      const bh = 11; // bell height
      const half = 9.2; // handle half-length (bell centres sit here)
      const bell = (cx: number) =>
        `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(y - bh / 2).toFixed(1)}" width="${bw}" height="${bh}" rx="1.6" fill="${GEAR_DARK}" stroke="#565760" stroke-width="0.9"/>`;
      plate =
        `<rect x="${(x - half + 1).toFixed(1)}" y="${(y - 1.8).toFixed(1)}" width="${(half * 2 - 2).toFixed(1)}" height="3.6" rx="1.4" fill="${GEAR}"/>` +
        bell(x - half) +
        bell(x + half);
    }
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
