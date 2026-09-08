import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";
import { EXERCISES } from "../src/lib/exercises";
import manifest from "../docs/exercise-art/BATCH_REVIEW_MANIFEST.json";

// Integrity only. This command never grants visual or technique approval.
const errors: string[] = [];
const ids = new Set<string>();
const unique = new Set<string>();
const root = resolve("docs/exercise-art/pilots");
let count = 0;
let bytes = 0;
for (const set of manifest.completeDraftSets) {
  if (ids.has(set.exerciseId)) errors.push(`${set.exerciseId}: duplicate set`);
  ids.add(set.exerciseId);
  if (!EXERCISES.some((exercise) => exercise.id === set.exerciseId))
    errors.push(`${set.exerciseId}: unknown exercise`);
  if (set.status !== "draft-awaiting-review" || set.frames.length !== 6)
    errors.push(`${set.exerciseId}: six draft frames required`);
  const paths = new Set<string>();
  for (const [index, frame] of set.frames.entries()) {
    try {
      const path = resolve(frame.path);
      if (!path.startsWith(root + sep) || !path.endsWith(".png"))
        throw new Error("Expected native PNG beneath pilot directory");
      if (paths.has(path)) throw new Error("Each slot needs a separate file path");
      paths.add(path);
      if (frame.frame !== index + 1 || !frame.caption.endsWith(` ${index + 1}/6`))
        throw new Error("Frame number/caption order mismatch");
      if (!frame.cue.trim() || !Number.isFinite(frame.progress) || frame.progress < 0 || frame.progress > 1)
        throw new Error("Cue and valid progress required");
      const data = readFileSync(path);
      const hash = createHash("sha256").update(data).digest("hex");
      if (hash !== frame.sha256 || data.length !== frame.bytes)
        throw new Error("Asset changed since manifest was recorded");
      if (data.length < 24 || data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
        throw new Error("Invalid PNG header");
      const dimensions = [data.readUInt32BE(16), data.readUInt32BE(20)];
      if (dimensions.some((value, axis) => value !== frame.dimensions[axis] || value !== set.frames[0].dimensions[axis]))
        throw new Error("Canvas dimensions differ");
      if (frame.reusedFrom != null) {
        const original = set.frames[frame.reusedFrom - 1];
        if (!original || frame.reusedFrom >= frame.frame || original.sha256 !== hash)
          throw new Error("Return-pose reuse does not match source");
      }
      unique.add(hash);
      count++;
      bytes += data.length;
    } catch (error) {
      errors.push(`${set.exerciseId}, frame ${index + 1}: ${String(error)}`);
    }
  }
}
if (count !== manifest.selectedFrameCount)
  errors.push("Selected-frame count differs from manifest");
if (manifest.releaseApproved !== false)
  errors.push("Draft manifest must not claim release approval");
console.log(JSON.stringify({ draftSets: ids.size, selectedFrames: count, uniquePoses: unique.size, nativeBytes: bytes, releaseApproved: false, errors }, null, 2));
if (errors.length) process.exitCode = 1;
