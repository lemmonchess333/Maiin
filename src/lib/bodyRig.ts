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
  handL: [9, 106] as Pt,
  handR: [91, 106] as Pt,
  hipY: 100,
  ankleY: 200,
};

type Pt = [number, number];

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
  | { kind: "translate"; dx: number; dy: number };

function applyOps(pts: Pt[], ops: Op[]): Pt[] {
  let out = pts;
  for (const op of ops) {
    if (op.kind === "translate") {
      out = out.map(([x, y]) => [x + op.dx, y + op.dy]);
    } else if (op.kind === "scaleY") {
      out = out.map(([x, y]) => [x, op.pivotY + (y - op.pivotY) * op.k]);
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

/* ── Exercise definitions ─────────────────────────────────────── */

const easeInOutSine = (t: number) =>
  0.5 - 0.5 * Math.cos(Math.PI * Math.min(Math.max(t, 0), 1));

export interface BodyDemo {
  view: "anterior" | "posterior";
  /** muscle name → tint level (the SAME muscle names the Form view maps). */
  tint: Record<string, "primary" | "secondary">;
  /** Group transforms as a function of eased progress e ∈ [0,1]. */
  pose: (e: number) => Partial<Record<GroupName, Op[]>>;
  /** Barbell endpoints (already-transformed hand anchors), if any. */
  bar?: (_e: number, pose: Partial<Record<GroupName, Op[]>>) => [Pt, Pt] | null;
}

const lerp = (a: number, b: number, e: number) => a + (b - a) * e;

/** Rigid whole-arm rotation about the shoulder = same ops on upper+fore. */
function wholeArm(degL: number, degR: number): Partial<Record<GroupName, Op[]>> {
  return {
    upperArmL: [{ kind: "rotate", deg: degL, pivot: ANT.shoulderL }],
    foreArmL: [{ kind: "rotate", deg: degL, pivot: ANT.shoulderL }],
    upperArmR: [{ kind: "rotate", deg: degR, pivot: ANT.shoulderR }],
    foreArmR: [{ kind: "rotate", deg: degR, pivot: ANT.shoulderR }],
  };
}

export const BODY_DEMOS: Record<string, BodyDemo> = {
  squat: {
    view: "anterior",
    tint: { quadriceps: "primary", abductors: "secondary", abs: "secondary" },
    pose: (e) => {
      const k = lerp(1, 0.6, e); // thigh compression about the knee line
      const drop = (1 - k) * (ANT.kneeL[1] - ANT.hipY); // body sinks by the lost thigh height
      const flare = lerp(0, 6, e); // knees track out
      const dive: Op[] = [{ kind: "translate", dx: 0, dy: drop }];
      return {
        thighL: [
          { kind: "scaleY", k, pivotY: ANT.kneeL[1] },
          { kind: "rotate", deg: -flare, pivot: ANT.kneeL },
        ],
        thighR: [
          { kind: "scaleY", k, pivotY: ANT.kneeR[1] },
          { kind: "rotate", deg: flare, pivot: ANT.kneeR },
        ],
        shankL: [{ kind: "rotate", deg: -flare * 0.5, pivot: [ANT.kneeL[0], ANT.ankleY] }],
        shankR: [{ kind: "rotate", deg: flare * 0.5, pivot: [ANT.kneeR[0], ANT.ankleY] }],
        torso: dive,
        head: dive,
        upperArmL: dive,
        upperArmR: dive,
        foreArmL: dive,
        foreArmR: dive,
      };
    },
    // Back squat: the bar rides at the base of the neck, dropping with the body.
    bar: (_e, pose) => {
      const y = 44 + ((pose.torso?.[0] as { dy?: number } | undefined)?.dy ?? 0);
      return [
        [18, y],
        [82, y],
      ];
    },
  },

  "overhead-press": {
    view: "anterior",
    tint: {
      "front-deltoids": "primary",
      triceps: "secondary",
      neck: "secondary",
    },
    pose: (e) => {
      // Rack (arms down-out) → lockout (arms overhead). In-plane rotation
      // about the shoulders — the classic frontal press V.
      const deg = lerp(0, 155, e);
      return wholeArm(deg, -deg);
    },
    bar: (_e, pose) => {
      const l = applyToPoint(ANT.handL, pose.foreArmL ?? []);
      const r = applyToPoint(ANT.handR, pose.foreArmR ?? []);
      return [l, r];
    },
  },

  "barbell-curl": {
    view: "anterior",
    tint: { biceps: "primary", forearm: "secondary" },
    pose: (e) => {
      // Forearms fold up about the elbows; upper arms stay pinned.
      const deg = lerp(0, 115, e);
      return {
        foreArmL: [{ kind: "rotate", deg, pivot: ANT.elbowL }],
        foreArmR: [{ kind: "rotate", deg: -deg, pivot: ANT.elbowR }],
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
};

export function getBodyDemo(exerciseId: string): BodyDemo | null {
  return BODY_DEMOS[exerciseId] ?? null;
}

/* ── Rendering ────────────────────────────────────────────────── */

/**
 * Render the demo at progress t ∈ [0,1] (0 = start, 1 = deepest point).
 * Output matches the app's Model rendering exactly: naked polygons in the
 * library's body grey, working muscles in the Form view's two purples —
 * no strokes, natural facet gaps, viewBox 0 0 100 200.
 */
export function renderBodyDemo(exerciseId: string, t: number): string {
  const demo = BODY_DEMOS[exerciseId];
  if (!demo) return "";
  const e = easeInOutSine(t);
  const pose = demo.pose(e);
  const data = demo.view === "anterior" ? ANTERIOR : POSTERIOR;

  const polys = data
    .map((p) => {
      const ops = pose[groupOf(demo.view, p)] ?? [];
      const pts = applyOps(p.points as Pt[], ops);
      const level = demo.tint[p.muscle];
      const fill =
        level === "primary" ? PRIMARY : level === "secondary" ? SECONDARY : BODY;
      return `<polygon points="${pts
        .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
        .join(" ")}" fill="${fill}"/>`;
    })
    .join("");

  let bar = "";
  const ends = demo.bar?.(e, pose);
  if (ends) {
    const [[lx, ly], [rx, ry]] = ends;
    bar =
      `<line x1="${(lx - 8).toFixed(1)}" y1="${ly.toFixed(1)}" x2="${(rx + 8).toFixed(1)}" y2="${ry.toFixed(1)}" stroke="${GEAR}" stroke-width="2.4" stroke-linecap="round"/>` +
      `<circle cx="${(lx - 6).toFixed(1)}" cy="${ly.toFixed(1)}" r="4" fill="${GEAR_DARK}"/>` +
      `<circle cx="${(rx + 6).toFixed(1)}" cy="${ry.toFixed(1)}" r="4" fill="${GEAR_DARK}"/>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -4 112 210" role="img">` +
    polys +
    bar +
    `</svg>`
  );
}
