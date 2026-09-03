/**
 * Exercise props — the gear half of the body rig.
 *
 * Motion Rig V2 roadmap, Phase 3 ("typed props"). Gear used to be drawn
 * inline in two places inside `bodyRig.ts`: one branch chain in the
 * anterior/posterior renderer and a second, DIFFERENT one in the side
 * renderer. They had already drifted — the side `plate-end` grew a
 * collar and a bar stub and honoured `plateR`, while the anterior copy
 * stayed a bare r=10 disc. Since every `plate-end` demo is a side demo,
 * the anterior copy was also unreachable: a divergent dead mirror of a
 * live renderer, which is the exact shape this codebase keeps getting
 * bitten by.
 *
 * So: one typed union, one pure resolver, one implementation per prop.
 *
 * The rule every variant obeys — a prop is a CONSTRAINT. Its geometry is
 * solved FROM the body's contact points (the roadmap's "a grip, bar,
 * rope, bench, floor, hand, toe, or heel is a constraint, never drawn
 * after independently animating the body"). That is why each variant
 * carries its contacts in its own state rather than a free position.
 *
 * Held weights are allowed on a view only where the figure has a hand
 * to hold them. The product-owner call of 2026-07-03 removed them from
 * the front/back views because "the figure has no hands, so a held
 * prop always read detached" — true then: the arm chain stopped at the
 * forearm. The profile rig grew a `handL` group and held gear returned
 * there first; the anterior/posterior figures grew fists on 2026-08-17
 * (corrected wrist anchors + the two-facet fist), which is what makes
 * the frontal barbell and dumbbells below legitimate rather than a
 * repeat of the detached-prop failure.
 */

export type Pt = [number, number];

/* ── Palette ──────────────────────────────────────────────────── */

/** Apparatus mid-tone. */
export const GEAR = "#4A4B52";
/** Apparatus shadow / plate face. */
export const GEAR_DARK = "#35363C";
/** Machined edge highlight on discs and pulley blocks. */
export const GEAR_EDGE = "#565760";
/** Far-side gear — matched to the profile rig's far-limb convention
 *  (`BODY_FAR`), so a second strand or plate reads as depth rather than
 *  as a second object. */
export const GEAR_FAR = "#3E3F45";

/* ── Typed prop state ─────────────────────────────────────────── */

/**
 * A prop, resolved against the body it hangs from.
 *
 * `rigidBar` splits by camera because a barbell is a fundamentally
 * different picture in each: side-on you see one sleeve END (a disc and
 * its hub — the shaft runs at the viewer and has no length on screen),
 * front-on you see the whole shaft spanning both grips.
 */
export type PropState =
  /** Profile barbell: the near sleeve end at the solved grip. */
  | {
      kind: "rigidBar";
      view: "profile";
      hand: Pt;
      plateR: number;
      /** Which side the sleeve tip protrudes; -1 where the bar sits
       *  BEHIND the body (a back squat) so it cannot cross the face. */
      sleeveDir?: -1 | 1;
    }
  /** Frontal barbell: shaft spanning both grips, a plate off each end.
   *  `layer: "behind"` racks it behind the body — a BACK squat's bar
   *  sits on the traps, so the torso occludes the shaft's middle and
   *  only the ends and plates show beside the shoulders. */
  | {
      kind: "rigidBar";
      view: "frontal";
      left: Pt;
      right: Pt;
      plateR: number;
      layer?: "front" | "behind";
    }
  /** A dumbbell in each hand, end-on at the solved grips. */
  | { kind: "dumbbell"; hands: Pt[]; bellR: number }
  /** ONE dumbbell held vertically at the chest (goblet): the hands cup
   *  the top head, the handle runs down through them, the bottom head
   *  hangs below. Seen from the side, so both heads show. */
  | { kind: "gobletDumbbell"; hand: Pt }
  /** Cable + rope attachment, solved from the grip and the pulley. */
  | {
      kind: "ropeAttachment";
      pulley: Pt;
      hand: Pt;
      /** 0 at the folded start → 1 at lockout; opens the strands and
       *  swings the hanging tails apart. */
      spread: number;
    }
  /** Cable + a short handle (a straight bar, a V-grip, a single D-handle
   *  — all end-on in profile, so one drawing is honest for all three),
   *  solved from the grip and the pulley. */
  | { kind: "cableHandle"; pulley: Pt; hand: Pt }
  /** Machine bar on a cable (pulldown): pulley block + drop + bar. */
  | { kind: "cableBar"; left: Pt; right: Pt; frameY: number }
  /** Ceiling-mounted bar the body hangs from (pull-up). */
  | { kind: "fixedBar"; left: Pt; right: Pt; frameY: number }
  /** Dip station: two uprights with base feet and grip end-caps. */
  | { kind: "dipBars"; left: Pt; right: Pt; floorY: number };

/** Gear splits across the body: a machine frame sits behind the figure,
 *  a bar the hands work in front of sits over it. */
export interface PropLayers {
  behind: string;
  front: string;
}

const EMPTY: PropLayers = { behind: "", front: "" };

/** Whole numbers stay whole (`r="10"`, not `r="10.0"`) — plate radii are
 *  declared as integers and are read back as such by the rig tests. */
const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/* ── Builders ─────────────────────────────────────────────────── */

/**
 * Profile barbell — the near sleeve, end-on.
 *
 * Note what this deliberately does NOT do: invent a far plate. In a true
 * orthographic profile the far sleeve sits directly behind the near one
 * and is invisible; drawing it offset would be a depth cheat, not a
 * legibility fix. The reference illustrations avoid the problem by
 * shooting three-quarter, which is a camera this rig does not have. What
 * carries "barbell" here instead is the construction: a collar and a
 * protruding sleeve tip behind the disc, so it reads as the end of a bar
 * rather than a wheel.
 */
export function profileBarbell(
  hand: Pt,
  plateR: number,
  sleeveDir: -1 | 1 = 1
): string {
  const [x, y] = hand;
  const r = plateR;
  /* Which side the collar and sleeve tip stick out. It was hard-coded
     forward, which is right wherever the bar hangs in front of the body
     — and wrong on a back squat, where the bar sits behind the neck and
     the stub then crossed the jaw and poked out past the face (owner,
     2026-09-02). The plate overlapping the head is correct and stays;
     real plates are wider than heads. */
  const sleeveX = sleeveDir === 1 ? x + r * 0.7 : x - r * 0.7 - 5;
  const tipX = sleeveDir === 1 ? sleeveX + 4.4 : sleeveX - 4.6;
  return (
    `<rect x="${n(sleeveX)}" y="${n(y - 2.6)}" width="5" height="5.2" rx="1.4" fill="${GEAR}"/>` +
    `<rect x="${n(tipX)}" y="${n(y - 1.6)}" width="4.6" height="3.2" rx="1" fill="${GEAR_DARK}" stroke="${GEAR_EDGE}" stroke-width="0.6"/>` +
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${GEAR_DARK}" stroke="${GEAR_EDGE}" stroke-width="1"/>` +
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.64)}" fill="none" stroke="${GEAR}" stroke-width="1.2" opacity="0.7"/>` +
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.22)}" fill="${GEAR}"/>`
  );
}

/**
 * Frontal barbell — the shaft across both grips with a plate off each
 * sleeve. Solved from the two grips, so grip width IS bar width and the
 * bar cannot drift off the hands.
 */
export function frontalBarbell(left: Pt, right: Pt, plateR: number): string {
  const r = plateR;
  // Sleeve runs outboard of each grip; the plate sits at its midpoint so
  // the disc reads as threaded ON the bar, not stuck to the end of it.
  const sleeve = r * 1.15;
  const lx = left[0] - sleeve;
  const rx = right[0] + sleeve;
  const y = (left[1] + right[1]) / 2;
  const plate = (cx: number) =>
    `<ellipse cx="${n(cx)}" cy="${n(y)}" rx="${n(r * 0.34)}" ry="${n(r)}" fill="${GEAR_DARK}" stroke="${GEAR_EDGE}" stroke-width="1"/>` +
    `<ellipse cx="${n(cx)}" cy="${n(y)}" rx="${n(r * 0.2)}" ry="${n(r * 0.62)}" fill="none" stroke="${GEAR}" stroke-width="1" opacity="0.7"/>`;
  return (
    `<line x1="${n(lx)}" y1="${n(y)}" x2="${n(rx)}" y2="${n(y)}" stroke="${GEAR}" stroke-width="2.8" stroke-linecap="round"/>` +
    // Collars inboard of each plate, against the knurling.
    `<rect x="${n(left[0] - sleeve * 0.45)}" y="${n(y - 2.4)}" width="3" height="4.8" rx="1.1" fill="${GEAR_DARK}"/>` +
    `<rect x="${n(right[0] + sleeve * 0.45 - 3)}" y="${n(y - 2.4)}" width="3" height="4.8" rx="1.1" fill="${GEAR_DARK}"/>` +
    plate(lx + r * 0.34) +
    plate(rx - r * 0.34)
  );
}

/**
 * A dumbbell, end-on at each grip.
 *
 * End-on is what a front view actually sees, not a shortcut: with the
 * palm down through a lateral raise the handle runs front-to-back —
 * into the screen — so only the near bell face shows. Angling the
 * handle to reveal both bells is the same depth cheat declined for the
 * profile barbell's far plate. The disc borrows the plate family's
 * construction (face, rim, hub) at a smaller radius so held gear reads
 * as one language, and the near bell draws OVER the fist because it is
 * nearer the camera than the fingers wrapping the handle's middle.
 */
export function dumbbell(hands: Pt[], bellR: number): string {
  const r = bellR;
  return hands
    .map(
      ([x, y]) =>
        `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${GEAR_DARK}" stroke="${GEAR_EDGE}" stroke-width="1"/>` +
        `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.58)}" fill="none" stroke="${GEAR}" stroke-width="1.1" opacity="0.7"/>` +
        `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.24)}" fill="${GEAR}"/>`
    )
    .join("");
}

/**
 * Goblet dumbbell — held vertically, so the profile shows both heads
 * stacked with the handle between them. The HANDLE goes in the behind
 * layer (the hands wrap it), the heads in front (the top one is what
 * the palms cup, the bottom one hangs clear beneath the fists).
 */
export const GOBLET_HEAD_W = 11;
export const GOBLET_HEAD_H = 5;
export const GOBLET_HEAD_DY = 7;
export function gobletDumbbell(hand: Pt): PropLayers {
  const [x, y] = hand;
  const head = (cy: number) =>
    `<rect x="${n(x - GOBLET_HEAD_W / 2)}" y="${n(cy - GOBLET_HEAD_H / 2)}" width="${n(GOBLET_HEAD_W)}" height="${n(GOBLET_HEAD_H)}" rx="2.4" fill="${GEAR_DARK}" stroke="${GEAR_EDGE}" stroke-width="0.9"/>` +
    `<rect x="${n(x - GOBLET_HEAD_W / 2 + 2)}" y="${n(cy - 0.7)}" width="${n(GOBLET_HEAD_W - 4)}" height="1.4" rx="0.7" fill="${GEAR}" opacity="0.7"/>`;
  return {
    behind: `<rect x="${n(x - 1.3)}" y="${n(y - GOBLET_HEAD_DY)}" width="2.6" height="${n(GOBLET_HEAD_DY * 2)}" rx="1" fill="${GEAR}"/>`,
    front: head(y - GOBLET_HEAD_DY) + head(y + GOBLET_HEAD_DY),
  };
}

/**
 * Cable + rope attachment.
 *
 * Three honesty repairs over the hand-rolled version this replaces:
 *
 *  1. TWO strands, not one. The exercise's own instructions ("spreading
 *     the ends apart as your arms lock out") and its tip ("split the
 *     rope apart at the bottom") both promise a rope that separates; the
 *     single strand contradicted the copy it shipped beside.
 *  2. The tails hang under GRAVITY. They used to extend colinearly with
 *     the cable — rigid-rod behaviour, so at the folded start they stuck
 *     out forwards instead of dropping past the grip.
 *  3. Enough size to read as rope rather than as the cable getting
 *     slightly thicker before it stops.
 *
 * The lateral split is kept MODEST on purpose. Spreading a rope at
 * lockout is mostly a frontal-plane action, which a true profile shows
 * almost edge-on; the far strand is dimmed to `GEAR_FAR` on the same
 * convention the profile rig already uses for far limbs, rather than
 * faking a wide separation the camera could not see.
 */
export function ropeAttachment(pulley: Pt, hand: Pt, spread: number): string {
  const dx = hand[0] - pulley[0];
  const dy = hand[1] - pulley[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  // Yoke: where the cable's clip meets the rope, just above the grip.
  const yoke: Pt = [hand[0] - ux * 9, hand[1] - uy * 9];
  // Strand separation and tail splay both open toward lockout.
  const sep = 1.6 + 2.2 * spread;
  const splay = 1.4 + 3.6 * spread;
  const tailLen = 13;
  // Strands fan PERPENDICULAR to the pull axis. Offsetting them on
  // screen-x instead put the two grips either side of a yoke that sits
  // off-axis from the hand, so the strands crossed into an X over the
  // thigh at lockout — a scribble, not a rope.
  const px = -uy;
  const py = ux;

  const strand = (side: -1 | 1, colour: string) => {
    const gx = hand[0] + side * sep * px;
    const gy = hand[1] + side * sep * py;
    // Tail falls from the grip: straight down (gravity), drifting out
    // with the spread.
    const tx = gx + side * splay;
    const ty = gy + tailLen;
    return (
      `<line x1="${n(yoke[0])}" y1="${n(yoke[1])}" x2="${n(gx)}" y2="${n(gy)}" stroke="${colour}" stroke-width="3.2" stroke-linecap="round"/>` +
      `<line x1="${n(gx)}" y1="${n(gy)}" x2="${n(tx)}" y2="${n(ty)}" stroke="${colour}" stroke-width="2.8" stroke-linecap="round"/>` +
      `<circle cx="${n(tx)}" cy="${n(ty)}" r="2.4" fill="${colour}"/>`
    );
  };

  return (
    `<line x1="${n(pulley[0])}" y1="${n(pulley[1])}" x2="${n(yoke[0])}" y2="${n(yoke[1])}" stroke="${GEAR}" stroke-width="1.1"/>` +
    `<circle cx="${n(pulley[0])}" cy="${n(pulley[1] + 2)}" r="3.2" fill="${GEAR_DARK}" stroke="${GEAR_EDGE}" stroke-width="0.8"/>` +
    // Far strand first so the near one overlaps it. The near strand
    // takes the LIGHTER tone: it spends most of the arc over the dark
    // stage rather than over the body, where GEAR_DARK disappeared.
    strand(-1, GEAR_FAR) +
    `<rect x="${n(yoke[0] - 2.6)}" y="${n(yoke[1] - 2)}" width="5.2" height="4" rx="1.4" fill="${GEAR}"/>` +
    strand(1, GEAR)
  );
}

/**
 * Cable + handle, end-on.
 *
 * The rope attachment's cable and pulley block, with a plain grip at
 * the hand instead of the two strands: a collar where the cable clips
 * on, then the handle's end seen along its own axis — a disc with a
 * hub, the same construction the profile barbell uses for "this is a
 * bar coming AT you". Straight bar, V-grip and D-handle all present
 * this picture side-on, which is why there is one builder and not
 * three. The pulley can sit anywhere: low for a curl, high for a
 * pulldown, at face height for a face pull, at chest height for a row.
 */
export function cableHandle(pulley: Pt, hand: Pt): string {
  const dx = hand[0] - pulley[0];
  const dy = hand[1] - pulley[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Clip: where the cable meets the handle, just short of the grip.
  const clip: Pt = [hand[0] - ux * 6, hand[1] - uy * 6];
  return (
    `<line x1="${n(pulley[0])}" y1="${n(pulley[1])}" x2="${n(clip[0])}" y2="${n(clip[1])}" stroke="${GEAR}" stroke-width="1.1"/>` +
    `<circle cx="${n(pulley[0])}" cy="${n(pulley[1])}" r="3.2" fill="${GEAR_DARK}" stroke="${GEAR_EDGE}" stroke-width="0.8"/>` +
    `<rect x="${n(clip[0] - 2.2)}" y="${n(clip[1] - 2.2)}" width="4.4" height="4.4" rx="1.3" fill="${GEAR}" transform="rotate(${(Math.atan2(uy, ux) * 180) / Math.PI} ${n(clip[0])} ${n(clip[1])})"/>` +
    `<circle cx="${n(hand[0])}" cy="${n(hand[1])}" r="3.4" fill="${GEAR}" stroke="${GEAR_EDGE}" stroke-width="0.8"/>` +
    `<circle cx="${n(hand[0])}" cy="${n(hand[1])}" r="1.2" fill="${GEAR_DARK}"/>`
  );
}

/* ── Resolver ─────────────────────────────────────────────────── */

/** Render a prop into its two layers. Pure: same state → same SVG. */
export function renderProp(state: PropState): PropLayers {
  switch (state.kind) {
    case "rigidBar": {
      if (state.view === "profile") {
        return {
          behind: "",
          front: profileBarbell(state.hand, state.plateR, state.sleeveDir ?? 1),
        };
      }
      const svg = frontalBarbell(state.left, state.right, state.plateR);
      return state.layer === "behind"
        ? { behind: svg, front: "" }
        : { behind: "", front: svg };
    }

    case "dumbbell":
      return { behind: "", front: dumbbell(state.hands, state.bellR) };

    case "gobletDumbbell":
      return gobletDumbbell(state.hand);

    case "ropeAttachment":
      return {
        behind: "",
        front: ropeAttachment(state.pulley, state.hand, state.spread),
      };

    case "cableHandle":
      return { behind: "", front: cableHandle(state.pulley, state.hand) };

    case "fixedBar": {
      // Ceiling-mounted: two stems from the frame top down to the bar,
      // then the bar spanning the scene.
      const stem = (x: number) =>
        `<line x1="${x}" y1="${state.frameY}" x2="${x}" y2="${n(state.left[1])}" stroke="${GEAR_DARK}" stroke-width="2.2"/>`;
      return {
        behind:
          stem(0) +
          stem(100) +
          `<line x1="${n(state.left[0])}" y1="${n(state.left[1])}" x2="${n(state.right[0])}" y2="${n(state.right[1])}" stroke="${GEAR}" stroke-width="3.2" stroke-linecap="round"/>`,
        front: "",
      };
    }

    case "cableBar": {
      const midX = (state.left[0] + state.right[0]) / 2;
      const y = (state.left[1] + state.right[1]) / 2;
      const machine =
        `<rect x="${n(midX - 3.4)}" y="${state.frameY + 1}" width="6.8" height="6.4" rx="2" fill="${GEAR_DARK}" stroke="${GEAR_EDGE}" stroke-width="0.8"/>` +
        `<line x1="${n(midX)}" y1="${state.frameY + 6}" x2="${n(midX)}" y2="${n(y)}" stroke="${GEAR_DARK}" stroke-width="1.4"/>`;
      const bar = `<line x1="${n(state.left[0])}" y1="${n(y)}" x2="${n(state.right[0])}" y2="${n(y)}" stroke="${GEAR}" stroke-width="2.8" stroke-linecap="round"/>`;
      return { behind: machine + bar, front: "" };
    }

    case "dipBars": {
      // A dip STATION, not two floating lines: each upright gets a base
      // foot on the floor and a tube end-cap at the grip.
      const floor = state.floorY - 1;
      const post = ([x, y]: Pt) =>
        `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x)}" y2="${n(floor)}" stroke="${GEAR}" stroke-width="2.6"/>` +
        `<line x1="${n(x - 7)}" y1="${n(floor)}" x2="${n(x + 7)}" y2="${n(floor)}" stroke="${GEAR_DARK}" stroke-width="2.4" stroke-linecap="round"/>` +
        `<circle cx="${n(x)}" cy="${n(y)}" r="2.8" fill="${GEAR_DARK}" stroke="${GEAR_EDGE}" stroke-width="0.9"/>`;
      return { behind: post(state.left) + post(state.right), front: "" };
    }

    default:
      return EMPTY;
  }
}
