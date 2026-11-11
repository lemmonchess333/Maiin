/**
 * A fixed camera for each six-frame illustration set. Values are relative to
 * the square stage: x/y translate the image after scaling around its center.
 * The same camera is used for all six frames so playback cannot reframe a pose.
 *
 * Measured from the union of visible pixels in all six original WebPs at full
 * resolution, with at least a 5% stage margin for equipment and anatomy.
 * Sets with little safe room to enlarge keep their default object-contain fit.
 */
export interface FormArtFraming {
  scale: number;
  x: number;
  y: number;
}

export const FORM_ART_FRAMING: Readonly<Record<string, FormArtFraming>> = {
  "arnold-press": { scale: 1.4913, x: 0.0267, y: 0.0112 },
  "bench-dips": { scale: 1.21, x: -0.0272, y: 0.0016 },
  "barbell-upright-row": { scale: 1.4993, x: 0.0005, y: 0.0215 },
  "chest-press-machine": { scale: 1.4691, x: 0.0516, y: 0.0187 },
  "clean-and-press": { scale: 1.4, x: 0, y: -0.025 },
  "close-grip-bench": { scale: 1.13, x: -0.02, y: 0 },
  "concentration-curl": { scale: 1.1086, x: -0.0018, y: 0.0451 },
  "db-flyes": { scale: 1.2776, x: 0.0025, y: -0.0112 },
  "db-bench": { scale: 1.5, x: -0.0215, y: 0.0146 },
  "db-shoulder-press": { scale: 1.123, x: 0.0044, y: 0.0479 },
  "donkey-calf-raise": { scale: 1.3921, x: -0.0186, y: -0.0399 },
  "incline-bench": { scale: 1.292, x: -0.0177, y: 0.0198 },
  "lat-pulldown": { scale: 1.1024, x: -0.0097, y: 0.0402 },
  "machine-chest-fly": { scale: 1.466, x: -0.0305, y: 0.0234 },
  "nordic-hamstring-curl": { scale: 1.8071, x: -0.0841, y: -0.0118 },
  "overhead-cable-tricep-extension": { scale: 1.1214, x: 0.0803, y: -0.0654 },
  "pec-deck": { scale: 1.4281, x: 0.0009, y: 0.0139 },
  "rack-pull": { scale: 1.1359, x: 0, y: 0.0595 },
  "reverse-flyes": { scale: 1.381, x: 0.0175, y: 0.0189 },
  "romanian-deadlift": { scale: 1.2722, x: 0.0079, y: -0.0162 },
  "single-arm-lat-pulldown": { scale: 1.1059, x: -0.0036, y: 0.0374 },
  "spider-db-curl": { scale: 1.4237, x: 0.0496, y: 0.0236 },
  "thrusters": { scale: 1.1115, x: 0.0547, y: 0.0444 },
  "trap-bar-deadlift": { scale: 1.1954, x: -0.0148, y: 0.0174 },
  "tricep-kickback": { scale: 1.466, x: 0.2014, y: 0.0243 },
  "weighted-chest-dip": { scale: 1.4135, x: 0.0078, y: 0.012 },
};

export const getFormArtFraming = (id: string): FormArtFraming | undefined =>
  FORM_ART_FRAMING[id];
