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
 * Paint order (fixed): shank → thigh → head → torso → forearm → upper
 * arm. Legs tuck under the torso, the elbow tucks under the upper arm,
 * the near arm reads in front of the torso — exactly how a profile
 * layers.
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
}

/* ── Facet construction ──────────────────────────────────────────── */

const GAP = 0.6; // per-side inset → 1.2-unit gaps, like the vendored art

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
    const steps = Math.max(1, Math.round((y1 - y0) / 8));
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

/* ── Contours (the proportions live here) ────────────────────────── */

/* Torso: strong trap slope, deep heroic chest (depth ≈29 at the pecs),
 * lumbar curve, tight glute that creases at ~110. */
const TORSO_B: C = [
  [30, 44.5],
  [36, 39.6],
  [44, 37],
  [54, 35.8],
  [64, 36.4],
  [74, 38],
  [82, 37.8],
  [90, 34.6],
  [94, 33.1],
];
const TORSO_F: C = [
  [31, 48.5],
  [33.5, 51],
  [38, 57.5],
  [42, 63.4],
  [47.5, 65.4],
  [53.5, 61.8],
  [60, 59.2],
  [70, 59.6],
  [78, 58.2],
  [88, 56.2],
  [94, 54.6],
];

/* Pelvis segment (split from the upper torso so hinges and bridges can
 * articulate at the waist): the glute mass + hip wedge, overlapping the
 * upper torso at the lumbar joint (y 86-94). */
const PELV_B: C = [
  [86, 35.9],
  [90, 33.8],
  [97, 29.8],
  [104, 29.2],
  [109, 31.8],
  [112, 36.8],
  [113.5, 43.8],
];
const PELV_F: C = [
  [86, 56.6],
  [96, 54],
  [103, 50.4],
  [109, 46.5],
  [112.5, 44.8],
];

/* Thigh: quad sweep peaking mid-thigh, hamstring belly behind. */
const THIGH_B: C = [
  [97, 43.5],
  [104, 41.2],
  [116, 39.8],
  [128, 39.6],
  [140, 41.4],
  [150, 44.4],
  [156, 45.8],
];
const THIGH_F: C = [
  [95.5, 52.5],
  [103, 57.8],
  [112, 60.6],
  [124, 60.2],
  [138, 57.6],
  [148, 55.3],
  [156, 55.5],
];

/* Shank: gastroc bulge behind, straight shin, achilles taper. */
const SHANK_B: C = [
  [150, 41.6],
  [160, 39.2],
  [168, 38.2],
  [178, 40.9],
  [186, 43.2],
  [192, 44.5],
];
const SHANK_F: C = [
  [148.5, 54.2],
  [158, 52.9],
  [170, 51.5],
  [182, 50.2],
  [191, 49.6],
];

/* Upper arm: round delt cap flowing into the bi/tri columns. */
const ARM_B: C = [
  [37.5, 42],
  [43, 40.8],
  [49, 42.2],
  [56, 43.8],
  [64, 44.4],
  [71.5, 45.4],
];
const ARM_F: C = [
  [37.5, 51.5],
  [43, 52.8],
  [49, 52.4],
  [56, 53],
  [63, 52.6],
  [71.5, 51.7],
];

/* Forearm: tapers toward the wrist. */
const FORE_B: C = [
  [67.8, 45.2],
  [76, 45.8],
  [88, 46.6],
  [100.6, 47.9],
];
const FORE_F: C = [
  [67.6, 52.3],
  [78, 53.6],
  [90, 53.2],
  [100.4, 52.6],
];

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

const SHANK_OUTLINE: Pt[] = [
  ...silhouette(SHANK_B, SHANK_F).slice(0, 6),
  // splice the foot into the silhouette bottom
  [49.8, 191],
  [55.4, 193.4],
  [60.8, 196.8],
  [65, 199.6],
  [64.2, 202.8],
  [42.2, 203],
  [40.2, 198.4],
  [41.4, 193.6],
];
/* Facet-count discipline (device feedback 2026-07-27: "too many
 * individualized body parts"): at the card's 190px width every extra
 * seam reads as a crack in the figure, so a row split only earns its
 * place when it follows a REAL muscle boundary. The arbitrary
 * mid-length splits (calves gastroc/soleus row, abs/obliques second
 * row, forearm halves) are merged into single bellies below. */
const SHANK_FACETS = [
  {
    muscle: "calves",
    points: band(SHANK_B, SHANK_F, 151, 191, 0, 0.47, { bellyR: 0.08 }),
  },
  {
    muscle: "shin",
    points: band(SHANK_B, SHANK_F, 150, 190, 0.58, 1, { bellyL: -0.04 }),
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
    points: band(THIGH_B, THIGH_F, 146.2, 155, 0.3, 0.92),
  },
];

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
    facets: [
      /* Both pelvis facets run to within the standard 1.2-unit gap of
       * the piece's outline bottom (113.5). They used to stop at 110.8
       * and 101.8, leaving a 3-unit band of underlay across the whole
       * hip that read on device as a dark seam cutting the pelvis off
       * from the thighs ("a pale block on top of the legs"). */
      {
        muscle: "gluteal",
        points: [
          [36.2, 91],
          [43.6, 90],
          [45.4, 94.6],
          [44.8, 103],
          [42.8, 112.2],
          [36.6, 112.4],
          [31.6, 106.4],
          [30.8, 97.4],
          [33, 92.8],
        ],
      },
      {
        muscle: "pelvis",
        points: [
          [49.8, 89.4],
          [55.6, 89.8],
          [53.6, 98.6],
          [50.2, 106.2],
          [46.4, 110.6],
          [45.6, 103.8],
          [46.6, 96.4],
          [47.6, 92],
        ],
      },
    ],
  },
  {
    group: "head",
    outline: [
      [44.5, 0.5],
      [52, 0],
      [58, 1.8],
      [61, 5.5],
      [62, 9],
      [61.2, 10.6],
      [63, 13],
      [61.6, 15.6],
      [60.8, 17.2],
      [60.4, 19.2],
      [56.8, 21.6],
      [50.4, 23],
      [52.8, 26],
      [53.8, 31],
      [53.2, 35.8],
      [44.2, 35.4],
      [44.8, 27],
      [45.4, 20],
      [43.6, 12],
      [43.4, 6],
    ],
    facets: [
      {
        muscle: "head",
        points: [
          [45.6, 1.6],
          [52, 1],
          [57.4, 2.6],
          [60.2, 5.9],
          [61, 9],
          [60.2, 10.7],
          [62.2, 13.2],
          [60.6, 15.4],
          [59.9, 17],
          [59.5, 18.8],
          [55.8, 20.9],
          [49.8, 21.7],
          [46.9, 19],
          [45.9, 15],
          [44.6, 10],
          [44.6, 6],
        ],
      },
      {
        muscle: "neck",
        points: [
          [45.4, 23],
          [52.6, 22.6],
          [53.6, 27],
          [53.2, 34.8],
          [44.6, 35.2],
          [45.2, 27],
        ],
      },
    ],
  },
  {
    group: "torso",
    outline: silhouette(TORSO_B, TORSO_F),
    facets: [
      { muscle: "trapezius", points: band(TORSO_B, TORSO_F, 30.5, 37, 0, 1) },
      {
        muscle: "chest",
        points: band(TORSO_B, TORSO_F, 38.5, 55.6, 0.42, 1, {
          bellyL: -0.05,
          skewB: [-1.5, 2],
        }),
      },
      {
        muscle: "upper-back",
        points: band(TORSO_B, TORSO_F, 38.5, 67.2, 0, 0.4, {
          bellyR: 0.04,
          skewB: [2, -2],
        }),
      },
      /* Lower trunk in profile (owner review 2026-09-02: "split into
       * three sections of the abdominal — is this accurate?"). Three
       * regions IS what a profile shows — rectus at the front, the
       * obliques as the visible flank, erectors at the back — but they
       * were cut in equal thirds, which reads as ribs on a robot. The
       * rectus is a thin front strip (~22% of trunk depth), the
       * obliques are most of the flank (~48%), the erectors the rest. */
      {
        muscle: "abs",
        points: band(TORSO_B, TORSO_F, 57.4, 89.5, 0.78, 1, {
          skewT: [1.2, -0.8],
        }),
      },
      {
        muscle: "obliques",
        points: band(TORSO_B, TORSO_F, 58.8, 90, 0.3, 0.78, {
          skewT: [1.5, -1.5],
          bellyR: 0.03,
        }),
      },
      {
        muscle: "lower-back",
        points: band(TORSO_B, TORSO_F, 68.8, 88.4, 0, 0.3),
      },
    ],
  },
  {
    group: "foreArmL",
    outline: silhouette(FORE_B, FORE_F),
    facets: [
      {
        muscle: "forearm",
        points: band(FORE_B, FORE_F, 68.4, 99.8, 0, 1),
      },
    ],
  },
  {
    group: "upperArmL",
    outline: silhouette(ARM_B, ARM_F),
    facets: [
      {
        muscle: "front-deltoids",
        points: band(ARM_B, ARM_F, 38, 51.8, 0, 1, { skewB: [-1.5, 1] }),
      },
      {
        /* Front/back split at the real muscle boundary, mirroring the
           thigh's quadriceps/hamstring convention — the triceps facet is
           what lets a pushdown's working-muscle emphasis render at all
           (roadmap side-topology item "triceps facet"). */
        muscle: "biceps",
        points: band(ARM_B, ARM_F, 53.2, 70.8, 0.52, 1, {
          skewT: [-1.5, 1],
          bellyL: -0.05,
        }),
      },
      {
        muscle: "triceps",
        points: band(ARM_B, ARM_F, 54, 70, 0, 0.46, { bellyR: 0.05 }),
      },
    ],
  },
  {
    // Compact mitt (≤ half head-width), articulated from the forearm at
    // the wrist pivot. Rides the forearm chain in every pose.
    group: "handL",
    outline: [
      [46.8, 99.4],
      [52.8, 99.2],
      [54, 103.2],
      [52.8, 107.6],
      [48.8, 108.6],
      [46, 104.6],
    ],
    facets: [
      {
        muscle: "hand",
        points: [
          [47.4, 100],
          [52.2, 99.8],
          [53.4, 103.2],
          [52.2, 107],
          [49.2, 107.9],
          [46.8, 104.4],
        ],
      },
    ],
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
