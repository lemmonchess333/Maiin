/**
 * Saved runs are read through `src/lib/savedRuns.ts` and nowhere else.
 *
 * Twenty modules used to query `users/{uid}/runs` themselves, each with its
 * own query, projection and idea of which day a run belongs to. Two ordered
 * by a field no saved run has and read nothing for five months; Lift3's
 * start-day rule reached some screens and not others; most missed runs
 * saved offline. The reader module owns the query, the parse, the day rule
 * and the offline merge, so a new reader that builds its own query of the
 * collection fails here.
 *
 * Reading ONE run by id (`doc(db, "users", uid, "runs", id)`, as
 * `useSessionDoc` does) is not a collection read and is not matched.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const srcRoot = resolve(repoRoot, "src");

/** The only files allowed to name the runs collection. */
const ALLOWLIST = new Set<string>([
  "src/lib/savedRuns.ts", // the reader
  "src/pages/RunSummary.tsx", // mints a new run's id before saving it
]);

/** `collection(db, "users", <uid>, "runs")`, across line breaks, and any
 *  collection-group query of runs. */
const RUNS_COLLECTION =
  /collection\(\s*db\s*,\s*["'`]users["'`]\s*,\s*[^,()]+,\s*["'`]runs["'`]\s*\)|collectionGroup\(\s*db\s*,\s*["'`]runs["'`]/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__" || name === "test")
        continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    out.push(full);
  }
  return out;
}

function matchLines(src: string): number[] {
  const lines: number[] = [];
  for (const match of src.matchAll(RUNS_COLLECTION)) {
    lines.push(src.slice(0, match.index).split("\n").length);
  }
  return lines;
}

describe("saved runs have one reader", () => {
  it("no src file outside the allow-list queries the runs collection", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcRoot)) {
      const rel = relative(repoRoot, file);
      if (ALLOWLIST.has(rel)) continue;
      for (const line of matchLines(readFileSync(file, "utf8")))
        offenders.push(`${rel}:${line}`);
    }
    expect(
      offenders,
      `Read saved runs through src/lib/savedRuns.ts (fetchSavedRuns, ` +
        `savedRunsQuery) or src/hooks/useSavedRuns.ts. They query by the ` +
        `field every saved run has, date each run by the day it started ` +
        `(Lift3) and include runs saved on this phone that have not synced.` +
        `\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("the allow-list is honest: each listed file still names the collection", () => {
    for (const rel of ALLOWLIST) {
      const src = readFileSync(resolve(repoRoot, rel), "utf8");
      expect(
        matchLines(src).length,
        `${rel} is allow-listed but no longer names the runs collection; remove it.`
      ).toBeGreaterThan(0);
    }
  });
});
