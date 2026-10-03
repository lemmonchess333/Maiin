/**
 * Print a draft release record for a set, to be reviewed and filled in.
 * It never approves anything.
 *
 *   node --import tsx scripts/create-form-art-review.ts <id>
 *   node --import tsx scripts/create-form-art-review.ts <id> --version=<version> [--reference=<1-6>]
 *
 * Without --version it describes the set as released, for a re-review.
 * With it, the set is described from its delivered frames: a new set is
 * not in the registry until its approved record exists and
 * `npm run art:releases` has run, and a replacement set is not the one
 * released. The frames are public/form-frames/<id>/1.webp to 6.webp, the
 * canvas is read from the first, and the reference frame defaults to 1.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FORM_ARTWORK, formFramePaths } from "../src/lib/formArtwork";
import { getAuthoredBeats } from "../src/lib/bodyRig";
import {
  ART_REVIEW_CHECKS,
  artworkReviewExpectation,
} from "../src/lib/formArtReview";
import { webpSize } from "./art/webp-size";

const exerciseId = process.argv[2] ?? "";
const option = (name: string) =>
  process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const hash = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
const asset = (path: string) => readFileSync(resolve("public", path));

function delivered() {
  const version = option("version");
  if (version === undefined) return FORM_ARTWORK[exerciseId] ?? null;
  const reference = Number(option("reference") ?? 1);
  if (!version.trim() || !Number.isInteger(reference)) return null;
  if (reference < 1 || reference > 6) return null;
  const frames = formFramePaths(exerciseId);
  const [width, height] = webpSize(asset(frames[0]));
  return { version, width, height, frames, reference: frames[reference - 1] };
}

let expected;
try {
  const art = delivered();
  const beats = getAuthoredBeats(exerciseId);
  if (!exerciseId || !art || art.frames.length !== 6 || beats?.length !== 6)
    throw new Error("six frames and six authored cues are required");
  expected = artworkReviewExpectation(exerciseId, art, beats, {
    asset: (path) => hash(asset(path)),
    text: hash,
  });
} catch (error) {
  console.error(
    `${String(error)}\n\nUsage: node --import tsx scripts/create-form-art-review.ts <exercise-id> [--version=<version> --reference=<1-6>]`
  );
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      exerciseId,
      version: expected.version,
      width: expected.width,
      height: expected.height,
      decision: "draft",
      reviewer: "",
      reviewedAt: "",
      reference: expected.reference,
      cueSha256: expected.cueSha256,
      checks: Object.fromEntries(
        ART_REVIEW_CHECKS.map((key) => [key, { passed: false, evidence: "" }])
      ),
      frames: expected.frames.map((frame) => ({
        ...frame,
        anchors: {},
        invariantDimensions: {},
      })),
    },
    null,
    2
  )
);
