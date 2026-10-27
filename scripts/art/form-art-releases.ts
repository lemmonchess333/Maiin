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
 * The strict release in force for each set, keyed and sorted by exercise ID.
 * An explicit owner decision can withdraw its latest prior approval; a later
 * strict approval restores the row. Ordinary owner records do not withdraw
 * approval. Every historical approval is validated, including withdrawn ones.
 */
export function approvedReleases(
  records: readonly ReleaseRecordFile[]
): Record<string, ApprovedFormArtRelease> {
  type ApprovedDecision = {
    reviewedAt: number;
    where: string;
    release: ApprovedFormArtRelease;
  };
  const newest = new Map<string, ApprovedDecision>();
  const approvedByPath = new Map<string, { id: string; reviewedAt: number }>();
  const approvedById = new Map<
    string,
    { where: string; reviewedAt: number }[]
  >();
  const eligibleDates = new Map<string, Map<number, string>>();
  const seenPaths = new Set<string>();
  const markDecision = (id: string, reviewedAt: number, where: string) => {
    const dates = eligibleDates.get(id) ?? new Map<number, string>();
    if (dates.has(reviewedAt))
      throw new Error(
        `${where}: two release decisions for ${id} share a review date`
      );
    dates.set(reviewedAt, where);
    eligibleDates.set(id, dates);
  };

  // Validate every historical approval, even if a later decision withdraws it.
  for (const { folder, name, record } of records) {
    const where = `${RELEASES_DIR}/${folder}/${name}.json`;
    if (seenPaths.has(where))
      throw new Error(`${where}: repeated release path`);
    seenPaths.add(where);
    if (record.exerciseId !== name)
      throw new Error(`${where}: a release record is named for its exerciseId`);
    if (
      Object.hasOwn(record, "supersedesApprovedRelease") &&
      record.decision !== "owner-released-with-findings"
    )
      throw new Error(
        `${where}: only an explicit owner decision may supersede an approval`
      );
    if (record.decision !== "approved") continue;
    const reviewedAt = Date.parse(String(record.reviewedAt));
    if (!Number.isFinite(reviewedAt))
      throw new Error(`${where}: an approved record needs its review date`);
    const defaultFrames = formFramePaths(name);
    const recorded = Array.isArray(record.frames)
      ? record.frames.map((frame) => (isObject(frame) ? frame.path : null))
      : [];
    if (
      recorded.length !== defaultFrames.length ||
      recorded.some(
        (path, i) =>
          typeof path !== "string" ||
          !new RegExp(
            `^form-frames/${name}/(?:[0-9]{4}-[0-9]{2}-[0-9]{2}/)?${i + 1}\\.webp$`
          ).test(path)
      )
    )
      throw new Error(
        `${where}: the frames must be six ordered paths for ${name}`
      );
    const reference = isObject(record.reference)
      ? recorded.indexOf(String(record.reference.path)) + 1
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
    markDecision(name, reviewedAt, where);
    approvedByPath.set(where, { id: name, reviewedAt });
    const prior = approvedById.get(name) ?? [];
    prior.push({ where, reviewedAt });
    approvedById.set(name, prior);
    const current = newest.get(name);
    if (!current || reviewedAt > current.reviewedAt)
      newest.set(name, {
        reviewedAt,
        where,
        release: {
          folder,
          version,
          width,
          height,
          reference,
          ...(recorded.some((path, i) => path !== defaultFrames[i])
            ? { frames: recorded as string[] }
            : {}),
        },
      });
  }

  // Plain owner records never withdraw strict approval. A newer explicit
  // decision must identify the latest approval at that owner's review date.
  // A later genuine approval can therefore restore the strict output row.
  for (const { folder, name, record } of records) {
    if (!Object.hasOwn(record, "supersedesApprovedRelease")) continue;
    const where = `${RELEASES_DIR}/${folder}/${name}.json`;
    const targetPath = record.supersedesApprovedRelease;
    if (typeof targetPath !== "string" || !targetPath.trim())
      throw new Error(
        `${where}: supersedesApprovedRelease must name a prior approved record`
      );
    if (typeof record.reviewedAt !== "string" || !record.reviewedAt.trim())
      throw new Error(
        `${where}: an explicit owner decision needs its review date`
      );
    const reviewedAt = Date.parse(record.reviewedAt);
    if (!Number.isFinite(reviewedAt))
      throw new Error(
        `${where}: an explicit owner decision needs its review date`
      );
    markDecision(name, reviewedAt, where);
    const target = approvedByPath.get(targetPath);
    if (!target || target.id !== name)
      throw new Error(
        `${where}: supersession must name an existing approved record for the same exercise`
      );
    if (reviewedAt <= target.reviewedAt)
      throw new Error(
        `${where}: an owner supersession must be newer than its approved target`
      );
    const preceding = (approvedById.get(name) ?? []).reduce<
      { where: string; reviewedAt: number } | undefined
    >((latest, fact) => {
      if (fact.reviewedAt >= reviewedAt) return latest;
      return !latest || fact.reviewedAt > latest.reviewedAt ? fact : latest;
    }, undefined);
    if (preceding?.where !== targetPath)
      throw new Error(
        `${where}: supersession must name the latest approved record at the owner review date`
      );
    const current = newest.get(name);
    if (current && reviewedAt > current.reviewedAt) newest.delete(name);
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
      `  ${JSON.stringify(id)}: { folder: ${JSON.stringify(release.folder)}, version: ${JSON.stringify(release.version)}, width: ${release.width}, height: ${release.height}, reference: ${release.reference}${release.frames ? `, frames: ${JSON.stringify(release.frames)}` : ""} },`
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
  /** Exact delivered paths when a new release preserves older frame bytes. */
  frames?: readonly string[];
}

export const APPROVED_FORM_ART_RELEASES: Record<
  string,
  ApprovedFormArtRelease
> = {
${rows.join("\n")}
};
`;
}
