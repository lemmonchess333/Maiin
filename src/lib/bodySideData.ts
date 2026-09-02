/**
 * Side-view (profile) body for the exercise demos.
 *
 * CONSTRUCTED, not hand-drawn. Earlier passes hand-placed every facet
 * vertex and read as wobbly programmer-art next to the vendored figure
 * (product owner: proportions weird, facet shapes weird). The vendored
 * art's signature is PRECISION — parallel gaps, deliberate edges — so
 * this file defines each piece as BACK/FRONT contour polylines plus cut
 * fractions, and GENERATES the facets between them with exact uniform
 * insets (0.6 per side → 1.2-unit gaps, ~2-unit row gaps). Proportions
 * live in the contours; crispness is by construction.
 *
 * Rig architecture (unchanged): each piece paints a stage-coloured
 * UNDERLAY (its silhouette) and its muscle FACETS on top — the underlay
 * shows through as the gaps (identical language to the vendored mosaic
 * on the dark stage) and keeps overlaps opaque so joints never crack
 * under rotation.
 *
 * The figure faces RIGHT. The contours below are AUTHORED on the vendored
 * figure's landmark rows (shoulder ≈45, elbow ≈71, hip ≈100, knee ≈152,
 * ankle ≈193) and then RE-ROWED to anthropometric proportions at module
 * load (see "Proportion re-row" at the bottom: shoulder 38, elbow 74,
 * wrist 105, hip 96, knee 145) — the 2026-09-02 mechanics audit measured
 * the authored rows against a 200-unit human and found the shoulder 9
 * low, the upper arm ~31% short and the shin ~16% short. Facet muscle
 * names reuse the library vocabulary so demo tints and glow work
 * unchanged; profile-only parts ("pelvis", "shin", "foot", "jaw") are
 * never tinted.
 *
 * Paint order (fixed): far leg → far arm → near leg → head → torso →
 * forearm → upper arm → hand. Legs tuck under the torso, the elbow
 * tucks under the upper arm, the near arm reads in front of the torso
 * and the far arm only ever behind it — exactly how a profile layers.
 */

import type { GroupName } from "./bodyTypes";

type Pt = [number, number];
/** Contour sample: [y, x]. */
type C = [number, number][];

export interface SidePiece {
  group: GroupName;
  /** Piece silhouette — painted in the stage colour as the underlay. */
  outline: Pt[];
  /** Muscle facets painted over the underlay; the visible mosaic. */
  facets: { muscle: string; points: Pt[] }[];
  /** Far-side limb: rendered first and ~12% darker so overlaps read. */
  far?: boolean;
  /** Depth offset applied AFTER the pose, in world units.
   *
   *  It has to be post-pose. Baked into the authored points it rides the
   *  limb's own rotation, so on a curl — where the arm swings through
   *  ~120 degrees — "back and down" became forward-and-up and the far arm
   *  surfaced IN FRONT of the near one. A depth cue is a fact about the
   *  camera, not about the limb, so it is constant on screen. */
  depthShift?: Pt;
}

/* ── Facet construction ──────────────────────────────────────────── */

const GAP = 0.45; // per-side inset → 0.9-unit seams (was 1.2: "the black
// space between the body looks odd", owner device review 2026-09-02)

function xAt(contour: C, y: number): number {
  if (y <= contour[0][0]) return contour[0][1];
  for (let i = 1; i < contour.length; i++) {
    const [y1, x1] = contour[i - 1];
    const [y2, x2] = contour[i];
    if (y <= y2) return x1 + ((x2 - x1) * (y - y1)) / (y2 - y1);
  }
  return contour[contour.length - 1][1];
}

/** Facet between the back/front contours from yTop..yBot, spanning the
 *  cut fractions tL..tR (0 = back contour, 1 = front contour), edges
 *  inset by GAP. Vertical edges sample the contours so facets follow
 *  the body's curves.
 *
 *  Straight cuts and horizontal rows read ROBOTIC (product owner), so
 *  facets can carry organic shape:
 *  - bellyL/bellyR bow a CUT edge outward at the muscle's mid-length
 *    (fraction of local depth, sinusoidal — a muscle belly);
 *  - skewT/skewB tilt the top/bottom boundary ([back-edge dy,
 *    front-edge dy]) so joints run diagonally like real muscle lines. */
function band(
  B: C,
  F: C,
  yTop: number,
  yBot: number,
  tL: number,
  tR: number,
  o?: {
    bellyL?: number;
    bellyR?: number;
    skewT?: [number, number];
    skewB?: [number, number];
  }
): Pt[] {
  const at = (y: number, t: number) => {
    const b = xAt(B, y);
    return b + t * (xAt(F, y) - b);
  };
  const edge = (
    t: number,
    onContour: boolean,
    belly: number,
    sign: 1 | -1,
    dyT: number,
    dyB: number
  ) => {
    const y0 = yTop + dyT;
    const y1 = yBot + dyB;
    const steps = Math.max(1, Math.round((y1 - y0) / 3));
    const pts: Pt[] = [];
    for (let i = 0; i <= steps; i++) {
      const y = y0 + ((y1 - y0) * i) / steps;
      const u = (y - y0) / (y1 - y0);
      const tb = t + belly * Math.sin(Math.PI * u);
      const x =
        (onContour ? (sign === 1 ? xAt(F, y) : xAt(B, y)) : at(y, tb)) +
        sign * -GAP;
      pts.push([x, y]);
    }
    return pts;
  };
  const [sTl, sTr] = o?.skewT ?? [0, 0];
  const [sBl, sBr] = o?.skewB ?? [0, 0];
  return [
    ...edge(tR, tR === 1, o?.bellyR ?? 0, 1, sTr, sBr),
    ...edge(tL, tL === 0, o?.bellyL ?? 0, -1, sTl, sBl).reverse(),
  ];
}

/** Piece silhouette from its contours (back edge down, front edge up). */
function silhouette(B: C, F: C): Pt[] {
  return [
    ...B.map(([y, x]) => [x, y] as Pt),
    ...[...F].reverse().map(([y, x]) => [x, y] as Pt),
  ];
}

/* ── Contour smoothing ─────────────────────────────────────────── *
 * Authored contours are sparse (6-11 rows). Drawn straight between
 * rows they read as cut from card — a flat skull, a pointed chest, a
 * hexagonal calf ("some solid ones are too sharp", owner device review
 * 2026-09-02). Every contour is resampled through a Catmull-Rom cubic
 * (x as a function of y) at ~2.5-unit steps before it is used, so the
 * authored rows are still the truth and everything between them is a
 * curve. Facet cut edges sample the same smoothed contours, so seams
 * follow the rounded silhouette instead of chording across it. */
function smoothC(c: C, step = 2.5): C {
  const n = c.length;
  if (n < 3) return c;
  const slope = (i: number) => {
    const a = c[Math.max(0, i - 1)];
    const b = c[Math.min(n - 1, i + 1)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  };
  const out: C = [];
  for (let i = 0; i < n - 1; i++) {
    const [y0, x0] = c[i];
    const [y1, x1] = c[i + 1];
    const h = y1 - y0;
    const m0 = slope(i) * h;
    const m1 = slope(i + 1) * h;
    const k = Math.max(1, Math.round(h / step));
    for (let j = 0; j < k; j++) {
      const u = j / k;
      const u2 = u * u;
      const u3 = u2 * u;
      const x =
        (2 * u3 - 3 * u2 + 1) * x0 +
        (u3 - 2 * u2 + u) * m0 +
        (-2 * u3 + 3 * u2) * x1 +
        (u3 - u2) * m1;
      out.push([y0 + h * u, x]);
    }
  }
  out.push(c[n - 1]);
  return out;
}

/* ── Contours (the proportions live here) ────────────────────────── */

/* Torso: strong trap slope, an anatomically PLACED pec, a lumbar curve,
 * and a tight glute that creases at ~110.
 *
 * The chest has now been wrong twice in opposite directions, so the
 * placement is measured rather than judged. Two things decide whether a
 * profile chest reads as a pec:
 *
 * WHERE. The forward-most point of the chest is the NIPPLE line. Read
 * off reference photography against the rig's OWN two anchors rather
 * than off a stature fraction, it sits 24% of the way from shoulder to
 * hip — rendered y 52 on a figure whose shoulder is 38 and hip 96, so
 * authored (this file is pre-remap) y 58. Both of the earlier attempts
 * were wide of it in opposite directions: authored 43 put the mass under
 * the collarbone ("what person's chest is high up"), and 64 dropped it
 * far enough to read as a gut. Below the clavicle a real chest is
 * slightly HOLLOW; it builds gradually and peaks at the nipple.
 *
 * HOW DEEP. Chest depth was 27 units on a 59-unit trunk — a 2.2 ratio,
 * a barrel. Reference photography runs nearer 2.5, so the front contour
 * sits ~2 units back of the previous pass: 25.2 deep at the nipple
 * against 18.8 at the waist, which keeps the 1.34 chest-to-waist
 * contrast that makes a chest read as a chest.
 *
 * WHAT HAPPENS UNDER IT. A breast is a smooth arc: it bulges, peaks, and
 * rounds away, and any contour shaped like that reads as one wherever it
 * is placed — which is why moving the apex alone did not fix this. A pec
 * ENDS. Its lower border is a corner, and under that corner the trunk
 * steps back and runs slightly HOLLOW over the upper abdomen before the
 * belly fills again. So the contour falls 3.9 units in the 6 below the
 * apex (63.0 at y 61 to 58.9 at y 70), flattens through the hollow, and
 * lifts 0.2 at y 83. The seam under the pec is the facet border; this
 * corner is the silhouette, and the silhouette is what the eye reads. */
const TORSO_B: C = smoothC([
  [30, 44.5],
  [36, 39.6],
  [44, 37],
  [54, 35.8],
  [64, 36.4],
  [74, 38],
  [82, 37.8],
  [90, 34.6],
]);
const TORSO_F: C = smoothC([
  [31, 48.5],
  [36, 51.4],
  [41, 54.4],
  [46, 57.4],
  [50, 59.6],
  [54, 60.9],
  [57, 61.4],
  [61, 61.0],
  [64, 60.0],
  [67, 58.3],
  [70, 57.3],
  [74, 56.8],
  [78, 56.7],
  [83, 56.9],
  [88, 56.0],
  [94, 54.6],
]);

/* Pelvis segment (split from the upper torso so hinges and bridges can
 * articulate at the waist): the glute mass + hip wedge, overlapping the
 * upper torso at the lumbar joint (y 86-94).
 *
 * The torso paints OVER this piece, so wherever the torso's outline ends
 * its 0.45 inset shows as a dark rim ON the buttock. Ending both torso
 * contours at y 94 put that rim across the glute as a straight
 * horizontal line, cutting it in two. The torso's BACK contour now stops
 * at 90, which tilts the closing edge into the iliac-crest diagonal —
 * high at the back, low at the front, where a crease belongs — and the
 * lower-back and flank facets run past it to 93.2, so they cover the rim
 * rather than leaving it visible. */
const PELV_B: C = smoothC([
  [86, 35.9],
  [90, 33.8],
  [97, 29.8],
  [104, 29.2],
  [108, 31.4],
  [111, 34.8],
  [113, 39.8],
  [114, 44.5],
]);
const PELV_F: C = smoothC([
  [86, 56.6],
  [96, 54],
  [103, 50.4],
  [109, 46.5],
  [112.5, 44.8],
]);

/* Thigh: quad sweep peaking mid-thigh, hamstring belly behind.
 *
 * The back contour used to start at x 43.5 while the glute above it
 * reaches 29.8 — a 14-unit overhang, so the buttock read as a shelf
 * bolted to the back of the leg rather than as mass flowing into the
 * hamstring. It starts at 37.2 now, which leaves the 4-6 units that a
 * standing buttock actually projects behind the thigh, and the gluteal
 * fold (the pelvis outline's bottom edge, sweeping forward to 44.5)
 * still reads as the crease it is.
 *
 * It also ends at 152 while the front runs to 156, for the same reason
 * the torso's back stops short of its front: the thigh paints over the
 * shank, so a level bottom edge laid its inset rim across the knee as a
 * straight dark bar. Tilted, the edge is the knee line — popliteal fold
 * high at the back, patella low at the front — and the kneecap facet
 * runs past it to cover the rim.
 *
 * Its bottom is also a DOME about the knee pivot, for the same reason
 * the shank's top is. A squat swings this piece 78 degrees about that
 * pivot, and its bottom-front corner sat 5.5 forward and 4 below — a
 * 6.8-unit radius that came out from under the shank as a sharp point
 * (owner: "knee looks a little pointy"). Both contours now arc inward
 * below y 147 and meet in a chord from (46.0, 152.6) to (53.6, 155.4):
 * nothing further than 5 units from the pivot, no corner for a rotation
 * to expose, and the chord still TILTS 2.8 so it reads as the popliteal
 * crease rather than a level cut. */
const THIGH_B: C = smoothC([
  [97, 37.2],
  [104, 36.4],
  [110, 37.6],
  [116, 39.0],
  [128, 39.4],
  [140, 41.4],
  [147, 43.6],
  [152.6, 46.0],
]);
const THIGH_F: C = smoothC([
  [95.5, 52.5],
  [103, 57.8],
  [112, 60.6],
  [124, 60.2],
  [138, 57.4],
  [146, 56.2],
  [151, 55.0],
  [155.4, 53.6],
]);

/* Shank: gastroc bulge behind, straight shin, achilles taper.
 *
 * Both contours now START at y 152 — the knee pivot's own row — and
 * narrow toward it, so the top of the shank is a chord through the
 * pivot rather than a pair of corners above it. It used to start at
 * 148.5/150 spanning x 41.6-54.2, which put the front corner 4.2 forward
 * of the pivot and 3.5 ABOVE it: a 5.5-unit radius. The thigh hides that
 * standing, but a squat swings the thigh 78 degrees about the same pivot
 * and the corner comes out from under it as a spike (owner: "knee looks
 * a little pointy and misaligned with the calf"). At the pivot's row
 * nothing projects above it, and the chord's midpoint is 49.6 against a
 * pivot at 50, so the shank is centred under the knee instead of sitting
 * 2 units behind it.
 *
 * The top is a DOME about that pivot rather than a flat chord: both
 * contours arc inward above y 152 and meet in a 3.2-wide chord at 148.8,
 * so every point on the silhouette's top is within 4 units of the pivot
 * and there is no corner for a rotation to expose. A chord alone still
 * left a 90-degree corner where the front contour turned — which is what
 * a condyle is for. */
const SHANK_B: C = smoothC([
  [148.8, 48.4],
  [150.6, 46.4],
  [152, 45.2],
  [158, 41.4],
  [166, 38.6],
  [176, 40.2],
  [186, 43.2],
  [192, 44.5],
]);
const SHANK_F: C = smoothC([
  [148.8, 51.6],
  [150.6, 53.2],
  [152, 54.0],
  [160, 52.6],
  [170, 51.5],
  [182, 50.2],
  [191, 49.6],
]);

/* Upper arm: round delt cap, a biceps/triceps belly (~11 deep at
 * mid-length) tapering to the elbow. Owner review 2026-09-02: "arms
 * could be more muscular" — the previous columns were a uniform 9. */
const ARM_B: C = smoothC([
  [37.5, 42],
  [42, 40.4],
  [48, 41.2],
  [54, 42.6],
  [60, 43.8],
  [66, 44.9],
  [71.5, 45.6],
]);
const ARM_F: C = smoothC([
  [37.5, 51.5],
  [42, 53.0],
  [48, 52.8],
  [54, 53.6],
  [60, 53.2],
  [66, 52.6],
  [71.5, 51.9],
]);

/* Forearm: brachioradialis belly just below the elbow, then the taper
 * to the wrist. */
const FORE_B: C = smoothC([
  [67.8, 45.2],
  [74, 45.4],
  [82, 46.0],
  [90, 46.8],
  [100.6, 48.0],
]);
const FORE_F: C = smoothC([
  [67.6, 52.3],
  [74, 53.8],
  [82, 53.9],
  [90, 53.0],
  [100.4, 52.5],
]);

/* ── Pieces ──────────────────────────────────────────────────────── */

const FOOT: Pt[] = [
  [44.2, 192.6],
  [49.8, 191.6],
  [55, 194],
  [60.2, 197.4],
  [64.2, 199.8],
  [63.6, 202.2],
  [42.8, 202.4],
  [40.9, 198.6],
  [41.8, 194.4],
];

/* Back contour down, round the heel and sole to the toe, back along the
 * instep, then UP the front contour. It used to be the back contour plus
 * the foot and nothing else — `silhouette(...).slice(0, 6)` kept only the
 * back half — so the piece's outline closed as a vertical line up the
 * calf and the whole shin lay OUTSIDE its own underlay. The facets still
 * drew (they are painted over it, not clipped by it), which is why the
 * leg looked fine until a seam wanted a groove behind it. */
const SHANK_OUTLINE: Pt[] = [
  ...SHANK_B.map(([y, x]) => [x, y] as Pt),
  [41.4, 193.6],
  [40.2, 198.4],
  [42.2, 203],
  [64.2, 202.8],
  [65, 199.6],
  [60.8, 196.8],
  [55.4, 193.4],
  [49.8, 191],
  ...[...SHANK_F].reverse().map(([y, x]) => [x, y] as Pt),
];
/* Facet-count discipline (device feedback 2026-07-27: "too many
 * individualized body parts"): at the card's 190px width every extra
 * seam reads as a crack in the figure, so a row split only earns its
 * place when it follows a REAL muscle boundary. The arbitrary
 * mid-length splits (calves gastroc/soleus row, abs/obliques second
 * row, forearm halves) are merged into single bellies below. */
const SHANK_FACETS = [
  /* The calf/shin split is the tibial crest, so a seam there is real —
     but at t 0.47/0.58 it was 0.11 of the shank's depth PLUS both insets,
     a 2.3-unit gash down the middle of the leg where every other seam on
     the figure is 0.9. Both facets also stopped 2.6 units above the
     foot, which put a dark band right across the ankle. */
  {
    muscle: "calves",
    points: band(SHANK_B, SHANK_F, 151, 192.2, 0, 0.5, { bellyR: 0.08 }),
  },
  {
    muscle: "shin",
    points: band(SHANK_B, SHANK_F, 150, 192.2, 0.55, 1, { bellyL: -0.04 }),
  },
  { muscle: "foot", points: FOOT },
];
const THIGH_FACETS = [
  {
    muscle: "quadriceps",
    points: band(THIGH_B, THIGH_F, 97.5, 144.5, 0.52, 1, {
      bellyL: -0.06,
    }),
  },
  {
    muscle: "hamstring",
    points: band(THIGH_B, THIGH_F, 101, 143, 0, 0.46, { bellyR: 0.06 }),
  },
  {
    muscle: "knees",
    /* Runs the full depth: cut to t 0.3 it left the popliteal hollow —
       13 units of underlay behind the knee — as a dark block. */
    points: band(THIGH_B, THIGH_F, 145.4, 155.4, 0, 1, {
      skewT: [-1.5, 0],
      skewB: [-2.8, 0],
    }),
  },
];

/* ── Arm pieces (shared by the near and far arm) ───────────────── */

const FORE_FACETS = [
  {
    muscle: "forearm",
    points: band(FORE_B, FORE_F, 68.4, 99.8, 0, 1),
  },
];
const UPPER_ARM_FACETS = [
  {
    muscle: "front-deltoids",
    points: band(ARM_B, ARM_F, 38, 52.4, 0, 1, { skewB: [-1.5, 1] }),
  },
  {
    /* Front/back split at the real muscle boundary, mirroring the
       thigh's quadriceps/hamstring convention — the triceps facet is
       what lets a pushdown's working-muscle emphasis render at all
       (roadmap side-topology item "triceps facet").

       Both tops parallel the deltoid's lower border, one seam under
       it. They used to sit level while that border ran diagonally, so
       the gap opened from 1.4 units at the front to 3.7 at the back —
       a wedge of underlay right across the arm, and the widest dark
       band anywhere on the figure. */
    muscle: "biceps",
    points: band(ARM_B, ARM_F, 52.9, 70.8, 0.52, 1, {
      skewT: [0, 1.2],
      bellyL: -0.05,
    }),
  },
  {
    muscle: "triceps",
    points: band(ARM_B, ARM_F, 51.6, 70, 0, 0.46, {
      skewT: [0, 1.15],
      bellyR: 0.05,
    }),
  },
];
const HAND_OUTLINE: Pt[] = [
  [46.8, 99.4],
  [52.8, 99.2],
  [54, 103.2],
  [52.8, 107.6],
  [48.8, 108.6],
  [46, 104.6],
];
const HAND_FACETS = [
  {
    muscle: "hand",
    points: [
      [47.4, 100],
      [52.2, 99.8],
      [53.4, 103.2],
      [52.2, 107],
      [49.2, 107.9],
      [46.8, 104.4],
    ] as Pt[],
  },
];

/* The FAR arm is the near arm's geometry pushed a touch back and down —
 * the depth cue a profile reads a second arm by. It is hidden inside the
 * torso silhouette while the arms hang, and shows the moment the arms
 * leave it (a curl, a bench, a hinge to the bar): a darker second arm
 * just behind the first, exactly where the eye expects one. Authored
 * space, and is applied AFTER the pose so it stays a screen-space depth
 * cue rather than rotating with the limb. */
export const FAR_ARM_SHIFT: Pt = [-2.6, 1.6];

/* The pec's lower border, as the single line every neighbour derives
 * from. It runs from the armpit (the chest facet's back cut) down to the
 * sternum, so it is a function of the cut fraction, not a row. The flank
 * and the rectus take their tops from it, which is why their seams stay
 * parallel: three facets meeting a diagonal with level borders is the
 * wedge this figure kept growing. */
const PEC_BACK_T = 0.42;
const PEC_BOTTOM_ARMPIT = 60;
const PEC_BOTTOM_STERNUM = 66;
const pecBottomAt = (t: number) =>
  PEC_BOTTOM_ARMPIT +
  ((PEC_BOTTOM_STERNUM - PEC_BOTTOM_ARMPIT) * (t - PEC_BACK_T)) /
    (1 - PEC_BACK_T);
/** One seam, in authored units (the y remap scales it to ~0.9 rendered). */
const SEAM = 0.86;

/* The skull is authored 23 units from crown to chin on a 210-unit
 * figure — 9.1 heads, where an adult is 7.5 to 8, and anthropometry puts
 * the chin at 0.87 of stature (y 27.3 here). A head that small reads as
 * wrong without a viewer being able to say why, and it makes the neck
 * look long because the neck is taking up the difference.
 *
 * Grown 17% about the crown, which moves the chin to 27 and keeps the
 * profile head's proportion intact (length/height 0.87, and a real
 * profile head is 0.83-0.87). Only points at or above the jaw scale —
 * the neck rows below y 24 stay where they are, so the neck shortens by
 * exactly what the skull gains rather than stretching with it.
 *
 * The neck's front rows came back with it. They sat at x 53-54 against a
 * chin at 50.2 — the throat projecting three units FORWARD of the jaw,
 * which is backwards (a chin projects, the throat is set behind it) and
 * cut a hard V under the jawline. They now sit just behind the chin, and
 * the back rows moved back a little so the neck is not a thin post. */
const SKULL_GROW = 1.17;
const SKULL_ORIGIN: Pt = [51.6, 0.2];
const growSkull = (pts: Pt[]): Pt[] =>
  pts.map(([x, y]) =>
    y <= 24
      ? [
          SKULL_ORIGIN[0] + (x - SKULL_ORIGIN[0]) * SKULL_GROW,
          SKULL_ORIGIN[1] + (y - SKULL_ORIGIN[1]) * SKULL_GROW,
        ]
      : [x, y]
  );

const RAW_PIECES: SidePiece[] = [
  // Far-side leg pair: same geometry, darker, painted FIRST — hidden in
  // symmetric stances, visible the moment a pose splits the legs.
  {
    group: "shankR",
    far: true,
    outline: SHANK_OUTLINE,
    facets: SHANK_FACETS,
  },
  {
    group: "thighR",
    far: true,
    outline: silhouette(THIGH_B, THIGH_F),
    facets: THIGH_FACETS,
  },
  // Far-side arm: painted behind the torso (and the near leg) so it can
  // only ever peek out from behind the body — never in front of it.
  {
    group: "foreArmR",
    far: true,
    depthShift: FAR_ARM_SHIFT,
    outline: silhouette(FORE_B, FORE_F),
    facets: FORE_FACETS,
  },
  {
    group: "upperArmR",
    far: true,
    depthShift: FAR_ARM_SHIFT,
    outline: silhouette(ARM_B, ARM_F),
    facets: UPPER_ARM_FACETS,
  },
  {
    group: "handR",
    far: true,
    depthShift: FAR_ARM_SHIFT,
    outline: HAND_OUTLINE,
    facets: HAND_FACETS,
  },
  {
    group: "shankL",
    outline: SHANK_OUTLINE,
    facets: SHANK_FACETS,
  },
  {
    group: "thighL",
    outline: silhouette(THIGH_B, THIGH_F),
    facets: THIGH_FACETS,
  },
  {
    group: "pelvis",
    outline: silhouette(PELV_B, PELV_F),
    /* Built from the contours like every other facet. These were two
       hand-authored polygons with straight sides that did not follow the
       silhouette, so the buttock read as a slab bolted onto the leg
       rather than as mass, and their gaps against the outline were
       nothing like a seam. */
    facets: [
      {
        muscle: "gluteal",
        points: band(PELV_B, PELV_F, 88.4, 112.4, 0, 0.46, { bellyR: 0.06 }),
      },
      {
        muscle: "pelvis",
        points: band(PELV_B, PELV_F, 88.4, 110.6, 0.54, 1, { bellyL: -0.05 }),
      },
    ],
  },
  {
    /* Profile head (owner device review 2026-09-02: "the head shape is
     * odd"). The cranium is 14 samples of an ellipse (centre 51.6/10.6,
     * 8.9 × 10.4) from the jaw hinge over the crown to the brow, then a
     * brow ridge, nose, lips and chin, and a jaw line back to the neck.
     * The old outline had five straight cuts for the whole skull. */
    group: "head",
    outline: growSkull([
      [43.5, 15.0],
      [42.8, 12.4],
      [42.7, 9.7],
      [43.2, 7.0],
      [44.3, 4.6],
      [45.9, 2.6],
      [47.8, 1.2],
      [50.1, 0.4],
      [52.4, 0.2],
      [54.6, 0.8],
      [56.7, 2.1],
      [58.4, 3.9],
      [59.7, 6.2],
      [60.4, 8.8],
      [61.0, 9.6],
      [60.6, 11.6],
      [62.2, 14.0],
      [60.8, 15.8],
      [61.2, 17.6],
      [60.2, 19.6],
      [58.6, 21.4],
      [55.4, 22.6],
      [50.4, 23.0],
      [49.8, 28.6],
      [50.4, 31.4],
      [50.0, 35.8],
      [42.6, 35.4],
      [43.4, 27.4],
      [45.4, 21.6],
      [44.0, 18.4],
    ]),
    facets: [
      {
        muscle: "head",
        points: growSkull([
          [44.0, 14.8],
          [43.3, 12.4],
          [43.2, 9.8],
          [43.7, 7.3],
          [44.7, 5.0],
          [46.2, 3.1],
          [48.0, 1.7],
          [50.2, 0.9],
          [52.4, 0.7],
          [54.5, 1.3],
          [56.5, 2.6],
          [58.1, 4.3],
          [59.3, 6.5],
          [59.9, 9.0],
          [60.5, 9.7],
          [60.1, 11.6],
          [61.7, 13.9],
          [60.3, 15.6],
          [60.7, 17.3],
          [59.8, 19.2],
          [58.3, 20.9],
          [55.2, 22.1],
          [50.5, 21.9],
          [45.7, 21.1],
          [44.4, 18.1],
        ]),
      },
      {
        muscle: "neck",
        // Top-back corner tucks up under the skull so no underlay
        // triangle shows at the nape.
        points: growSkull([
          [45.8, 21.9],
          [52.6, 22.6],
          [49.2, 29.4],
          [49.2, 34.8],
          [43.2, 35.2],
          [44.1, 28.2],
        ]),
      },
    ],
  },
  {
    group: "torso",
    outline: silhouette(TORSO_B, TORSO_F),
    facets: [
      /* Down to the clavicle: the chest now starts at the shoulder line
         rather than at the neck, and the gap between them was 4 rendered
         units of bare underlay across the upper chest. */
      { muscle: "trapezius", points: band(TORSO_B, TORSO_F, 30.5, 44, 0, 1) },
      {
        muscle: "chest",
        /* Lower border skewed only gently: with the front contour
         * receding below the pec, a 2-unit front drop met the curve in
         * a spike ("the chest is too pointy"). */
        points: band(TORSO_B, TORSO_F, 45, PEC_BOTTOM_STERNUM, PEC_BACK_T, 1, {
          bellyL: -0.05,
          skewB: [PEC_BOTTOM_ARMPIT - PEC_BOTTOM_STERNUM, 0],
        }),
      },
      /* The flank runs UP to the pec's lower border, and is painted
       * BEFORE the upper back so the lat still reads full behind it.
       * The pec's border is a diagonal — low at the sternum, high at the
       * armpit — while the lat reaches to y 65, so the region below the
       * pec and in front of the lat is a triangle no straight-topped
       * facet could reach. It rendered as bare underlay: the dark wedge
       * in the middle of the trunk on device. The flank's top edge now
       * runs parallel to the pec border, one seam under it. */
      {
        muscle: "obliques",
        points: band(
          TORSO_B,
          TORSO_F,
          pecBottomAt(0.3) + SEAM,
          93.2,
          0.3,
          0.78,
          {
            skewT: [0, pecBottomAt(0.78) - pecBottomAt(0.3)],
            bellyR: 0.03,
          }
        ),
      },
      {
        muscle: "upper-back",
        points: band(TORSO_B, TORSO_F, 45, 67.2, 0, 0.4, {
          bellyR: 0.04,
          skewB: [2, -2],
        }),
      },
      /* All three lower-trunk facets run to 93.2 — within a seam of the
       * torso outline's bottom (94). They stopped at 88-90, and since the
       * torso paints OVER the pelvis, that 4-6 unit strip of underlay was
       * the thick dark band across the waist on device. */
      /* Lower trunk in profile (owner review 2026-09-02: "split into
       * three sections of the abdominal — is this accurate?"). Three
       * regions IS what a profile shows — rectus at the front, the
       * obliques as the visible flank, erectors at the back — but they
       * were cut in equal thirds, which reads as ribs on a robot. The
       * rectus is a thin front strip (~22% of trunk depth), the
       * obliques are most of the flank (~48%), the erectors the rest. */
      {
        muscle: "abs",
        points: band(
          TORSO_B,
          TORSO_F,
          pecBottomAt(0.78) + SEAM,
          93.2,
          0.78,
          1,
          {
            skewT: [0, pecBottomAt(1) - pecBottomAt(0.78)],
          }
        ),
      },
      {
        muscle: "lower-back",
        /* Top follows the lat's lower border, one seam under it. Flat
           against a border that fell 3 units across the facet left a
           wedge of underlay above the kidney. */
        points: band(TORSO_B, TORSO_F, 70.1, 93.2, 0, 0.3, {
          skewT: [0, -3],
        }),
      },
    ],
  },
  {
    group: "foreArmL",
    outline: silhouette(FORE_B, FORE_F),
    facets: FORE_FACETS,
  },
  {
    group: "upperArmL",
    outline: silhouette(ARM_B, ARM_F),
    facets: UPPER_ARM_FACETS,
  },
  {
    // Compact mitt (≤ half head-width), articulated from the forearm at
    // the wrist pivot. Rides the forearm chain in every pose.
    group: "handL",
    outline: HAND_OUTLINE,
    facets: HAND_FACETS,
  },
];

/* ── Proportion re-row (2026-09-02) ─────────────────────────────────
 * Two monotonic piecewise-linear y-remaps, applied to every authored
 * point at module load. The BODY chain (head, torso, pelvis, legs, feet)
 * and the ARM chain (upper arm, forearm, hand) are remapped separately
 * because the arm hangs from the shoulder row and has its own lengths.
 * Authored → re-rowed landmarks (200-unit figure, anthropometric norms
 * in brackets): shoulder 45→38 [36], hip 100.5→96 [94], knee 152→145
 * [143], ankle 193 [192]; elbow 70.5→74 [74], wrist 100→105 [106]. So
 * the upper arm goes 25.5→36 [37], the shin 41→48 [49], the thigh
 * 52→49.6 [49], and the neck loses the 7 units that read as a mannequin.
 * Applying the remap to the generated polygons (rather than to the
 * authored rows) keeps every facet's construction intact; the remap is
 * linear inside each segment, so a facet that straddles a breakpoint
 * gains only a sub-unit kink. */
function piecewise(pts: [number, number][]): (y: number) => number {
  return (y: number) => {
    if (y <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const [y0, v0] = pts[i - 1];
      const [y1, v1] = pts[i];
      if (y <= y1) return v0 + ((v1 - v0) * (y - y0)) / (y1 - y0);
    }
    return pts[pts.length - 1][1];
  };
}
const BODY_Y = piecewise([
  [0, 0],
  [30, 30],
  [45, 38],
  [100.5, 96],
  [152, 145],
  [193, 193],
  [210, 210],
]);
const ARM_Y = piecewise([
  [0, 0],
  [37.5, 31],
  [70.5, 74],
  [100, 105],
  [120, 125],
]);
const ARM_GROUPS: ReadonlySet<GroupName> = new Set<GroupName>([
  "upperArmL",
  "foreArmL",
  "handL",
  "upperArmR",
  "foreArmR",
  "handR",
]);
function reRow(piece: SidePiece): SidePiece {
  const f = ARM_GROUPS.has(piece.group) ? ARM_Y : BODY_Y;
  const map = (pts: Pt[]) => pts.map(([x, y]) => [x, f(y)] as Pt);
  return {
    ...piece,
    outline: map(piece.outline),
    facets: piece.facets.map((fc) => ({
      muscle: fc.muscle,
      points: map(fc.points),
    })),
  };
}

export const SIDE_PIECES: SidePiece[] = RAW_PIECES.map(reRow);

/* Measured joint anchors for the side rig — authored rows passed through
 * the same remaps as the art they sit in. */
export const SIDE_ANCHORS = {
  neck: [48, BODY_Y(32)] as Pt,
  lumbar: [45, BODY_Y(90)] as Pt,
  shoulder: [47.5, BODY_Y(45)] as Pt,
  elbow: [48.6, ARM_Y(70.5)] as Pt,
  hand: [50.3, ARM_Y(100)] as Pt,
  hip: [42, BODY_Y(100.5)] as Pt,
  knee: [50, BODY_Y(152)] as Pt,
  ankle: [46.6, BODY_Y(193)] as Pt,
};
