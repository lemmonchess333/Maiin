import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { EXERCISES } from "../src/lib/exercises";
import { FORM_ARTWORK } from "../src/lib/formArtwork";
import { getAuthoredBeats } from "../src/lib/bodyRig";
import { validateArtworkReview } from "../src/lib/formArtReview";

export const sha256 = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export const assetHash = (path: string) =>
  sha256(readFileSync(resolve("public", path)));

/** Read native WebP dimensions without re-encoding or upscaling the art. */
function dimensions(data: Buffer): [number, number] {
  if (
    data.toString("ascii", 0, 4) !== "RIFF" ||
    data.toString("ascii", 8, 12) !== "WEBP"
  )
    throw new Error("Not a WebP image");
  for (let offset = 12; offset + 8 <= data.length; ) {
    const kind = data.toString("ascii", offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > data.length) throw new Error("Truncated WebP");
    if (kind === "VP8X" && size >= 10)
      return [
        1 + data.readUIntLE(start + 4, 3),
        1 + data.readUIntLE(start + 7, 3),
      ];
    if (kind === "VP8 " && size >= 10)
      return [
        data.readUInt16LE(start + 6) & 16383,
        data.readUInt16LE(start + 8) & 16383,
      ];
    if (kind === "VP8L" && size >= 5) {
      const bits = data.readUInt32LE(start + 1);
      return [(bits & 16383) + 1, ((bits >>> 14) & 16383) + 1];
    }
    offset = start + size + (size % 2);
  }
  throw new Error("WebP dimensions missing");
}

const errors: string[] = [];
let bytes = 0;
for (const [id, artwork] of Object.entries(FORM_ARTWORK)) {
  if (!EXERCISES.some((exercise) => exercise.id === id))
    errors.push(`${id}: unknown exercise ID`);
  if (artwork.status === "draft") continue;
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
      const [width, height] = dimensions(data);
      if (width !== artwork.width || height !== artwork.height)
        throw new Error(`Canvas ${width}×${height} differs from registry`);
    } catch (error) {
      errors.push(`${id}, frame ${i + 1}: ${String(error)}`);
    }
  });
  if (artwork.status === "approved") {
    try {
      if (!artwork.reviewFile) throw new Error("Review file required");
      const review: unknown = JSON.parse(
        readFileSync(artwork.reviewFile, "utf8")
      );
      errors.push(
        ...validateArtworkReview(review, {
          exerciseId: id,
          version: artwork.version,
          width: artwork.width,
          height: artwork.height,
          reference: {
            path: artwork.reference,
            sha256: assetHash(artwork.reference),
          },
          frames: artwork.frames.map((path) => ({
            path,
            sha256: assetHash(path),
          })),
          cueSha256: sha256(
            JSON.stringify(beats?.map(({ label, cue }) => ({ label, cue })))
          ),
        }).map((error) => `${id}: ${error}`)
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
      releasedBytes: bytes,
      errors,
      ...(process.argv.includes("--json") ? { inventory } : {}),
    },
    null,
    2
  )
);
if (errors.length) process.exitCode = 1;
