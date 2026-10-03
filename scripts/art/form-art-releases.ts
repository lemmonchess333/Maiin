/**
 * The approved artwork releases, read from their release records.
 *
 * A release record, docs/exercise-art/releases/<folder>/<id>.json, is
 * where a set's release is reviewed and decided: its version, its canvas,
 * its six delivered frames and its reference frame, each pinned by hash.
 * The registry used to copy those facts by hand, twelve lines per release
 * beside the record they had to agree with. `npm run art:releases` now
 * writes them to src/lib/formArtReleases.data.ts, formArtwork.ts builds
 * each approved set's entry from that file, and form-art-releases.test.ts
 * fails when the file is not what the records say.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formFramePaths } from "../../src/lib/formArtwork";
import type { ApprovedFormArtRelease } from "../../src/lib/formArtReleases.data";

export const RELEASES_DIR = "docs/exercise-art/releases";
export const RELEASES_MODULE = "src/lib/formArtReleases.data.ts";

/** A release record and where it sits. */
export interface ReleaseRecordFile {
  /** Its folder under docs/exercise-art/releases. */
  folder: string;
  /** Its file name without `.json`. */
  name: string;
  record: Record<string, unknown>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Every release record: a JSON file directly inside a release folder that
 * carries a review decision. The provenance, validation and evidence files
 * kept beside the records carry none.
 */
export function readReleaseRecords(root: string): ReleaseRecordFile[] {
  const dir = join(root, RELEASES_DIR);
  const records: ReleaseRecordFile[] = [];
  const folders = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const folder of folders) {
    const files = readdirSync(join(dir, folder), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
    for (const file of files) {
      const record: unknown = JSON.parse(
        readFileSync(join(dir, folder, file), "utf8")
      );
      if (isObject(record) && "decision" in record)
        records.push({ folder, name: file.slice(0, -".json".length), record });
    }
  }
  return records;
}

/**
 * The release in force for each approved set: its newest approved record
 * by review date, keyed and sorted by exercise ID. Throws on a record the
 * registry could not be built from, rather than leaving that set out.
 */
export function approvedReleases(
  records: readonly ReleaseRecordFile[]
): Record<string, ApprovedFormArtRelease> {
  const newest = new Map<
    string,
    { reviewedAt: number; release: ApprovedFormArtRelease }
  >();
  for (const { folder, name, record } of records) {
    const where = `${RELEASES_DIR}/${folder}/${name}.json`;
    if (record.exerciseId !== name)
      throw new Error(`${where}: a release record is named for its exerciseId`);
    if (record.decision !== "approved") continue;
    const reviewedAt = Date.parse(String(record.reviewedAt));
    if (!Number.isFinite(reviewedAt))
      throw new Error(`${where}: an approved record needs its review date`);
    const frames = formFramePaths(name);
    const recorded = Array.isArray(record.frames)
      ? record.frames.map((frame) => (isObject(frame) ? frame.path : null))
      : [];
    if (
      recorded.length !== frames.length ||
      recorded.some((path, i) => path !== frames[i])
    )
      throw new Error(
        `${where}: the frames must be ${frames.join(", ")}, in that order`
      );
    const reference = isObject(record.reference)
      ? frames.indexOf(String(record.reference.path)) + 1
      : 0;
    if (reference === 0)
      throw new Error(`${where}: the reference must be one of the six frames`);
    const { version, width, height } = record;
    if (
      typeof version !== "string" ||
      !version.trim() ||
      typeof width !== "number" ||
      typeof height !== "number" ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width <= 0 ||
      height <= 0
    )
      throw new Error(`${where}: the version, width and height are required`);
    const current = newest.get(name);
    if (current?.reviewedAt === reviewedAt)
      throw new Error(
        `${where}: two approved records for ${name} share a review date`
      );
    if (!current || reviewedAt > current.reviewedAt)
      newest.set(name, {
        reviewedAt,
        release: { folder, version, width, height, reference },
      });
  }
  return Object.fromEntries(
    [...newest.keys()].sort().map((id) => [id, newest.get(id)!.release])
  );
}

/** The data module's source, before formatting. */
export function renderReleasesModule(
  releases: Record<string, ApprovedFormArtRelease>
): string {
  const rows = Object.entries(releases).map(
    ([id, release]) =>
      `  ${JSON.stringify(id)}: { folder: ${JSON.stringify(release.folder)}, version: ${JSON.stringify(release.version)}, width: ${release.width}, height: ${release.height}, reference: ${release.reference} },`
  );
  return `/* GENERATED by \`npm run art:releases\` (scripts/art/gen-form-art-releases.ts)
   from the approved release records in docs/exercise-art/releases. Do not
   edit by hand: add or correct the record, then re-run the script.
   scripts/art/form-art-releases.test.ts fails when this file is not what
   the records say. */

/** What an approved set's registry entry is built from. */
export interface ApprovedFormArtRelease {
  /** The release record's folder under docs/exercise-art/releases. */
  folder: string;
  version: string;
  width: number;
  height: number;
  /** Which of the six frames is the reference, 1 to 6. */
  reference: number;
}

export const APPROVED_FORM_ART_RELEASES: Record<
  string,
  ApprovedFormArtRelease
> = {
${rows.join("\n")}
};
`;
}
