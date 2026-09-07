import {
  ART_REVIEW_CHECKS,
  type ArtworkReviewExpectation,
} from "./formArtReview";

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0;
const hash = (value: unknown) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** Owner release is distinct from the strict passing visual-review contract. */
export function validateOwnerArtworkRelease(
  value: unknown,
  expected: ArtworkReviewExpectation
): string[] {
  const review = object(value);
  const errors: string[] = [];
  for (const key of [
    "exerciseId",
    "version",
    "width",
    "height",
    "cueSha256",
  ] as const)
    if (review[key] !== expected[key]) errors.push(`Release ${key} changed.`);
  if (!hash(review.cueSha256)) errors.push("Cue hash required.");
  if (review.decision !== "owner-released-with-findings")
    errors.push("Owner release decision required.");
  const approval = object(review.approval);
  if (
    !text(approval.actor) ||
    !text(approval.instruction) ||
    !text(approval.context)
  )
    errors.push("Explicit owner authorization and context required.");
  if (
    !Array.isArray(review.findings) ||
    !review.findings.length ||
    !review.findings.every(text)
  )
    errors.push("Outstanding visual findings required.");
  const checks = object(review.checks);
  for (const key of ART_REVIEW_CHECKS) {
    const check = object(checks[key]);
    if (check.passed !== null || !text(check.evidence))
      errors.push(
        `${key}: owner release must retain unverified visual status.`
      );
  }
  const reference = object(review.reference);
  if (
    reference.path !== expected.reference.path ||
    !hash(reference.sha256) ||
    reference.sha256 !== expected.reference.sha256
  )
    errors.push("Reference changed since owner release.");
  if (
    !Array.isArray(review.frames) ||
    review.frames.length !== 6 ||
    expected.frames.length !== 6
  )
    return [...errors, "Owner release must cover exactly six frames."];
  review.frames.forEach((value, i) => {
    const frame = object(value);
    if (
      frame.path !== expected.frames[i].path ||
      !hash(frame.sha256) ||
      frame.sha256 !== expected.frames[i].sha256
    )
      errors.push(`Frame ${i + 1}: asset changed since owner release.`);
    const source = object(frame.source);
    if (!text(source.path) || !hash(source.sha256))
      errors.push(`Frame ${i + 1}: source provenance required.`);
  });
  return errors;
}
