import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

/** A reviewed artist cutout remains valid only for its exact released source. */
export function preparedCutoutPath(
  directory: string,
  id: string,
  reference: string,
  sourceBytes: Buffer
): string | null {
  const record = resolve(directory, `${id}.json`);
  if (!existsSync(record)) return null;
  const prepared = JSON.parse(readFileSync(record, "utf8"));
  if (prepared.reviewStatus !== "reviewed")
    throw new Error(`${id}: prepared cutout has not passed review`);
  if (
    prepared.reference !== reference ||
    prepared.referenceSha256 !== sha256(sourceBytes)
  )
    throw new Error(`${id}: prepared cutout reference changed`);
  if (prepared.image !== `${id}.png`)
    throw new Error(`${id}: prepared cutout must name its exercise PNG`);
  const image = resolve(directory, prepared.image);
  if (prepared.imageSha256 !== sha256(readFileSync(image)))
    throw new Error(`${id}: prepared cutout image changed`);
  return image;
}
