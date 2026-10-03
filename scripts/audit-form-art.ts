import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { EXERCISES } from "../src/lib/exercises";
import { FORM_ARTWORK } from "../src/lib/formArtwork";
import { APPROVED_FORM_ART_RELEASES } from "../src/lib/formArtReleases.data";
import { getAuthoredBeats } from "../src/lib/bodyRig";
import { validateOwnerArtworkRelease } from "../src/lib/formArtOwnerRelease";
import {
  artworkReviewExpectation,
  validateArtworkReview,
} from "../src/lib/formArtReview";
import {
  approvedReleases,
  readReleaseRecords,
  RELEASES_MODULE,
} from "./art/form-art-releases";
import { webpSize } from "./art/webp-size";

export const sha256 = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export const assetHash = (path: string) =>
  sha256(readFileSync(resolve("public", path)));

const errors: string[] = [];
let bytes = 0;
// The approved sets are built from their records, so a record added or
// corrected without regenerating would not be released, or not as reviewed.
try {
  if (
    !isDeepStrictEqual(
      approvedReleases(readReleaseRecords(resolve("."))),
      APPROVED_FORM_ART_RELEASES
    )
  )
    errors.push(
      `${RELEASES_MODULE} is not what the release records say: run npm run art:releases`
    );
} catch (error) {
  errors.push(String(error));
}
for (const [id, artwork] of Object.entries(FORM_ARTWORK)) {
  if (!EXERCISES.some((exercise) => exercise.id === id))
    errors.push(`${id}: unknown exercise ID`);
  if (artwork.status === "draft") continue;
  if (
    ![
      "existing-needs-review",
      "approved",
      "owner-released-with-findings",
    ].includes(artwork.status)
  )
    errors.push(`${id}: unknown release status`);
  const beats = getAuthoredBeats(id);
  if (artwork.frames.length !== 6 || beats?.length !== 6)
    errors.push(`${id}: exactly six images and authored cues required`);
  artwork.frames.forEach((path, i) => {
    try {
      if (!path.startsWith(`form-frames/${id}/`) || path.includes(".."))
        throw new Error("Invalid asset path");
      if (beats?.[i]?.image !== path)
        throw new Error("Cue/image ordering mismatch");
      const data = readFileSync(resolve("public", path));
      bytes += data.length;
      const [width, height] = webpSize(data);
      if (width !== artwork.width || height !== artwork.height)
        throw new Error(`Canvas ${width}×${height} differs from registry`);
    } catch (error) {
      errors.push(`${id}, frame ${i + 1}: ${String(error)}`);
    }
  });
  if (
    artwork.status === "approved" ||
    artwork.status === "owner-released-with-findings"
  ) {
    try {
      if (!artwork.reviewFile) throw new Error("Review file required");
      const review: unknown = JSON.parse(
        readFileSync(artwork.reviewFile, "utf8")
      );
      errors.push(
        ...(artwork.status === "approved"
          ? validateArtworkReview
          : validateOwnerArtworkRelease)(
          review,
          artworkReviewExpectation(id, artwork, beats ?? [], {
            asset: assetHash,
            text: sha256,
          })
        ).map((error) => `${id}: ${error}`)
      );
    } catch (error) {
      errors.push(`${id}: ${String(error)}`);
    }
  }
}
const inventory = EXERCISES.map((exercise) => ({
  id: exercise.id,
  name: exercise.name,
  equipment: exercise.equipment,
  inScope: exercise.category !== "Cardio",
  authoredBeats: getAuthoredBeats(exercise.id)?.length ?? 0,
  status: FORM_ARTWORK[exercise.id]?.status ?? "needs-artwork",
  bytes: (FORM_ARTWORK[exercise.id]?.frames ?? []).reduce((total, path) => {
    try {
      return total + statSync(resolve("public", path)).size;
    } catch {
      return total;
    }
  }, 0),
}));
console.log(
  JSON.stringify(
    {
      catalogue: inventory.length,
      inScope: inventory.filter((row) => row.inScope).length,
      existingSets: inventory.filter(
        (row) => row.status === "existing-needs-review"
      ).length,
      newlyApproved: inventory.filter((row) => row.status === "approved")
        .length,
      ownerReleasedWithFindings: inventory.filter(
        (row) => row.status === "owner-released-with-findings"
      ).length,
      releasedBytes: bytes,
      errors,
      ...(process.argv.includes("--json") ? { inventory } : {}),
    },
    null,
    2
  )
);
if (errors.length) process.exitCode = 1;
