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
  /** Group transforms as a function of eased progress e ∈ [0,1]. */
  pose: (e: number) => Partial<Record<GroupName, Op[]>>;
  /** Weight visual: a rigid barbell needs endpoints that keep a constant
   *  width (traps/deadlift). Rotating hands (press/curl) get DUMBBELLS —
   *  one weight per hand — because a rigid front-view bar can't follow
   *  two independent arcs without its width visibly breathing. */
  equip?: "barbell" | "dumbbells";
  bar?: (_e: number, pose: Partial<Record<GroupName, Op[]>>) => [Pt, Pt] | null;
}

const lerp = (a: number, b: number, e: number) => a + (b - a) * e;

export const BODY_DEMOS: Record<string, BodyDemo> = {
  squat: {
    view: "anterior",
    equip: "barbell",
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
    // Bar on the traps, dropping with the body.
    bar: (_e, pose) => {
      const y = 46 + ((pose.torso?.[0] as { dy?: number } | undefined)?.dy ?? 0);
      return [
        [16, y],
        [84, y],
      ];
    },
  },

  "overhead-press": {
    view: "anterior",
    equip: "dumbbells",
    tint: {
      "front-deltoids": "primary",
      triceps: "secondary",
      neck: "secondary",
    },
    pose: (e) => {
      // Rack: forearms folded so the bar sits at the clavicle. Lockout:
      // the fold opens as the whole arm rotates overhead — the bar path
      // stays close to the body like a real press, not a front raise.
      const lift = lerp(52, 160, e); // whole-arm rotation about the shoulder
      const fold = lerp(92, 0, e); // elbows extend as the weights rise
      return {
        upperArmL: [{ kind: "rotate", deg: lift, pivot: ANT.shoulderL }],
        foreArmL: [
          { kind: "rotate", deg: -fold, pivot: ANT.elbowL },
          { kind: "rotate", deg: lift, pivot: ANT.shoulderL },
        ],
        upperArmR: [{ kind: "rotate", deg: -lift, pivot: ANT.shoulderR }],
        foreArmR: [
          { kind: "rotate", deg: fold, pivot: ANT.elbowR },
          { kind: "rotate", deg: -lift, pivot: ANT.shoulderR },
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
    tint: { biceps: "primary", forearm: "secondary" },
    pose: (e) => {
      // Forearms fold up about the elbows; upper arms stay pinned.
      const deg = lerp(0, 104, e);
      const drift = lerp(0, 7, e); // elbows ease forward a touch
      return {
        upperArmL: [{ kind: "rotate", deg: drift, pivot: ANT.shoulderL }],
        foreArmL: [
          { kind: "rotate", deg, pivot: ANT.elbowL },
          { kind: "rotate", deg: drift, pivot: ANT.shoulderL },
        ],
        upperArmR: [{ kind: "rotate", deg: -drift, pivot: ANT.shoulderR }],
        foreArmR: [
          { kind: "rotate", deg: -deg, pivot: ANT.elbowR },
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

/** Sibling exercises that share a demo's motion pattern. */
const DEMO_ALIASES: Record<string, string> = {
  "db-shoulder-press": "overhead-press",
  "db-curl": "barbell-curl",
  "hammer-curl": "barbell-curl",
  "romanian-deadlift": "deadlift",
  "front-squat": "squat",
};

export function getBodyDemo(exerciseId: string): BodyDemo | null {
  return BODY_DEMOS[DEMO_ALIASES[exerciseId] ?? exerciseId] ?? null;
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
  } else if (ends && demo.equip === "dumbbells") {
    const db = ([x, y]: Pt) =>
      `<line x1="${(x - 8).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + 8).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${GEAR}" stroke-width="2.2" stroke-linecap="round"/>` +
      `<circle cx="${(x - 7).toFixed(1)}" cy="${y.toFixed(1)}" r="4.6" fill="${GEAR_DARK}" stroke="#565760" stroke-width="0.8"/>` +
      `<circle cx="${(x + 7).toFixed(1)}" cy="${y.toFixed(1)}" r="4.6" fill="${GEAR_DARK}" stroke="#565760" stroke-width="0.8"/>`;
    weightsFront = db(ends[0]) + db(ends[1]);
  }

  // Ground shadow: a weight cue that breathes with the movement depth.
  const shadowRx = 26 + 6 * e;
  const groundY = demo.view === "anterior" ? 199 : 202;
  const shadow = `<ellipse cx="50" cy="${groundY}" rx="${shadowRx.toFixed(1)}" ry="2.6" fill="#000" opacity="${(0.16 + 0.1 * e).toFixed(2)}"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -14 116 224" role="img">` +
    shadow +
    barBehind +
    polys +
    feet +
    weightsFront +
    `</svg>`
  );
}
