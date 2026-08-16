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
 * The figure faces RIGHT. Same 200-unit height and landmark rows as the
 * vendored figure (shoulder ≈45, elbow ≈71, hip ≈100, knee ≈152,
 * ankle ≈193). Facet muscle names reuse the library vocabulary so demo
 * tints and glow work unchanged; profile-only parts ("pelvis", "shin",
 * "foot", "jaw") are never tinted.
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
/* The pec is a DOME, not a dart: the old single peak sample ([47.5,
 * 65.4] between steep neighbours) rendered as a pointed breast wedge
 * in profile. Two near-equal samples flatten the crest. */
const TORSO_F: C = [
  [31, 48.5],
  [33.5, 51],
  [38, 57.5],
  [42, 62.8],
  [45.5, 64.8],
  [49.5, 64.4],
  [53.5, 62.2],
  [60, 59.2],
  [70, 59.6],
  [78, 58.2],
  [88, 56.2],
  [94, 54.6],
];

/* Pelvis segment (split from the upper torso so hinges and bridges can
 * articulate at the waist): the glute mass + hip wedge, overlapping the
 * upper torso at the lumbar joint (y 86-94). */
/* Top-rear starts a touch forward with an easing sample so the corner
 * the hinge exposes (torso rotates further than the 0.72-damped
 * pelvis) reads as a round glute shelf, not a beak. */
const PELV_B: C = [
  [86, 37.2],
  [89.5, 34.2],
  [97, 30],
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
  [154, 45.4],
  [156, 47.2],
];
const THIGH_F: C = [
  [95.5, 52.5],
  [103, 56.8],
  [112, 58.6],
  [124, 58.4],
  [138, 56.8],
  [148, 55.3],
  [153.5, 55.4],
  [156, 53.6],
];

/* Shank: gastroc bulge behind, straight shin, achilles taper. */
const SHANK_B: C = [
  [148, 43.6],
  [150, 41.6],
  [160, 39.2],
  [168, 38.2],
  [178, 40.9],
  [186, 43.2],
  [192, 44.5],
];
const SHANK_F: C = [
  [146.6, 52.2],
  [148.5, 54.2],
  [158, 52.9],
  [170, 51.5],
  [182, 50.2],
  [191, 49.6],
];

/* Upper arm: round delt cap flowing into the bi/tri columns. */
/* Shoulder end starts with a narrow easing sample so the silhouette
 * crowns as a DOME — a flat 9.5-unit top edge read as a sharp diamond
 * whenever a hinge rotated the hanging arm into view. */
const ARM_B: C = [
  [36.2, 44.3],
  [37.5, 41.4],
  [43, 40.8],
  [49, 42.2],
  [56, 43.8],
  [64, 44.4],
  [69.5, 45.1],
  [71.5, 46.6],
];
const ARM_F: C = [
  [36.2, 47.8],
  [37.5, 52.2],
  [43, 53.4],
  [49, 52.4],
  [56, 53],
  [63, 52.6],
  [69.5, 52],
  [71.5, 50.5],
];

/* Forearm: tapers toward the wrist, and CARRIES FORWARD — in every
 * anatomy-plate profile (operator references, 2026-08-15) the relaxed
 * arm is not a plumb line: the forearm angles ~7 deg forward from the
 * elbow so the hand rests beside the FRONT of the thigh. The tilt
 * lives in the art AND the hand anchor together, so the piece stays
 * aligned with its own axis — IK-aimed demos rotate rest onto target
 * and render exactly as before; only relaxed hanging frames gain the
 * carry. */
const FORE_B: C = [
  [66.2, 46.6],
  [67.8, 45.2],
  [76, 47],
  [88, 49.1],
  [97, 50.7],
  [99.2, 52.2],
];
const FORE_F: C = [
  [66, 51],
  [67.6, 52.3],
  [78, 54.8],
  [90, 55.7],
  [96.8, 56.1],
  [99, 55.2],
];

/* ── Pieces ──────────────────────────────────────────────────────── */

const FOOT: Pt[] = [
  // Anatomy-plate foot (operator references, 2026-08-15): instep
  // sloping convexly to a tapered toe, ball contact, a lifted ARCH
  // mid-sole, heel pad, and a heel that bulges BACK past the achilles
  // line — replacing the flat wedge.
  [44.2, 192.6],
  [49.8, 191.6],
  [55.3, 193.8],
  [61.2, 197.2],
  [65.1, 200.2],
  [65.5, 201.6],
  [64, 202.4],
  [56.6, 202.5],
  [51.6, 201.4],
  [46.7, 201.9],
  [42.6, 202.5],
  [40.4, 200.8],
  [40.3, 197.6],
  [41, 194],
];

/* The foot is its OWN piece since the calf-raise side conversion —
 * plantarflexion needs the foot to rotate about the ball while the
 * shin stays put, which one welded piece can't do. The shank keeps a
 * short ankle stub below the contour bottom so the two underlays
 * overlap through the joint (the crack-free-overlap design), and the
 * renderer makes the foot FOLLOW its shank whenever a pose doesn't
 * address it — every other demo renders exactly as before. */
const SHANK_OUTLINE: Pt[] = [
  ...silhouette(SHANK_B, SHANK_F).slice(0, 6),
  // ankle stub: front ankle down to the foot-top line, across to the
  // achilles — sits over the foot piece's top edge.
  [49.8, 191],
  [50.6, 194.2],
  [41.6, 194.4],
  [41.4, 193.6],
];

const FOOT_OUTLINE: Pt[] = [
  // underlay ring around the FOOT facet; top edge unchanged so the
  // shank's ankle stub still overlaps the joint
  [49.8, 191],
  [55.6, 193.2],
  [61.6, 196.6],
  [65.8, 199.8],
  [66.2, 201.6],
  [64.6, 202.9],
  [56.6, 203.1],
  [51.6, 202],
  [46.6, 202.5],
  [42, 203.1],
  [39.7, 201],
  [39.5, 197.4],
  [41.4, 193.6],
];
const FOOT_FACETS = [{ muscle: "foot", points: FOOT }];
/* Facet-count discipline (device feedback 2026-07-27: "too many
 * individualized body parts"): at the card's 190px width every extra
 * seam reads as a crack in the figure, so a row split only earns its
 * place when it follows a REAL muscle boundary. The arbitrary
 * mid-length splits (calves gastroc/soleus row, abs/obliques second
 * row, forearm halves) are merged into single bellies below. */
const SHANK_FACETS = [
  {
    muscle: "calves",
    points: band(SHANK_B, SHANK_F, 151, 192, 0, 0.47, { bellyR: 0.08 }),
  },
  {
    muscle: "shin",
    points: band(SHANK_B, SHANK_F, 150, 191.5, 0.58, 1, { bellyL: -0.04 }),
  },
];
const THIGH_FACETS = [
  {
    muscle: "quadriceps",
    points: band(THIGH_B, THIGH_F, 97.5, 146.5, 0.52, 1, {
      bellyL: -0.06,
    }),
  },
  {
    muscle: "hamstring",
    points: band(THIGH_B, THIGH_F, 101, 145.5, 0, 0.46, { bellyR: 0.06 }),
  },
  {
    muscle: "knees",
    points: band(THIGH_B, THIGH_F, 144.5, 157.5, 0.14, 0.97),
  },
];

export const SIDE_PIECES: SidePiece[] = [
  // Far-side leg pair: same geometry, darker, painted FIRST — hidden in
  // symmetric stances, visible the moment a pose splits the legs.
  // Feet paint before their shank so the leg tucks over the ankle.
  {
    group: "footR",
    far: true,
    outline: FOOT_OUTLINE,
    facets: FOOT_FACETS,
  },
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
    group: "footL",
    outline: FOOT_OUTLINE,
    facets: FOOT_FACETS,
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
  // Far-side arm chain: same geometry as the near arm, darker, painted
  // BEFORE the body core so the torso occludes it — the side renderer
  // gives far pieces a constant depth offset and mirrors the near
  // chain's ops when a pose doesn't address them, so every side demo is
  // bilateral by construction (roadmap P0 "bilateral arms/hands").
  {
    group: "foreArmR",
    far: true,
    outline: silhouette(FORE_B, FORE_F),
    facets: [
      {
        muscle: "forearm",
        points: band(FORE_B, FORE_F, 68.4, 99.8, 0, 1),
      },
    ],
  },
  {
    group: "upperArmR",
    far: true,
    outline: silhouette(ARM_B, ARM_F),
    facets: [
      {
        muscle: "front-deltoids",
        points: band(ARM_B, ARM_F, 38, 51.8, 0, 1, { skewB: [-1.5, 1] }),
      },
      {
        muscle: "biceps",
        points: band(ARM_B, ARM_F, 53.2, 72.5, 0.52, 1, {
          skewT: [-1.5, 1],
          bellyL: -0.05,
        }),
      },
      {
        muscle: "triceps",
        points: band(ARM_B, ARM_F, 54, 72.5, 0, 0.46, { bellyR: 0.05 }),
      },
    ],
  },
  {
    group: "handR",
    far: true,
    outline: [
      [50.3, 99.4],
      [56.3, 99.2],
      [57.5, 103.2],
      [56.3, 107.6],
      [52.3, 108.6],
      [49.5, 104.6],
    ],
    facets: [
      {
        muscle: "hand",
        points: [
          [50.9, 100],
          [55.7, 99.8],
          [56.9, 103.2],
          [55.7, 107],
          [52.7, 107.9],
          [50.3, 104.4],
        ],
      },
    ],
  },
  {
    group: "pelvis",
    outline: silhouette(PELV_B, PELV_F),
    facets: [
      {
        muscle: "gluteal",
        points: [
          [36.2, 91],
          [43.6, 90],
          [45.4, 94.6],
          [44.6, 102.4],
          [41.6, 110.2],
          [35.8, 110.8],
          [31.6, 105.4],
          [30.8, 97.4],
          [33, 92.8],
        ],
      },
      {
        /* Extends to the piece's front-bottom corner (pass 25): that
         * region had no facet, so its bare stage margin painted a
         * black wedge over the hip crease whenever a pose flexed the
         * thigh against the pelvis — worst on the bench. */
        muscle: "pelvis",
        points: [
          [49.8, 89.4],
          [55.6, 89.8],
          [52.9, 97.8],
          [49, 103.5],
          [45.5, 110],
          [43, 110.5],
          [44.2, 103],
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
      [51.5, -0.7],
      [57.6, 1.1],
      [61, 5.5],
      [62, 9],
      [61.4, 10.8],
      [62.4, 13],
      [61.4, 16.2],
      [61.2, 18.6],
      [58, 21.3],
      [50.4, 23],
      [52.6, 26],
      [53.2, 31],
      [52.6, 35.8],
      [43.8, 35.4],
      [45.4, 27],
      [47, 20],
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
          [60.4, 10.9],
          [61.6, 13.2],
          [60.5, 16],
          [60.7, 18.3],
          [57, 20.7],
          [49.8, 21.7],
          [46.9, 19],
          [45.9, 15],
          [44.6, 10],
          [44.6, 6],
        ],
      },
      {
        /* Top edge tucks under the jaw (pass 16): the old 1.5-unit gap
         * to the face facet read fine standing, but the bench's lying
         * pose turned it into a decapitation line. */
        muscle: "neck",
        points: [
          [47.2, 19.4],
          [52.6, 19],
          [53, 27],
          [52.6, 34.8],
          [44.2, 35.2],
          [45.8, 27],
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
      {
        /* The three lower rows run to y≈93 (the outline ends at 94):
         * stopping at 88-90 left a 4-6 unit band of bare stage
         * underlay across the waist — a black BELT cutting the side
         * figure in half on every profile demo. */
        muscle: "abs",
        points: band(TORSO_B, TORSO_F, 57.4, 93, 0.64, 1, {
          skewT: [1.2, -0.8],
        }),
      },
      {
        muscle: "obliques",
        points: band(TORSO_B, TORSO_F, 58.8, 93, 0.34, 0.64, {
          skewT: [1.5, -1.5],
        }),
      },
      {
        muscle: "lower-back",
        points: band(TORSO_B, TORSO_F, 68.8, 93, 0, 0.34),
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
        points: band(ARM_B, ARM_F, 53.2, 72.5, 0.52, 1, {
          skewT: [-1.5, 1],
          bellyL: -0.05,
        }),
      },
      {
        muscle: "triceps",
        points: band(ARM_B, ARM_F, 54, 72.5, 0, 0.46, { bellyR: 0.05 }),
      },
    ],
  },
  {
    // Compact mitt (≤ half head-width), articulated from the forearm at
    // the wrist pivot. Rides the forearm chain in every pose.
    group: "handL",
    outline: [
      [50.3, 99.4],
      [56.3, 99.2],
      [57.5, 103.2],
      [56.3, 107.6],
      [52.3, 108.6],
      [49.5, 104.6],
    ],
    facets: [
      {
        muscle: "hand",
        points: [
          [50.9, 100],
          [55.7, 99.8],
          [56.9, 103.2],
          [55.7, 107],
          [52.7, 107.9],
          [50.3, 104.4],
        ],
      },
    ],
  },
];

/* Measured joint anchors for the side rig. */
export const SIDE_ANCHORS = {
  neck: [48, 32] as Pt,
  lumbar: [45, 90] as Pt,
  shoulder: [47.5, 45] as Pt,
  elbow: [48.6, 70.5] as Pt,
  hand: [53.8, 100] as Pt,
  hip: [42, 100.5] as Pt,
  knee: [50, 152] as Pt,
  ankle: [46.6, 193] as Pt,
};
