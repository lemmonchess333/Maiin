import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * "Recent bests" rows say New in gold, and gold means a personal best and
 * nothing else. The best of the last 30 days is one only when it is also
 * the all-time record, so each list's New has to be judged against every
 * session or run, not against the window it was picked from.
 *
 * The rules are unit-tested where they live (`liftRecords.test.ts`,
 * `runRecordSelection.test.ts`). These pin that History gives them what
 * they need. Pinned at the source, as the other History tests are: the
 * page mounts charts, maps and several Firestore hooks, and a render test
 * would pin fixtures rather than this wiring.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const history = readFileSync(resolve(repoRoot, "src/pages/History.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ");

describe("History — Recent bests say New only for an all-time record", () => {
  it("builds the recent lift records from every workout", () => {
    // Handed only the window's sessions, the all-time check inside
    // `bestSetPerExercise` could not see the older, heavier set.
    expect(history).toMatch(
      /const recentLiftPRs = bestSetPerExercise\(workouts, \{\s*sinceKey:/
    );
  });

  it("judges the recent running rows against the records over every run", () => {
    expect(history).toMatch(
      /recent30d: buildPRBucket\([\s\S]*?,\s*selectRunRecords\(paceEligible, \{ includeLongest: true \}\)\s*\)/
    );
    expect(history).toMatch(
      /run\.completedAt >= sevenDaysAgo &&\s*\(!allTime \|\| isAllTimeRecord\(allTime, kind, run\)\)/
    );
    for (const [row, kind] of [
      ["best1k", "bestPace"],
      ["best5k", "bestSustainedPace"],
      ["longest", "longest"],
    ]) {
      expect(history).toMatch(new RegExp(`isNew\\(${row}, "${kind}"\\)`));
    }
    expect(history).not.toMatch(/isNew: \w+(\.completedAt)? >= sevenDaysAgo/);
  });
});
