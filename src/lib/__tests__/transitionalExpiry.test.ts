/**
 * Transitional code has to be able to expire.
 *
 * Two branches in `functions/` exist only to bridge the Sunday → Monday
 * week-anchor flip: `goalSpaceCheckIn.js` accepts BOTH weekday anchors as
 * a valid week start, and `runReschedule.js` infers the anchor from the
 * stored key instead of using the fixed offset the client uses. Both are
 * correct today and both are wrong later — a client on a pre-flip build
 * still writes Sunday keys, so dropping either now refuses that client's
 * writes outright.
 *
 * Both say so, and neither is enforced:
 *
 *   goalSpaceCheckIn.js  "Drop the Sunday branch one release after the
 *                         client flip lands (RunWk2 PR 4) — leaving it
 *                         forever re-opens the doubling for good."
 *   runReschedule.js     "Once every stored key is a Monday, this
 *                         collapses to the fixed offset … RunWk2 PR 4
 *                         alongside the check-in's Sunday branch."
 *
 * A comment that says "remove this later" has no later. This repo has
 * the receipts: the `askGeminiText` retirement, F3d pin 2, and the
 * storage write-freeze all sat as prose instructions nothing executed —
 * and the only reason the first two closed is that somebody happened to
 * re-read the backlog. The rule CLAUDE.md draws from those is the one
 * this file applies: a rule nothing checks is a claim that rots.
 *
 * The trip condition is mechanical rather than a date. The flip shipped
 * in `package.json` version 1.2.0 (#2263, 2026-09-12) and 1.2.0 has not
 * been released — every entry in CHANGELOG.md since is still under
 * `[Unreleased]`. So the window is open exactly while the version stays
 * where it was, and the moment a later version is cut, a release
 * carrying the flip is out and this test starts asking for the branch to
 * go. Version rather than date because "one release after" is the
 * condition the comments actually state; a date would be a guess at when
 * that happens.
 *
 * Two directions, both load-bearing:
 *
 *   - Registry → code. A row whose marker is gone means the branch was
 *     removed and the row was not. That is how a registry rots into
 *     scenery, so it fails.
 *   - Code → registry. Every `TRANSITIONAL` marker in `src/` and
 *     `functions/` must be registered, so the next one cannot be added
 *     with a removal condition nothing holds.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

/** The version the bridging code shipped in. While `package.json` still
 *  reads this, no release carrying the flip has gone out. */
const FLIP_VERSION = "1.2.0";

interface Deferred {
  /** Repo-relative path holding the transitional branch. */
  file: string;
  /** A literal from the file that disappears when the branch is removed. */
  marker: string;
  /** What has to happen to the code once the window closes. */
  removal: string;
}

const DEFERRED: Deferred[] = [
  {
    file: "functions/lib/goalSpaceCheckIn.js",
    marker: "LEGACY_WEEK_START_DAY",
    removal:
      "Delete LEGACY_WEEK_START_DAY and the `day !== LEGACY_WEEK_START_DAY` " +
      "half of the week-start check, so a Sunday key is refused again and " +
      "the deterministic ${uid}_${weekKey} id is back to one doc per week.",
  },
  {
    file: "functions/lib/runReschedule.js",
    marker: "const anchor = new Date(base).getUTCDay();",
    removal:
      "Collapse dateForDay to the client's fixed offset `(dayIndex + 6) % 7` " +
      "and drop the inferred anchor. Check the runReschedule cross-test moves " +
      "with it — it is the thing holding the two copies together.",
  },
];

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "graphify-out",
  "coverage",
  "ios",
  "android",
  "__tests__",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const appVersion = JSON.parse(
  readFileSync(resolve(repoRoot, "package.json"), "utf8")
).version as string;

describe("deferred removals expire", () => {
  it.each(DEFERRED)("$file is still inside its window", (entry) => {
    const source = readFileSync(resolve(repoRoot, entry.file), "utf8");
    expect(
      source.includes(entry.marker),
      `${entry.file} no longer contains ${JSON.stringify(entry.marker)}. ` +
        "If the transitional branch is gone, delete its row from DEFERRED in " +
        "this file — a registry that outlives what it describes is the thing " +
        "this test exists to prevent."
    ).toBe(true);

    expect(
      appVersion,
      `package.json is now ${appVersion}, so ${FLIP_VERSION} — the version ` +
        "that first carried the Monday week anchor — has been released and " +
        `every client writing keys is past the flip. ${entry.file} can stop ` +
        `bridging:\n\n  ${entry.removal}\n\n` +
        "Then delete its row from DEFERRED here. If the release has NOT " +
        "actually gone out and the version moved for another reason, move " +
        "FLIP_VERSION forward with a note saying why."
    ).toBe(FLIP_VERSION);
  });

  it("registers every TRANSITIONAL marker in src/ and functions/", () => {
    const registered = new Set(DEFERRED.map((d) => d.file));
    const unregistered: string[] = [];
    for (const root of ["src", "functions"]) {
      for (const file of walk(resolve(repoRoot, root))) {
        if (!readFileSync(file, "utf8").includes("TRANSITIONAL")) continue;
        const rel = relative(repoRoot, file);
        if (!registered.has(rel)) unregistered.push(rel);
      }
    }
    expect(
      unregistered,
      "These files mark code as TRANSITIONAL but name no condition anything " +
        "checks. Add a DEFERRED row in this file saying what removes the " +
        "branch and when — or, if the code is not actually transitional, say " +
        "what it is instead of marking it for a removal nobody will make."
    ).toEqual([]);
  });
});
