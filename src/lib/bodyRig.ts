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
 *  - a barbell is drawn as a bar + end plates following the hands.
 *
 * Everything is deterministic data → testable, theme-consistent, zero assets.
 */

import { ANTERIOR, POSTERIOR, type BodyPoly } from "./bodyModelData";
import { THEME } from "./theme";

/* ── Palette (exactly what the Form view's Model renders) ─────── */

const BODY = "#B6BDC3"; // react-body-highlighter DEFAULT_BODY_COLOR
const PRIMARY = THEME.lifting; // #7B72E9
const SECONDARY = THEME.liftingLight; // #9590E0
const GEAR = "#4A4B52";
const GEAR_DARK = "#35363C";

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

/* Posterior arm segment lengths + the pull-up scene constants. */
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

/* ── Skeletal grouping ────────────────────────────────────────── */

export type GroupName =
  | "head"
  | "torso"
  | "upperArmL"
  | "upperArmR"
  | "foreArmL"
  | "foreArmR"
  | "thighL"
  | "thighR"
  | "shankL"
  | "shankR";

function groupOf(view: "anterior" | "posterior", p: BodyPoly): GroupName {
  const L = p.side === "left";
  if (p.muscle === "head") return "head";
  if (view === "anterior") {
    if (p.muscle === "biceps" || p.muscle === "triceps")
      return L ? "upperArmL" : "upperArmR";
    if (p.muscle === "forearm") return L ? "foreArmL" : "foreArmR";
    if (p.muscle === "quadriceps" || p.muscle === "abductors")
      return L ? "thighL" : "thighR";
    if (p.muscle === "knees" || p.muscle === "calves")
      return L ? "shankL" : "shankR";
    return "torso"; // chest, obliques, abs, neck, front-deltoids
  }
  if (p.muscle === "triceps") return L ? "upperArmL" : "upperArmR";
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

/** Also run single points (bar anchors) through a group's ops. */
function applyToPoint(p: Pt, ops: Op[]): Pt {
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
  view: "anterior" | "posterior";
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
  /** Weight visual: a rigid barbell needs endpoints that keep a constant
   *  width (traps/deadlift). Rotating hands (press/curl) get DUMBBELLS —
   *  one weight per hand — because a rigid front-view bar can't follow
   *  two independent arcs without its width visibly breathing. A
   *  fixed-bar is a plate-less full-width bar (pull-up); a cable-bar is
   *  a plate-less bar across the hands with a cable up to the frame
   *  (pulldown). */
  equip?: "barbell" | "dumbbells" | "fixed-bar" | "cable-bar";
  bar?: (_e: number, pose: Partial<Record<GroupName, Op[]>>) => [Pt, Pt] | null;
  /** Ground line override (hanging demos float above a lower floor). */
  groundY?: number;
}

const lerp = (a: number, b: number, e: number) => a + (b - a) * e;

export const BODY_DEMOS: Record<string, BodyDemo> = {
  squat: {
    view: "anterior",
    equip: "barbell",
    concentricTo: 0,
    tint: { quadriceps: "primary", abductors: "secondary", abs: "secondary" },
    pose: (e) => {
      const k = lerp(1, 0.68, e); // thigh compression about the knee line
      // The torso must track the moving thigh TOPS exactly (y≈92) or a
      // waist gap opens between the obliques and the quads.
      const drop = (1 - k) * (ANT.kneeL[1] - 92);
      const flare = lerp(0, 5, e);
      const dive: Op[] = [{ kind: "translate", dx: 0, dy: drop }];
      /* Arms ride down with the body. (A folded front-view grip was tried
         and read as broken polygons across the chest — rigid facets can't
         fold 150° gracefully. Hanging arms are the clean stylization.) */
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
        upperArmL: dive,
        upperArmR: dive,
        foreArmL: dive,
        foreArmR: dive,
      };
    },
    // Bar on the traps, dropping with the body.
    bar: (_e, pose) => {
      const y =
        46 + ((pose.torso?.[0] as { dy?: number } | undefined)?.dy ?? 0);
      return [
        [16, y],
        [84, y],
      ];
    },
  },

  "overhead-press": {
    view: "anterior",
    equip: "dumbbells",
    concentricTo: 1,
    tint: {
      "front-deltoids": "primary",
      triceps: "secondary",
      neck: "secondary",
    },
    pose: (e) => {
      /* Goal-post press. The forearm stays WORLD-VERTICAL for the whole
       * rep (hand directly above elbow) while the upper arm arcs about
       * the shoulder — rack (elbows low, DBs at the shoulders) → elbows
       * out at shoulder height → lockout overhead. Hands travel straight
       * up, exactly how a front-view DB press reads; the earlier
       * fold+lift version swung through a T-pose and looked like a
       * lateral raise. Numbers: rest upper arm ≈10° outward of straight
       * down, rest forearm ≈17–19°; forearm world angle must equal 180°
       * (up), so fold = 163 − arm. */
      const arm = lerp(10, 155, e); // outward whole-arm rotation
      const fold = 163 - arm; // keeps the forearm vertical
      return {
        upperArmL: [{ kind: "rotate", deg: arm, pivot: ANT.shoulderL }],
        foreArmL: [
          { kind: "rotate", deg: fold, pivot: ANT.elbowL },
          { kind: "rotate", deg: arm, pivot: ANT.shoulderL },
        ],
        upperArmR: [{ kind: "rotate", deg: -arm, pivot: ANT.shoulderR }],
        foreArmR: [
          { kind: "rotate", deg: -fold, pivot: ANT.elbowR },
          { kind: "rotate", deg: -arm, pivot: ANT.shoulderR },
        ],
      };
    },
    bar: (_e, pose) => {
      const l = applyToPoint(ANT.handL, pose.foreArmL ?? []);
      const r = applyToPoint(ANT.handR, pose.foreArmR ?? []);
      return [l, r];
    },
  },

  "barbell-curl": {
    view: "anterior",
    equip: "dumbbells",
    concentricTo: 1,
    tint: { biceps: "primary", forearm: "secondary" },
    pose: (e) => {
      /* Front-view curl. The forearm rotates up about the elbow AND
       * foreshortens along its own axis (scaleAxis) — at mid-rep a real
       * curl points the forearm at the viewer, so in 2D it must read
       * SHORT, not swung out sideways (the unforeshortened version was
       * a dumbbell chicken-wing that clipped the canvas). Foreshortening
       * peaks when the forearm crosses horizontal. */
      const deg = lerp(0, 112, e);
      const drift = lerp(0, 4, e); // elbows ease forward a touch
      // Rest forearm ≈17° outside vertical; world angle from down = 17+deg.
      const rad = ((17 + deg) * Math.PI) / 180;
      const k = 1 - 0.45 * Math.sin(Math.min(rad, Math.PI));
      return {
        upperArmL: [{ kind: "rotate", deg: drift, pivot: ANT.shoulderL }],
        foreArmL: [
          { kind: "rotate", deg, pivot: ANT.elbowL },
          { kind: "scaleAxis", k, deg: 17 + deg, pivot: ANT.elbowL },
          { kind: "rotate", deg: drift, pivot: ANT.shoulderL },
        ],
        upperArmR: [{ kind: "rotate", deg: -drift, pivot: ANT.shoulderR }],
        foreArmR: [
          { kind: "rotate", deg: -deg, pivot: ANT.elbowR },
          { kind: "scaleAxis", k, deg: -(17 + deg), pivot: ANT.elbowR },
          { kind: "rotate", deg: -drift, pivot: ANT.shoulderR },
        ],
      };
    },
    bar: (_e, pose) => {
      const l = applyToPoint(ANT.handL, pose.foreArmL ?? []);
      const r = applyToPoint(ANT.handR, pose.foreArmR ?? []);
      return [l, r];
    },
  },

  deadlift: {
    view: "posterior",
    equip: "barbell",
    concentricTo: 0,
    tint: {
      gluteal: "primary",
      hamstring: "primary",
      "lower-back": "secondary",
      forearm: "secondary",
    },
    pose: (e) => {
      // Hip hinge from behind: the torso compresses toward the hip line,
      // shoulders/head/arms ride down with it; slight knee give below.
      const k = lerp(1, 0.62, e);
      const shoulderDrop = (1 - k) * (POST.hipY - POST.shoulderL[1]);
      const headDrop = (1 - k) * (POST.hipY - 10);
      const armDive: Op[] = [{ kind: "translate", dx: 0, dy: shoulderDrop }];
      return {
        torso: [{ kind: "scaleY", k, pivotY: POST.hipY }],
        head: [{ kind: "translate", dx: 0, dy: headDrop }],
        upperArmL: armDive,
        upperArmR: armDive,
        foreArmL: armDive,
        foreArmR: armDive,
        shankL: [{ kind: "scaleY", k: lerp(1, 0.95, e), pivotY: POST.ankleY }],
        shankR: [{ kind: "scaleY", k: lerp(1, 0.95, e), pivotY: POST.ankleY }],
      };
    },
    bar: (_e, pose) => {
      const l = applyToPoint(POST.handL, pose.foreArmL ?? []);
      const r = applyToPoint(POST.handR, pose.foreArmR ?? []);
      return [l, r];
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
       * IK machinery as the pull-up with the constraints swapped. */
      const hl: Pt = [lerp(12.2, 6, e), lerp(-14.5, 50, e)];
      const hr: Pt = [lerp(87.8, 94, e), lerp(-14.5, 50, e)];
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
      const y = lerp(-14.5, 50, e);
      return [
        [lerp(12.2, 6, e) - 10, y],
        [lerp(87.8, 94, e) + 10, y],
      ];
    },
  },

  "lateral-raise": {
    view: "anterior",
    equip: "dumbbells",
    concentricTo: 1,
    // A raise at full span is nearly two arm-lengths wide — this is the
    // one movement whose envelope genuinely needs a wider canvas.
    viewBox: "-46 -14 192 224",
    tint: { "front-deltoids": "primary", neck: "secondary" },
    pose: (e) => {
      // Whole arm sweeps out to just below shoulder height (proper form
      // stops at parallel); a constant soft elbow bend so the arm never
      // reads hyper-straight, hands trailing slightly under the elbows.
      const arm = lerp(4, 74, e);
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
    bar: (_e, pose) => {
      const l = applyToPoint(ANT.handL, pose.foreArmL ?? []);
      const r = applyToPoint(ANT.handR, pose.foreArmR ?? []);
      return [l, r];
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
};

/** Sibling exercises that share a demo's motion pattern. */
const DEMO_ALIASES: Record<string, string> = {
  "db-shoulder-press": "overhead-press",
  "smith-shoulder-press": "overhead-press",
  "db-curl": "barbell-curl",
  "hammer-curl": "barbell-curl",
  "ez-bar-curl": "barbell-curl",
  "cable-curl": "barbell-curl",
  "romanian-deadlift": "deadlift",
  "sumo-deadlift": "deadlift",
  "trap-bar-deadlift": "deadlift",
  "db-rdl": "deadlift",
  "front-squat": "squat",
  "goblet-squat": "squat",
  "bodyweight-squat": "squat",
  "smith-machine-squat": "squat",
  "cable-lateral-raise": "lateral-raise",
  "standing-calf-raise": "calf-raise",
  "chin-ups": "pull-ups",
};

export function getBodyDemo(exerciseId: string): BodyDemo | null {
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
  const demo = getBodyDemo(exerciseId); // alias-aware — db-curl must render
  if (!demo) return "";
  const e = easeInOutSine(t);
  const pose = demo.pose(e);
  const data = demo.view === "anterior" ? ANTERIOR : POSTERIOR;
  const tintOpacity = (level: "primary" | "secondary") =>
    level === "primary" ? 0.72 + 0.28 * effort : 0.66 + 0.24 * effort;

  const polys = data
    .map((p) => {
      const ops = pose[groupOf(demo.view, p)] ?? [];
      const pts = applyOps(p.points as Pt[], ops);
      const level = demo.tint[p.muscle];
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

  const feet =
    demo.view === "anterior"
      ? ANTERIOR_FEET.map((f) => {
          const pts = applyOps(f.points, pose[f.group] ?? []);
          return `<polygon points="${pts
            .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
            .join(" ")}" fill="${BODY}"/>`;
        }).join("")
      : "";

  /* Weights. A barbell is REAL-scale: the bar spans past the body and the
     plates are big discs (a 45 is ~45cm across — about a head-and-a-half
     here), drawn BEHIND the figure so a back squat reads like a bar across
     the traps, not a line through the face. Dumbbells draw in front, one
     per hand. */
  let barBehind = "";
  let weightsFront = "";
  const ends = demo.bar?.(e, pose);
  if (ends && demo.equip === "barbell") {
    const y = (ends[0][1] + ends[1][1]) / 2;
    const plate = (cx: number) =>
      `<circle cx="${cx}" cy="${y.toFixed(1)}" r="10.5" fill="${GEAR_DARK}" stroke="#565760" stroke-width="1"/>` +
      `<circle cx="${cx}" cy="${y.toFixed(1)}" r="7" fill="none" stroke="${GEAR}" stroke-width="1.4" opacity="0.8"/>` +
      `<circle cx="${cx}" cy="${y.toFixed(1)}" r="2.4" fill="${GEAR}"/>`;
    barBehind =
      `<line x1="-5" y1="${y.toFixed(1)}" x2="105" y2="${y.toFixed(1)}" stroke="${GEAR}" stroke-width="2.8" stroke-linecap="round"/>` +
      plate(3) +
      plate(97);
  } else if (ends && demo.equip === "fixed-bar") {
    // Plate-less overhead bar (pull-up) — full width, behind the body.
    barBehind = `<line x1="${ends[0][0]}" y1="${ends[0][1]}" x2="${ends[1][0]}" y2="${ends[1][1]}" stroke="${GEAR}" stroke-width="3" stroke-linecap="round"/>`;
  } else if (ends && demo.equip === "cable-bar") {
    // Cable attachment sells the machine: a thin line from the frame top
    // down to the bar's midpoint, then the bar across the hands.
    const midX = (ends[0][0] + ends[1][0]) / 2;
    const y = (ends[0][1] + ends[1][1]) / 2;
    barBehind =
      `<line x1="${midX}" y1="-20" x2="${midX}" y2="${y.toFixed(1)}" stroke="${GEAR_DARK}" stroke-width="1.2"/>` +
      `<line x1="${ends[0][0].toFixed(1)}" y1="${y.toFixed(1)}" x2="${ends[1][0].toFixed(1)}" y2="${y.toFixed(1)}" stroke="${GEAR}" stroke-width="2.6" stroke-linecap="round"/>`;
  } else if (ends && demo.equip === "dumbbells") {
    const db = ([x, y]: Pt) =>
      `<line x1="${(x - 8).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + 8).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${GEAR}" stroke-width="2.2" stroke-linecap="round"/>` +
      `<circle cx="${(x - 7).toFixed(1)}" cy="${y.toFixed(1)}" r="4.6" fill="${GEAR_DARK}" stroke="#565760" stroke-width="0.8"/>` +
      `<circle cx="${(x + 7).toFixed(1)}" cy="${y.toFixed(1)}" r="4.6" fill="${GEAR_DARK}" stroke="#565760" stroke-width="0.8"/>`;
    weightsFront = db(ends[0]) + db(ends[1]);
  }

  // Ground shadow: breathes with how LOW the body sits — bigger/darker at
  // the bottom of a squat, smaller/lighter at a press lockout or calf-
  // raise top. Depth is e for descend-first lifts, 1−e for lift-first.
  const depth = demo.concentricTo === 0 ? e : 1 - e;
  const shadowRx = 26 + 6 * depth;
  const groundY = demo.groundY ?? (demo.view === "anterior" ? 199 : 222);
  const shadow = `<ellipse cx="50" cy="${groundY}" rx="${shadowRx.toFixed(1)}" ry="2.6" fill="#000" opacity="${(0.16 + 0.1 * depth).toFixed(2)}"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${demo.viewBox ?? (demo.view === "anterior" ? "-12 -14 124 224" : "-12 -14 124 244")}" role="img">` +
    shadow +
    barBehind +
    polys +
    feet +
    weightsFront +
    `</svg>`
  );
}
