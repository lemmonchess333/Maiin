/**
 * A released frame whose planted contact is drawn from another frame of the
 * same fixed-camera set. The generated Man Maker press has the correct pose,
 * but its shoe outlines drift. Drawing the squat frame below the ankle join
 * keeps both complete shoes and their floor contact pixel-identical while
 * the press remains the source of the moving body above them.
 */
export interface FormArtCompositeLayer {
  targetIndex: number;
  sourceIndex: number;
  /** Rectangle in the 700 × 920 released artwork canvas. */
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FormArtComposite {
  width: number;
  height: number;
  layers: readonly FormArtCompositeLayer[];
}

export const FORM_ART_COMPOSITES: Readonly<Record<string, FormArtComposite>> = {
  "man-maker": {
    width: 700,
    height: 920,
    layers: [
      // Frame 5 presses from frame 4's planted shoes. The full lower band
      // keeps both feet exactly fixed, including the far shoe's toe.
      {
        targetIndex: 4,
        sourceIndex: 3,
        left: 0,
        top: 790,
        width: 700,
        height: 130,
      },
      // The returning hand grips the same grounded dumbbells as the first
      // three phases. These outer ends have no moving fingers or anatomy.
      {
        targetIndex: 5,
        sourceIndex: 0,
        left: 40,
        top: 790,
        width: 55,
        height: 70,
      },
      {
        targetIndex: 5,
        sourceIndex: 0,
        left: 165,
        top: 805,
        width: 65,
        height: 75,
      },
    ],
  },
};

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * The contact review measures the displayed image, so its layer recipe must
 * stay pinned to the runtime recipe. In particular, a raw frame-5 shoe or a
 * raw frame-6 dumbbell end must never silently replace its reviewed source.
 */
export function validateFormArtCompositeRelease(
  exerciseId: string,
  reviewValue: unknown
): string[] {
  const composite = FORM_ART_COMPOSITES[exerciseId];
  const review = object(reviewValue);
  const display = object(review.displayComposition);
  if (!composite && !Object.keys(display).length) return [];
  if (!composite) return ["Display composition has no runtime recipe."];
  const errors: string[] = [];
  if (display.required !== true)
    errors.push("Display composition must be required for contact review.");
  const canvas = object(display.canvas);
  if (canvas.width !== composite.width || canvas.height !== composite.height)
    errors.push("Display composition canvas differs from runtime.");
  const recordedLayers = Array.isArray(display.layers)
    ? display.layers.map(object)
    : [];
  if (recordedLayers.length !== composite.layers.length)
    errors.push("Display composition layer count differs from runtime.");
  for (const [i, layer] of composite.layers.entries()) {
    const recorded = recordedLayers[i] ?? {};
    const rect = object(recorded.rect);
    if (
      recorded.targetFrame !== layer.targetIndex + 1 ||
      recorded.sourceFrame !== layer.sourceIndex + 1 ||
      rect.left !== layer.left ||
      rect.top !== layer.top ||
      rect.width !== layer.width ||
      rect.height !== layer.height
    )
      errors.push(`Display composition layer ${i + 1} differs from runtime.`);
    if (
      !Number.isInteger(layer.targetIndex) ||
      !Number.isInteger(layer.sourceIndex) ||
      layer.targetIndex < 0 ||
      layer.targetIndex > 5 ||
      layer.sourceIndex < 0 ||
      layer.sourceIndex > 5 ||
      layer.targetIndex === layer.sourceIndex ||
      !Number.isInteger(layer.left) ||
      !Number.isInteger(layer.top) ||
      !Number.isInteger(layer.width) ||
      !Number.isInteger(layer.height) ||
      layer.left < 0 ||
      layer.top < 0 ||
      layer.width <= 0 ||
      layer.height <= 0 ||
      layer.left + layer.width > composite.width ||
      layer.top + layer.height > composite.height
    )
      errors.push(`Display composition layer ${i + 1} is out of bounds.`);
  }
  const frames = Array.isArray(review.frames) ? review.frames.map(object) : [];
  const phases = Array.isArray(review.contactPhases)
    ? review.contactPhases.map(object)
    : [];
  for (const phase of phases) {
    if (!Array.isArray(phase.frames) || !Array.isArray(phase.anchorNames))
      continue;
    for (const frameNumber of phase.frames) {
      if (typeof frameNumber !== "number") continue;
      const layers = composite.layers.filter(
        (layer) => layer.targetIndex === frameNumber - 1
      );
      if (!layers.length) continue;
      const sourceLayers = layers.filter(
        (layer) => layer.sourceIndex === Number(phase.referenceFrame) - 1
      );
      for (const name of phase.anchorNames) {
        if (typeof name !== "string") continue;
        const point = object(object(frames[frameNumber - 1]).anchors)[name];
        const { x, y } = object(point);
        if (
          typeof x !== "number" ||
          typeof y !== "number" ||
          !sourceLayers.some(
            (layer) =>
              x >= layer.left &&
              x < layer.left + layer.width &&
              y >= layer.top &&
              y < layer.top + layer.height
          )
        )
          errors.push(
            `Frame ${frameNumber}: fixed anchor ${name} is outside its source layer.`
          );
      }
    }
  }
  return errors;
}
