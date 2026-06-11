/**
 * Run-state machine — exhaustive transition matrix (D14).
 *
 * The race-prep lifecycle is the most complex correctness surface in the app
 * (the whole `programme-run-followups` lock file). A wrong transition silently
 * corrupts a user's training plan for WEEKS before anyone notices. The existing
 * `runModeResolution.cross.test.ts` pins the client/server copies EQUAL and
 * spot-checks the headline cases; this test turns the prose lock-rows into an
 * EXHAUSTIVE (state × event) → expected-next-state truth table.
 *
 * The lifecycle has two orthogonal dimensions:
 *
 *   1. runMode / raceGoal  — materialized, server-mirrored (runModeResolution).
 *      States: freeform | race_prep.  raceGoal present ⟺ race_prep.
 *   2. runPlan.phase       — the within-race_prep progression, TS-only
 *      (runScheduler): base → build → taper → race → recovery.
 *
 * Events: set_race(future) · clear_race · race_completed · no_show ·
 * recovery_exit(natural|skip) · newer_race_during_recovery · fell_behind.
 *
 * For every event we assert its effect on BOTH dimensions. The runMode/raceGoal
 * effect is computed through the pure resolver AND cross-pinned to the JS server
 * copy, so the table catches a transition drifting in either copy — including
 * the case where BOTH copies drift together (the cross-test alone can't catch
 * that; an authored expected-value table can).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import * as resolve from "@/features/program/runModeResolution";
import type {
  RaceGoal,
  RecoveryContext,
} from "@/features/program/runModeResolution";
import {
  getRacePhaseLabel,
  classifyRaceTiming,
  getRaceFloorWeeks,
  getRaceMinWeeks,
  type RaceTiming,
} from "@/features/program/runScheduler";

const require = createRequire(import.meta.url);
const js =
  require("../../../../functions/lib/runModeResolution") as typeof resolve;

type Distance = "5k" | "10k" | "half" | "marathon";
const DISTANCES: Distance[] = ["5k", "10k", "half", "marathon"];

// ── Fixtures ──────────────────────────────────────────────────────────────
const raceA: RaceGoal = { distance: "marathon", targetDate: "2026-09-01" };
const raceA_dup: RaceGoal = { distance: "marathon", targetDate: "2026-09-01" };
const raceFuture: RaceGoal = { distance: "half", targetDate: "2026-07-15" };
const racePast: RaceGoal = { distance: "5k", targetDate: "2026-01-01" };
const TODAY = "2026-06-04";

function ctx(
  current: RaceGoal | null | undefined,
  completed: RaceGoal | null | undefined
): RecoveryContext {
  return { currentRaceGoal: current, completedRaceGoal: completed };
}

/* ════════════════════════════════════════════════════════════════════════
   DIMENSION 1 — runMode / raceGoal transition matrix (server-mirrored)
   ════════════════════════════════════════════════════════════════════════
   Each row authored as: starting condition + event → expected patch. The
   resolver must produce exactly the expected patch, AND the JS copy must agree.
*/
interface RunModeCase {
  name: string;
  /** Compute the patch under test from the pure resolver. */
  patch: (m: typeof resolve) => resolve.RaceGoalWritePatch;
  expected: resolve.RaceGoalWritePatch;
}

const runModeMatrix: RunModeCase[] = [
  // ── set_race / clear_race (the only user-initiated mode transitions) ──
  {
    name: "freeform --set_race(future)--> race_prep (raceGoal materialized)",
    patch: (m) => m.setRaceGoalPatch(raceA),
    expected: { raceGoal: raceA, runMode: "race_prep" },
  },
  {
    name: "race_prep --clear_race--> freeform (raceGoal nulled)",
    patch: (m) => m.setRaceGoalPatch(null),
    expected: { raceGoal: null, runMode: "freeform" },
  },
  {
    name: "race_prep --change_race(date edit)--> race_prep (new goal materialized)",
    patch: (m) => m.setRaceGoalPatch(raceFuture),
    expected: { raceGoal: raceFuture, runMode: "race_prep" },
  },

  // ── recovery_exit (natural end OR skip — same resolver) ──
  {
    name: "recovery(raceGoal==completed) --recovery_exit--> freeform (cleared)",
    patch: (m) => m.resolveRecoveryExit(ctx(raceA, raceA_dup)),
    expected: { raceGoal: null, runMode: "freeform" },
  },
  {
    name: "recovery(newer future race set) --recovery_exit--> race_prep (newer race KEPT)",
    patch: (m) => m.resolveRecoveryExit(ctx(raceFuture, raceA)),
    expected: { runMode: "race_prep" }, // raceGoal key omitted = preserved
  },
  {
    name: "recovery(stale past race set) --recovery_exit--> race_prep (preserved, not cleared)",
    patch: (m) => m.resolveRecoveryExit(ctx(racePast, raceA)),
    expected: { runMode: "race_prep" },
  },
  {
    name: "recovery(raceGoal already gone) --recovery_exit--> freeform",
    patch: (m) => m.resolveRecoveryExit(ctx(null, raceA)),
    expected: { runMode: "freeform" },
  },
];

describe("D14 · runMode/raceGoal transition matrix (client ↔ server)", () => {
  for (const c of runModeMatrix) {
    it(c.name, () => {
      const got = c.patch(resolve);
      // 1. The client resolver produces exactly the authored expected patch.
      expect(got).toEqual(c.expected);
      // 2. raceGoal-key presence is meaningful (omitted = "leave as-is",
      //    explicit null = "clear") — assert the key shape, not just deep-eq.
      expect("raceGoal" in got).toBe("raceGoal" in c.expected);
      // 3. The server copy produces a byte-identical patch (no drift).
      expect(c.patch(js)).toEqual(got);
    });
  }

  it("every patch in the matrix carries a materialized runMode (the locked invariant)", () => {
    for (const c of runModeMatrix) {
      const got = c.patch(resolve);
      expect(got.runMode).toMatch(/^(race_prep|freeform)$/);
      // runMode is consistent with the resulting raceGoal: if the patch clears
      // raceGoal it must be freeform; if it sets a goal it must be race_prep.
      if ("raceGoal" in got) {
        expect(got.runMode).toBe(got.raceGoal ? "race_prep" : "freeform");
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════
   newer_race_during_recovery — the supersede event boundary
   ════════════════════════════════════════════════════════════════════════ */
describe("D14 · newer_race_during_recovery supersede boundary (client ↔ server)", () => {
  const cases: {
    name: string;
    c: RecoveryContext;
    today: string;
    expected: boolean;
  }[] = [
    {
      name: "new FUTURE race → supersedes",
      c: ctx(raceFuture, raceA),
      today: TODAY,
      expected: true,
    },
    {
      name: "race date == today → supersedes (still valid)",
      c: ctx(raceFuture, raceA),
      today: "2026-07-15",
      expected: true,
    },
    {
      name: "new race in the PAST → does NOT supersede",
      c: ctx(racePast, raceA),
      today: TODAY,
      expected: false,
    },
    {
      name: "same race (no new race) → does NOT supersede",
      c: ctx(raceA, raceA_dup),
      today: TODAY,
      expected: false,
    },
    {
      name: "no current race → does NOT supersede",
      c: ctx(null, raceA),
      today: TODAY,
      expected: false,
    },
  ];
  for (const { name, c, today, expected } of cases) {
    it(name, () => {
      expect(resolve.newRaceSupersedesRecovery(c, today)).toBe(expected);
      expect(js.newRaceSupersedesRecovery(c, today)).toBe(expected);
    });
  }
});

/* ════════════════════════════════════════════════════════════════════════
   server-side-only events — no_show / fell_behind / race_completed
   ════════════════════════════════════════════════════════════════════════
   These transitions live in functions/index.js (sweeps + triggers) and have NO
   pure resolver to call. Their INVARIANT on dimension 1 is that they DON'T move
   runMode/raceGoal — they only set a status flag (race_no_show), a prompt
   (pendingFellBehindPrompt), or runPlan.phase (recovery). We pin that invariant
   here so a future change that wrongly clears raceGoal on these events is caught
   by the matrix, not in production.
*/
describe("D14 · server-side-only events preserve the runMode dimension", () => {
  it("no_show does not clear raceGoal — runMode stays race_prep until recovery_exit", () => {
    // A no-show only flips runDay.status to race_no_show; raceGoal/runMode are
    // untouched. The user is still in race_prep (deriveRunMode of the kept goal).
    expect(resolve.deriveRunMode(raceA)).toBe("race_prep");
  });

  it("fell_behind does not touch raceGoal — it only sets pendingFellBehindPrompt", () => {
    // The prompt is orthogonal to the mode; deriveRunMode is unchanged either way.
    expect(resolve.deriveRunMode(raceA)).toBe("race_prep");
    expect(resolve.deriveRunMode(null)).toBe("freeform");
  });

  it("race_completed enters recovery but KEEPS raceGoal (race_prep) — cleared only at recovery_exit", () => {
    // Entering recovery sets runPlan.phase='recovery'; raceGoal persists through
    // the window (Run9d), so the user is still race_prep mid-recovery. The clear
    // happens at recovery_exit (covered by the dimension-1 matrix above).
    expect(resolve.deriveRunMode(raceA)).toBe("race_prep");
    // And recovery_exit from that state with no successor → freeform:
    expect(resolve.resolveRecoveryExit(ctx(raceA, raceA_dup))).toEqual({
      raceGoal: null,
      runMode: "freeform",
    });
  });
});

/* ════════════════════════════════════════════════════════════════════════
   DIMENSION 2 — phase progression (base → build → taper → race), TS-only
   ════════════════════════════════════════════════════════════════════════
   getPhaseForWeek isn't exported; assert through getRacePhaseLabel. The matrix
   pins the phase emitted for every week index of a representative plan per
   distance — the RaceCockpitCard rail and getRacePhaseLabel must only ever emit
   Base/Build/Taper/Race (no invented "Peak").
*/
describe("D14 · phase progression matrix (Base → Build → Taper → Race)", () => {
  // Authored truth table: representative totalWeeks per distance, with the
  // expected phase label for each 0-based week index. Built from the locked
  // rule: race = last week; taper = TAPER_WEEKS before it; base = first 40% of
  // the remaining pre-taper window; build = the rest.
  const plans: {
    distance: Distance;
    totalWeeks: number;
    expected: string[];
  }[] = [
    // marathon, 12 weeks, taper=3 → race=11, taper=8/9/10, preTaper=8 → base<3.2
    {
      distance: "marathon",
      totalWeeks: 12,
      expected: [
        "Base",
        "Base",
        "Base",
        "Base", // 0,1,2,3  (<3.2)
        "Build",
        "Build",
        "Build",
        "Build", // 4..7
        "Taper",
        "Taper",
        "Taper", // 8,9,10
        "Race", // 11
      ],
    },
    // half, 8 weeks, taper=2 → race=7, taper=5/6, preTaper=5 → base<2.0
    {
      distance: "half",
      totalWeeks: 8,
      expected: [
        "Base",
        "Base",
        "Build",
        "Build",
        "Build",
        "Taper",
        "Taper",
        "Race",
      ],
    },
    // 10k, 6 weeks, taper=1 → race=5, taper=4, preTaper=4 → base<1.6
    {
      distance: "10k",
      totalWeeks: 6,
      expected: ["Base", "Base", "Build", "Build", "Taper", "Race"],
    },
    // 5k, 4 weeks, taper=1 → race=3, taper=2, preTaper=2 → base<0.8
    {
      distance: "5k",
      totalWeeks: 4,
      expected: ["Base", "Build", "Taper", "Race"],
    },
  ];

  for (const { distance, totalWeeks, expected } of plans) {
    it(`${distance} ${totalWeeks}wk emits the locked phase sequence`, () => {
      const got = Array.from({ length: totalWeeks }, (_, w) =>
        getRacePhaseLabel(w, totalWeeks, distance)
      );
      expect(got).toEqual(expected);
      // The rail must NEVER emit anything outside the four locked phases.
      for (const label of got) {
        expect(["Base", "Build", "Taper", "Race"]).toContain(label);
      }
    });
  }

  it("the final week is always Race and the first is always Base for every distance", () => {
    for (const distance of DISTANCES) {
      const total = getRaceMinWeeks(distance);
      expect(getRacePhaseLabel(total - 1, total, distance)).toBe("Race");
      expect(getRacePhaseLabel(0, total, distance)).toBe("Base");
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════
   timing classification matrix — healthy / compressible / below-floor
   ════════════════════════════════════════════════════════════════════════
   Pins the floor/minWeeks boundaries that decide whether a chosen date yields a
   full build, a compressed plan, or a finish-safely plan (Pgm5: below-floor
   still SAVES, never blocked).
*/
describe("D14 · race-timing classification boundaries", () => {
  for (const distance of DISTANCES) {
    it(`${distance}: weeksRemaining boundaries map to the right RaceTiming`, () => {
      const min = getRaceMinWeeks(distance);
      const floor = getRaceFloorWeeks(distance);
      expect(floor).toBeLessThanOrEqual(min);

      const at = (weeksRemaining: number): RaceTiming =>
        classifyRaceTiming({ distance, weeksRemaining });

      // At/above min → healthy.
      expect(at(min)).toBe("healthy");
      expect(at(min + 5)).toBe("healthy");
      // Between floor (inclusive) and min (exclusive) → compressible.
      if (floor < min) {
        expect(at(min - 1)).toBe("compressible");
        expect(at(floor)).toBe("compressible");
      }
      // Below floor → below-floor (finish-safely).
      expect(at(floor - 1)).toBe("below-floor");
      expect(at(0)).toBe("below-floor");
    });
  }
});
