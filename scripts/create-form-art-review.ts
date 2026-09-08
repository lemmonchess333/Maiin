import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FORM_ARTWORK } from "../src/lib/formArtwork";
import { getAuthoredBeats } from "../src/lib/bodyRig";
import { ART_REVIEW_CHECKS } from "../src/lib/formArtReview";

const exerciseId = process.argv[2];
const art = FORM_ARTWORK[exerciseId];
const beats = getAuthoredBeats(exerciseId);
if (!art || art.frames.length !== 6 || beats?.length !== 6) {
  console.error(
    "Usage: node --import tsx scripts/create-form-art-review.ts <registered-exercise-id>"
  );
  process.exit(1);
}
const hash = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
const asset = (path: string) => ({
  path,
  sha256: hash(readFileSync(resolve("public", path))),
});
console.log(
  JSON.stringify(
    {
      exerciseId,
      version: art.version,
      width: art.width,
      height: art.height,
      decision: "draft",
      reviewer: "",
      reviewedAt: "",
      reference: asset(art.reference),
      cueSha256: hash(
        JSON.stringify(beats.map(({ label, cue }) => ({ label, cue })))
      ),
      checks: Object.fromEntries(
        ART_REVIEW_CHECKS.map((key) => [key, { passed: false, evidence: "" }])
      ),
      frames: art.frames.map((path) => ({
        ...asset(path),
        anchors: {},
        invariantDimensions: {},
      })),
    },
    null,
    2
  )
);
