/**
 * Which writers still bypass the programme command boundary, and why.
 *
 * ADR-0011 stopped the boundary migration deliberately and recorded the
 * reasoning. What it could not do is stay true on its own: the count has
 * been stated three times, in three places, and all three had drifted.
 *
 *   ADR-0011                        "the remaining 8"
 *   lifting-v8-evaluation.md §8.6   "13 saveProgram sites remain"
 *   reality on 2026-08-11           9
 *
 * The proposal's own STATUS note says three separate sessions have
 * re-derived that triage from scratch. A fourth would have found a
 * different number again, because sites migrated and nobody went back to
 * the prose. This is precisely the failure CLAUDE.md names — "a number
 * nothing checks is a claim that rots; prefer describing the shape, or
 * add a test that pins the number" — applied to the number rather than to
 * a file count.
 *
 * So this pins the SITES, not just how many. Each has to be named with a
 * reason, which means a new one cannot appear silently and a migrated one
 * cannot leave the prose stale. Same job `triggerMetadata.test.js` does
 * for the `functions/index.js` split.
 *
 * It deliberately does NOT argue that any of these should migrate.
 * ADR-0011 settled that, and its "do not finish P6 as a tidiness
 * exercise" applies here too. The value is that the list is now checked.
 *
 * Two entries are worth calling out because ADR-0011's reasoning does not
 * reach them. Its account is "six route through advanceWeek or the run
 * scheduler" plus the deliberate `reorderDayExercises` fallback — seven.
 * `adoptLegacyTrainingBlock` and `undoRecoveryReduction` are neither, and
 * are marked as such below rather than being quietly folded into a
 * category that does not describe them.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = resolve(process.cwd(), "src/features/program/useProgram.ts");

/**
 * Every writer that still writes the whole programme document, with the
 * reason it has not moved to the command boundary.
 *
 * `category` mirrors ADR-0011's own vocabulary so a reader can check the
 * ADR against this list rather than re-deriving it. `unaccounted` marks
 * the two the ADR's reasoning does not cover.
 */
const EXPECTED_WRITERS: ReadonlyArray<{
  owner: string;
  category: "week-engine" | "whole-plan" | "deliberate" | "unaccounted";
  why: string;
}> = [
  {
    owner: "useEffect",
    category: "week-engine",
    why: "run-side auto week-rollover — calls advanceWeek, whose dependency closure is 12 of 16 helpers unmirrored (ADR-0011, measured)",
  },
  {
    owner: "useEffect",
    category: "week-engine",
    why: "lift-side rollover catch-up (D1) — same advanceWeek closure",
  },
  {
    owner: "advanceToNextWeek",
    category: "week-engine",
    why: "the manual button for the same engine",
  },
  {
    owner: "regenerateProgram",
    category: "whole-plan",
    why: "rebuilds from the generator; configurePlan-shaped, and a public command kind would put whole-plan authorship on the client surface",
  },
  {
    owner: "refreshRunSchedule",
    category: "whole-plan",
    why: "same shape as regenerateProgram, rebuilding the week from the run scheduler rather than mutating it",
  },
  {
    owner: "reorderDayExercises",
    category: "deliberate",
    why: "rejection fallback for legacy docs with no persisted instanceIds — writes directly ON PURPOSE and self-heals in one use (ADR-0011 names this one)",
  },
  {
    owner: "adoptLegacyTrainingBlock",
    category: "unaccounted",
    why: "NOT covered by ADR-0011's reasoning. Its blocker was the represcribe mirror, which §8.6 records as DONE on 2026-08-02 — so the stated obstacle no longer exists and nothing has recorded what replaced it",
  },
  {
    owner: "undoRecoveryReduction",
    category: "unaccounted",
    why: "NOT covered by ADR-0011's reasoning. Re-derives nothing and touches only workouts; it reads programState from a React closure and writes the whole document back, so a command landing in between is clobbered",
  },
  {
    owner: "realignRacePlan",
    category: "whole-plan",
    why: "regenerateRacePlan (the run scheduler) — §8.6 re-triaged it here after finding it writes only programState",
  },
];

/** Call sites, in file order, paired with the callback or effect they sit in. */
function saveProgramSites(): { line: number; owner: string }[] {
  const lines = readFileSync(SOURCE, "utf8").split("\n");
  const sites: { line: number; owner: string }[] = [];

  lines.forEach((line, i) => {
    // The call, not the declaration and not a mention in prose.
    if (!/\bsaveProgram\(/.test(line)) return;
    if (/const saveProgram|saveProgram =/.test(line)) return;
    if (/^\s*(\/\/|\*)/.test(line)) return;

    let owner = "unknown";
    for (let j = i; j >= 0 && j > i - 300; j -= 1) {
      const cb = /^\s{0,4}const (\w+) = useCallback/.exec(lines[j]);
      if (cb) {
        owner = cb[1];
        break;
      }
      if (/^\s{0,2}useEffect\(/.test(lines[j])) {
        owner = "useEffect";
        break;
      }
    }
    sites.push({ line: i + 1, owner });
  });
  return sites;
}

describe("programme document writers outside the command boundary", () => {
  it("finds the call sites at all", () => {
    /* Anti-vacuous. A scan that silently matched nothing would make every
       assertion below pass while the file could grow any number of new
       whole-document writers — the exact shape of test this repo keeps
       finding and rewriting. */
    expect(saveProgramSites().length).toBeGreaterThan(5);
  });

  it("is exactly the expected set of writers", () => {
    const actual = saveProgramSites().map((s) => s.owner);
    const expected = EXPECTED_WRITERS.map((w) => w.owner);
    expect(actual).toEqual(expected);
  });

  it("attributes no writer to an unresolved owner", () => {
    // "unknown" would mean the scan lost the thread, and a site nobody can
    // name is a site nobody reviews.
    expect(saveProgramSites().filter((s) => s.owner === "unknown")).toEqual([]);
  });

  it("matches ADR-0011's account for all but two, which are marked", () => {
    /* The ADR explains six week-engine/whole-plan sites plus one
       deliberate fallback. Two are outside that account. Pinning the
       SHAPE of the discrepancy rather than hiding it means the next
       person to open the ADR knows before they start that it does not
       describe everything — which is the thing three previous sessions
       each had to work out for themselves. */
    const byCategory = (c: string) =>
      EXPECTED_WRITERS.filter((w) => w.category === c).length;
    expect(byCategory("week-engine") + byCategory("whole-plan")).toBe(6);
    expect(byCategory("deliberate")).toBe(1);
    expect(byCategory("unaccounted")).toBe(2);
  });

  it("gives every writer a reason", () => {
    for (const w of EXPECTED_WRITERS) {
      expect(w.why.length, `${w.owner} has no reason recorded`).toBeGreaterThan(
        30
      );
    }
  });
});
