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
  const first = object(review.frames[0]);
  const anchors = object(first.anchors);
  const dimensions = object(first.invariantDimensions);
  if (Object.keys(anchors).length < 2)
    errors.push("Measure at least two genuinely fixed scene anchors.");
  if (Object.keys(dimensions).length < 2)
    errors.push("Measure at least two invariant dimensions.");
  review.frames.forEach((value, i) => {
    const frame = object(value);
    if (
      frame.path !== expected.frames[i].path ||
      !hash(frame.sha256) ||
      frame.sha256 !== expected.frames[i].sha256
    )
      errors.push(`Frame ${i + 1}: asset changed since review.`);
    for (const [key, master] of Object.entries(anchors)) {
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
          Math.abs(coordinate - origin) > 1
        )
          errors.push(`Frame ${i + 1}: fixed anchor ${key}.${axis} drift.`);
      }
    }
    for (const [key, base] of Object.entries(dimensions)) {
      const size = object(frame.invariantDimensions)[key];
      if (
        !number(size) ||
        !number(base) ||
        base <= 0 ||
        size <= 0 ||
        Math.abs(size / base - 1) > 0.01
      )
        errors.push(`Frame ${i + 1}: invariant ${key} drift.`);
    }
  });
  return errors;
}
