export const ART_REVIEW_CHECKS = [
  "identity",
  "camera",
  "anatomy",
  "equipment",
  "contact",
  "physics",
  "muscles",
  "cueAgreement",
  "sequenceAndLoop",
  "mobileLight",
  "mobileDark",
] as const;

/** QA-reviewed native-pixel limits for specific fixed scene landmarks.
 * Every other anchor stays at the default one-pixel limit. A release record
 * must also name and explain each exception before this limit applies. */
const FIXED_ANCHOR_EXCEPTION_LIMITS: Readonly<
  Record<string, Readonly<Record<string, number>>>
> = {
  "inverted-row": {
    "frontRackFootBottomRight.y": 2,
    "rearRackFootBottomLeft.y": 2,
  },
};

type DimensionException = { unit: "percent" | "pixels"; limit: number };
/** Only these measured dimensions may use a wider bound, and only when the
 * release record explicitly names the dimension and its evidence. */
const INVARIANT_DIMENSION_EXCEPTION_LIMITS: Readonly<
  Record<string, Readonly<Record<string, DimensionException>>>
> = {
  "clean-and-press": {
    leftPlateHeight: { unit: "percent", limit: 2 },
    rightPlateHeight: { unit: "percent", limit: 2 },
    nearSoleWidth: { unit: "pixels", limit: 2 },
    farSoleWidth: { unit: "pixels", limit: 2 },
  },
};

export interface ReviewedAsset {
  path: string;
  sha256: string;
}
export interface ArtworkReviewExpectation {
  exerciseId: string;
  version: string;
  width: number;
  height: number;
  frames: readonly ReviewedAsset[];
  reference: ReviewedAsset;
  cueSha256: string;
}

/**
 * What a release record must say about a registered set: its registry
 * facts, the hash of every delivered frame and of the reference, and the
 * hash of the cues shown with it. The audit checks each record against it,
 * the review script prints it as a new record's template, and the release
 * test checks records with it. Built here, beside the contract it feeds,
 * so the three cannot drift: each used to build it by hand, and two read
 * the authored cues while the third read the live placard's.
 */
export function artworkReviewExpectation(
  exerciseId: string,
  art: {
    version: string;
    width: number;
    height: number;
    frames: readonly string[];
    reference: string;
  },
  cues: readonly { label: string; cue: string }[],
  sha256: {
    /** The hash of a delivered file, by its path under `public/`. */
    asset: (path: string) => string;
    text: (value: string) => string;
  }
): ArtworkReviewExpectation {
  const asset = (path: string): ReviewedAsset => ({
    path,
    sha256: sha256.asset(path),
  });
  return {
    exerciseId,
    version: art.version,
    width: art.width,
    height: art.height,
    frames: art.frames.map(asset),
    reference: asset(art.reference),
    cueSha256: sha256.text(
      JSON.stringify(cues.map(({ label, cue }) => ({ label, cue })))
    ),
  };
}

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0;
const number = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const hash = (value: unknown) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** Checks the evidence contract. Visual anatomy and form still need real review. */
export function validateArtworkReview(
  value: unknown,
  expected: ArtworkReviewExpectation
): string[] {
  const review = object(value);
  const errors: string[] = [];
  for (const key of ["exerciseId", "version", "width", "height"] as const)
    if (review[key] !== expected[key])
      errors.push(`Review ${key} does not match the released art.`);
  if (review.decision !== "approved") errors.push("Review is not approved.");
  if (
    !text(review.reviewer) ||
    !text(review.reviewedAt) ||
    !Number.isFinite(Date.parse(String(review.reviewedAt)))
  )
    errors.push("Reviewer and review date required.");
  const reference = object(review.reference);
  if (
    reference.path !== expected.reference.path ||
    !hash(reference.sha256) ||
    reference.sha256 !== expected.reference.sha256
  )
    errors.push("Reference changed since review.");
  if (!hash(review.cueSha256) || review.cueSha256 !== expected.cueSha256)
    errors.push("Cues changed since review.");
  const checks = object(review.checks);
  for (const key of ART_REVIEW_CHECKS) {
    const check = object(checks[key]);
    if (check.passed !== true || !text(check.evidence))
      errors.push(`${key}: passing evidence required.`);
  }
  if (
    !Array.isArray(review.frames) ||
    review.frames.length !== 6 ||
    expected.frames.length !== 6
  )
    return [...errors, "Review must cover exactly six frames."];
  review.frames.forEach((value, i) => {
    const frame = object(value);
    if (
      frame.path !== expected.frames[i].path ||
      !hash(frame.sha256) ||
      frame.sha256 !== expected.frames[i].sha256
    )
      errors.push(`Frame ${i + 1}: asset changed since review.`);
  });
  const frames = review.frames.map(object);
  const anchorExceptions = new Map<string, number>();
  if (review.fixedAnchorExceptions !== undefined) {
    if (!Array.isArray(review.fixedAnchorExceptions))
      errors.push("Fixed anchor exceptions must be a list.");
    else
      for (const value of review.fixedAnchorExceptions) {
        const exception = object(value);
        const key = `${exception.anchor}.${exception.axis}`;
        const permitted = FIXED_ANCHOR_EXCEPTION_LIMITS[expected.exerciseId]?.[key];
        if (
          !text(exception.anchor) ||
          !["x", "y"].includes(String(exception.axis)) ||
          !number(exception.maxDriftPx) ||
          exception.maxDriftPx !== permitted ||
          !text(exception.evidence) ||
          !object(frames[0].anchors)[String(exception.anchor)] ||
          anchorExceptions.has(key)
        ) {
          errors.push(`Unapproved fixed anchor exception: ${key}.`);
          continue;
        }
        anchorExceptions.set(key, exception.maxDriftPx);
      }
  }
  const dimensionExceptions = new Map<string, DimensionException>();
  if (review.invariantDimensionExceptions !== undefined) {
    if (!Array.isArray(review.invariantDimensionExceptions))
      errors.push("Invariant dimension exceptions must be a list.");
    else
      for (const value of review.invariantDimensionExceptions) {
        const exception = object(value);
        const name = String(exception.dimension);
        const permitted =
          INVARIANT_DIMENSION_EXCEPTION_LIMITS[expected.exerciseId]?.[name];
        if (
          !text(exception.dimension) ||
          !permitted ||
          exception.unit !== permitted.unit ||
          exception.limit !== permitted.limit ||
          !text(exception.evidence) ||
          !frames.some((frame) => number(object(frame.invariantDimensions)[name])) ||
          dimensionExceptions.has(name)
        ) {
          errors.push(`Unapproved invariant dimension exception: ${name}.`);
          continue;
        }
        dimensionExceptions.set(name, permitted);
      }
  }
  const measure = (
    frameIndex: number,
    referenceIndex: number,
    anchorNames: string[],
    dimensionNames: string[]
  ) => {
    const frame = frames[frameIndex];
    const reference = frames[referenceIndex];
    const i = frameIndex;
    for (const key of anchorNames) {
      const master = object(reference.anchors)[key];
      const point = object(object(frame.anchors)[key]);
      const base = object(master);
      for (const axis of ["x", "y"] as const) {
        const coordinate = point[axis];
        const origin = base[axis];
        const bound = axis === "x" ? expected.width : expected.height;
        if (
          !number(coordinate) ||
          !number(origin) ||
          coordinate < 0 ||
          coordinate >= bound ||
          Math.abs(coordinate - origin) >
            (anchorExceptions.get(`${key}.${axis}`) ?? 1)
        )
          errors.push(`Frame ${i + 1}: fixed anchor ${key}.${axis} drift.`);
      }
    }
    for (const key of dimensionNames) {
      const base = object(reference.invariantDimensions)[key];
      const size = object(frame.invariantDimensions)[key];
      const exception = dimensionExceptions.get(key);
      const withinLimit =
        number(size) &&
        number(base) &&
        base > 0 &&
        size > 0 &&
        (exception?.unit === "pixels"
          ? Math.abs(size - base) <= exception.limit
          : Math.abs(size / base - 1) <=
            (exception?.unit === "percent" ? exception.limit / 100 : 0.01));
      if (!withinLimit)
        errors.push(`Frame ${i + 1}: invariant ${key} drift.`);
    }
  };
  if (
    review.contactPhases === undefined &&
    review.airborneFrames === undefined
  ) {
    // Existing records retain the same all-frame geometry requirements.
    const anchors = Object.keys(object(frames[0].anchors));
    const dimensions = Object.keys(object(frames[0].invariantDimensions));
    if (anchors.length < 2)
      errors.push("Measure at least two genuinely fixed scene anchors.");
    if (dimensions.length < 2)
      errors.push("Measure at least two invariant dimensions.");
    frames.forEach((_, i) => measure(i, 0, anchors, dimensions));
  } else {
    // A jump cannot keep planted contacts. Measure each real contact phase
    // against one of its own frames, and explicitly review flight and landing.
    const frameNumber = (n: unknown): n is number =>
      number(n) && Number.isInteger(n) && n >= 1 && n <= frames.length;
    const names = (value: unknown): value is string[] =>
      Array.isArray(value) &&
      value.length >= 2 &&
      value.every(text) &&
      new Set(value).size === value.length;
    const grounded = new Set<number>();
    if (!Array.isArray(review.contactPhases) || !review.contactPhases.length)
      errors.push("Contact phases require measured grounded frames.");
    else
      for (const value of review.contactPhases) {
        const phase = object(value);
        if (
          !text(phase.name) ||
          !text(phase.evidence) ||
          !Array.isArray(phase.frames) ||
          phase.frames.length < 2 ||
          !phase.frames.every(frameNumber) ||
          new Set(phase.frames).size !== phase.frames.length ||
          !frameNumber(phase.referenceFrame) ||
          !phase.frames.includes(phase.referenceFrame) ||
          !names(phase.anchorNames) ||
          !names(phase.dimensionNames)
        ) {
          errors.push(
            "Contact phase requires named measurements and at least two distinct frames including its reference."
          );
          continue;
        }
        for (const n of phase.frames) {
          grounded.add(n);
          measure(
            n - 1,
            phase.referenceFrame - 1,
            phase.anchorNames,
            phase.dimensionNames
          );
        }
      }
    const airborne = new Set<number>();
    if (!Array.isArray(review.airborneFrames))
      errors.push(
        "Contact phase review requires an explicit airborne-frame list."
      );
    else
      for (const value of review.airborneFrames) {
        const flight = object(value);
        if (
          !frameNumber(flight.frame) ||
          airborne.has(flight.frame) ||
          grounded.has(flight.frame) ||
          !frameNumber(flight.takeoffFrame) ||
          !frameNumber(flight.landingFrame) ||
          !grounded.has(flight.takeoffFrame) ||
          !grounded.has(flight.landingFrame) ||
          !text(flight.evidence)
        ) {
          errors.push(
            "Airborne frame requires unique flight evidence and measured takeoff and landing frames."
          );
          continue;
        }
        airborne.add(flight.frame);
      }
    frames.forEach((_, i) => {
      if (!grounded.has(i + 1) && !airborne.has(i + 1))
        errors.push(`Frame ${i + 1}: no contact-phase or airborne evidence.`);
    });
  }
  return errors;
}
