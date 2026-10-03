/**
 * Saved runs and workouts are read through their one reader each
 * (`src/lib/savedRuns.ts`, `src/lib/savedWorkouts.ts`) and nowhere else.
 *
 * Twenty modules used to query `users/{uid}/runs` themselves and thirteen
 * `users/{uid}/workouts`, each with its own query, projection and idea of
 * which day a session belongs to. Two run readers ordered by a field no
 * saved run has and read nothing for five months; Lift3's start-day rule
 * reached some screens and not others; almost none saw a session saved
 * offline. The readers own the query, the parse, the day rule and the
 * offline merge, so a new module that builds its own query of either
 * collection fails here.
 *
 * Not matched, on purpose:
 * - reading ONE session by id (`doc(db, "users", uid, "runs", id)`, as
 *   `useSessionDoc` does): not a collection read;
 * - the weekly recap's `probeHasDoc`, which asks whether any document of a
 *   collection exists in a week, one read each, for the recap's
 *   eligibility. It names the collection through a variable.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const srcRoot = resolve(repoRoot, "src");

/** Per collection, the only files allowed to name it in a query. */
const ALLOWLIST: Record<"runs" | "workouts", Set<string>> = {
  runs: new Set([
    "src/lib/savedRuns.ts", // the reader
    "src/pages/RunSummary.tsx", // mints a new run's id before saving it
  ]),
  workouts: new Set([
    "src/lib/savedWorkouts.ts", // the reader
  ]),
};

/** `collection(db, "users", <uid>, "<name>")`, across line breaks, and any
 *  collection-group query of it. */
function collectionPattern(name: string): RegExp {
  return new RegExp(
    `collection\\(\\s*db\\s*,\\s*["'\`]users["'\`]\\s*,\\s*[^,()]+,\\s*["'\`]${name}["'\`]\\s*\\)` +
      `|collectionGroup\\(\\s*db\\s*,\\s*["'\`]${name}["'\`]`,
    "g"
  );
}

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

function matchLines(src: string, pattern: RegExp): number[] {
  const lines: number[] = [];
  for (const match of src.matchAll(pattern)) {
    lines.push(src.slice(0, match.index).split("\n").length);
  }
  return lines;
}

const READER = {
  runs: "src/lib/savedRuns.ts (fetchSavedRuns, SAVED_RUNS) or useSavedRuns",
  workouts:
    "src/lib/savedWorkouts.ts (fetchSavedWorkouts, SAVED_WORKOUTS) or useSavedSessions",
};

describe.each(["runs", "workouts"] as const)(
  "saved %s have one reader",
  (name) => {
    const pattern = collectionPattern(name);

    it("no src file outside the allow-list queries the collection", () => {
      const offenders: string[] = [];
      for (const file of sourceFiles(srcRoot)) {
        const rel = relative(repoRoot, file);
        if (ALLOWLIST[name].has(rel)) continue;
        for (const line of matchLines(readFileSync(file, "utf8"), pattern))
          offenders.push(`${rel}:${line}`);
      }
      expect(
        offenders,
        `Read saved ${name} through ${READER[name]}. The reader queries by ` +
          `the field every saved session has, dates each by the day it ` +
          `started (Lift3) and includes sessions saved on this phone that ` +
          `have not synced.\n  ${offenders.join("\n  ")}`
      ).toEqual([]);
    });

    it("the allow-list is honest: each listed file still names the collection", () => {
      for (const rel of ALLOWLIST[name]) {
        const src = readFileSync(resolve(repoRoot, rel), "utf8");
        expect(
          matchLines(src, pattern).length,
          `${rel} is allow-listed but no longer names ${name}; remove it.`
        ).toBeGreaterThan(0);
      }
    });
  }
);
