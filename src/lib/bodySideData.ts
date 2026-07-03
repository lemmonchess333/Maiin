/**
 * Side-view (profile) body for the exercise demos.
 *
 * ARCHITECTURE — different construction from the vendored front/back
 * data, same look. The vendored art is a mosaic of facets with
 * transparent gaps; that only works for a STATIC figure. A rigged
 * profile needs pieces that rotate (torso hinge, pressing arm, bending
 * knee), so it is built from SOLID sculpted pieces that OVERLAP at the
 * joints, painted in z-order, with the muscle seams drawn ON TOP as
 * stage-coloured strokes. On the demo's fixed dark stage this is
 * pixel-equivalent to the mosaic look, and the overlaps mean rotations
 * never open cracks.
 *
 * The figure faces RIGHT. Same 200-unit height and landmark rows as the
 * vendored figure (shoulder ≈45, elbow ≈71, hip ≈97, knee ≈152,
 * ankle ≈194). Muscle names reuse the library vocabulary so tints and
 * glow work unchanged.
 *
 * Paint order (fixed): shank → thigh → head → torso → forearm → upper
 * arm. Legs tuck under the torso, the elbow tucks under the upper arm,
 * the near arm reads in front of the torso — exactly how a profile
 * layers.
 */

import type { GroupName } from "./bodyRig";

type Pt = [number, number];

export interface SidePiece {
  group: GroupName;
  /** Solid sculpted outline of the whole piece. */
  outline: Pt[];
  /** Muscle seams, drawn on top as stage-coloured strokes. */
  seams: Pt[][];
  /** Tintable muscle regions (loose edges hide under seams/outlines). */
  tints: { muscle: string; points: Pt[] }[];
}

export const SIDE_PIECES: SidePiece[] = [
  {
    group: "shankL",
    outline: [
      [45.5, 149.5],
      [54.5, 147.5],
      [54, 160],
      [52.5, 176],
      [51, 190],
      [63, 197],
      [65.5, 200.5],
      [64.5, 202.5],
      [43, 202.5],
      [41.5, 196.5],
      [45, 190],
      [42.5, 178],
      [39.5, 166],
      [41, 155],
    ],
    seams: [
      [
        [46.5, 152],
        [44.5, 176],
        [47.5, 190],
      ],
      [
        [43.5, 194],
        [50.5, 192.5],
      ],
    ],
    tints: [
      {
        muscle: "calves",
        points: [
          [41, 154],
          [46, 152],
          [44.8, 176],
          [42.6, 178],
          [39.8, 166],
        ],
      },
    ],
  },
  {
    group: "thighL",
    outline: [
      [42, 97],
      [53, 95.5],
      [58.5, 103],
      [61, 112],
      [60, 126],
      [57, 141],
      [55.2, 149],
      [55.4, 156],
      [50, 158.5],
      [46.2, 155],
      [45, 147],
      [43, 136],
      [41, 122],
      [39.8, 108],
    ],
    seams: [
      [
        [45, 100],
        [44.2, 124],
        [45, 147],
      ],
      [
        [46.8, 151],
        [54.6, 150],
      ],
    ],
    tints: [
      {
        muscle: "quadriceps",
        points: [
          [45.5, 99],
          [54, 96.5],
          [59, 106],
          [60.4, 114],
          [59.4, 128],
          [56.4, 144],
          [55.6, 156],
          [50.4, 158.5],
          [45.9, 152],
          [45.4, 124],
        ],
      },
      {
        muscle: "hamstring",
        points: [
          [41, 106],
          [44, 100],
          [43.9, 148],
          [42, 134],
          [40.4, 120],
        ],
      },
    ],
  },
  {
    group: "head",
    outline: [
      [47, 2],
      [53, 0.8],
      [57.5, 3],
      [59.8, 7],
      [59.1, 9.3],
      [61.1, 11.3],
      [58.5, 14.6],
      [55.7, 17.4],
      [54.4, 21],
      [54.7, 26],
      [53.9, 32],
      [53.1, 35.6],
      [44.6, 35.2],
      [46.1, 26],
      [47.2, 19],
      [45.9, 10],
    ],
    seams: [
      [
        [50.3, 17.8],
        [55.1, 16.8],
      ],
    ],
    tints: [],
  },
  {
    group: "torso",
    outline: [
      [47, 31],
      [50.5, 33.5],
      [56.5, 37.5],
      [62, 41],
      [63.8, 47],
      [60.5, 54],
      [58.5, 64],
      [59, 76],
      [57, 88],
      [54.5, 96],
      [50, 103.5],
      [46.5, 111.5],
      [41.5, 114.5],
      [36, 112],
      [32.5, 107],
      [31.5, 100],
      [34, 92],
      [37, 84],
      [37.5, 76],
      [36.5, 66],
      [35.5, 54],
      [36.8, 44],
      [40, 36],
      [44.5, 30],
    ],
    seams: [
      [
        [48.5, 55.5],
        [55, 56.5],
        [61, 53.5],
      ],
      [
        [53.8, 59],
        [53, 74],
        [52.2, 88],
      ],
      [
        [44, 41.5],
        [42.4, 55],
        [43, 68],
      ],
      [
        [50.5, 61],
        [48, 74],
        [45.8, 87],
      ],
      [
        [35.5, 88.5],
        [41.5, 89.5],
        [47.5, 91.5],
      ],
      [
        [33.2, 105.5],
        [38.2, 109.5],
        [42.8, 111.5],
      ],
    ],
    tints: [
      {
        muscle: "chest",
        points: [
          [49, 40.5],
          [63, 42],
          [64.5, 47],
          [61, 53],
          [54, 56],
          [49, 55],
          [47.5, 46],
        ],
      },
      {
        muscle: "abs",
        points: [
          [53.8, 58.8],
          [58.8, 59.6],
          [56.4, 89],
          [52.4, 88.6],
        ],
      },
      {
        muscle: "obliques",
        points: [
          [49.8, 60.5],
          [52.6, 60],
          [51.8, 87.6],
          [46.4, 86.8],
        ],
      },
      {
        muscle: "trapezius",
        points: [
          [45.4, 30.5],
          [51.4, 32.5],
          [45.6, 38.5],
          [40.4, 41.5],
        ],
      },
      {
        muscle: "upper-back",
        points: [
          [36.6, 44],
          [43.2, 41.5],
          [42.4, 67],
          [37.4, 72],
        ],
      },
      {
        muscle: "lower-back",
        points: [
          [37.2, 74],
          [42.2, 70],
          [42, 88],
          [36.4, 87],
        ],
      },
      {
        muscle: "gluteal",
        points: [
          [33.5, 92],
          [43, 90.5],
          [45.8, 95],
          [43.8, 111.5],
          [36.4, 111],
          [32.2, 102],
        ],
      },
    ],
  },
  {
    group: "foreArmL",
    outline: [
      [45, 69],
      [52, 68.6],
      [53.4, 80],
      [53.2, 89.5],
      [51.8, 97.5],
      [48.4, 98.6],
      [46.2, 90],
      [45.2, 79],
    ],
    seams: [
      [
        [49.8, 71],
        [50.8, 84],
        [49.9, 96],
      ],
    ],
    tints: [
      {
        muscle: "forearm",
        points: [
          [45.6, 70],
          [51.6, 69.5],
          [52.9, 82],
          [52.8, 89.5],
          [51.4, 97],
          [48.8, 98],
          [46.6, 88],
          [45.6, 77],
        ],
      },
    ],
  },
  {
    group: "upperArmL",
    outline: [
      [41, 39.5],
      [47.5, 37],
      [53.5, 40.5],
      [54.3, 46],
      [52.8, 50.5],
      [52.4, 62],
      [51.6, 73],
      [45.4, 74],
      [43.4, 64],
      [41.6, 51.5],
      [39.5, 45],
    ],
    seams: [
      [
        [41.6, 49.5],
        [47, 50.8],
        [52.6, 49.6],
      ],
      [
        [46.3, 54],
        [46, 64],
        [46.8, 72.5],
      ],
    ],
    tints: [
      {
        muscle: "front-deltoids",
        points: [
          [41, 40],
          [47.5, 37.4],
          [53.4, 41],
          [54.2, 46],
          [52.4, 50],
          [43.8, 49.6],
          [40, 45],
        ],
      },
      {
        muscle: "triceps",
        points: [
          [41.8, 51.5],
          [46, 52.5],
          [45.6, 72],
          [43.8, 72.5],
          [42.2, 62],
        ],
      },
      {
        muscle: "biceps",
        points: [
          [46.8, 52],
          [52.4, 51.5],
          [51.9, 72],
          [46.7, 72.8],
        ],
      },
    ],
  },
];

/* Measured joint anchors for the side rig. */
export const SIDE_ANCHORS = {
  neck: [48, 32] as Pt,
  shoulder: [47.5, 45] as Pt,
  elbow: [48.6, 71] as Pt,
  hand: [50.4, 98] as Pt,
  hip: [42, 100.5] as Pt,
  knee: [50, 153] as Pt,
  ankle: [46.5, 194] as Pt,
};
