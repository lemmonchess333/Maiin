/**
 * The running simulator (training-engine prompt, Phase 2): the run and
 * hybrid personas live their plans through the app's own run code and its
 * server's (`src/test/sim/runSeason.ts`, driven a day at a time by
 * `liftSeason.ts`), and the suite holds the same three things as the
 * lifting one:
 *
 *   - the app's rules (`Rule`): none broken, or only those listed below,
 *     each with the finding that explains it;
 *   - each persona's trace (`__traces__/run/`), runs and, for a hybrid,
 *     lifts, so any change to what the plan does shows as a diff to read;
 *   - the coaching checks (`runCoaching.ts`, and `liftCoaching.ts` for a
 *     hybrid's lifting), in the same ratchet.
 *
 * The findings are written up in
 * docs/training-engine-2026-10/simulator.md. Seed 1, the base model: the
 * outcome suite (`runOutcomes.sim.test.ts`) runs the other seeds and the
 * harsh model.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { coachingFindings } from "@/test/sim/liftCoaching";
import {
  describeFailure,
  simulateLiftSeason,
  type LiftPersona,
  type Rule,
  type Season,
} from "@/test/sim/liftSeason";
import { liftTrace } from "@/test/sim/liftTrace";
import { runCoachingFindings } from "@/test/sim/runCoaching";
import { HALF_ON_3_DAYS, RUN_PERSONAS } from "@/test/sim/runPersonas";
import { runTrace } from "@/test/sim/runTrace";

const SEED = 1;
/** A year's season takes about a second here; CI's slowest jobs run
 *  several suites at once. */
const TIMEOUT = 60_000;

/**
 * Rules each persona breaks today, by the finding that explains them (the
 * doc has each). Take an entry out with its fix. The running side's
 * (F13, F14, F16, F22) are fixed, and so is what was left of the lifting
 * side's on a hybrid: F10 `below-bar` with Pgm8 L15, which builds the
 * hybrids' 10–15 kg barbell curls as dumbbell curls, and F8 `over-time`
 * with it, as the time fit prices the dumbbell curl's warm-ups when the
 * plan is built and gives the day's squat a set back.
 */
const KNOWN_RULE_FAILURES: Partial<Record<string, readonly Rule[]>> = {};

/**
 * Coaching findings each persona has today; a hybrid's lifting ones carry
 * `lift:`. Take an entry out with its fix. F17's `derived-low` and
 * `easy-nag` came out with Pgm8 R1: the benchmark the app derives comes from
 * a race or a tempo's work, never easy runs, and at seed 1 lands within a
 * VDOT of the runner, so the run summary stopped telling them to slow down.
 *
 * - F15 `under-dose`: setup never asks how much someone runs, so the plan
 *   starts a runner on 175–280 minutes a week at 57–75% of it.
 * - F18, the plan's shape (running-engine-audit §7): long runs that step
 *   past the single-run guard (`spike`), weeks that jump (`volume-jump`),
 *   long runs over half the week (`long-share`), demanding days back to
 *   back on the longer plans (`back-to-back`), and a 10K's taper that
 *   still cuts over half in one step (`taper-cut`). A new runner's
 *   run-walk weeks, the stepped taper with its long run, the spacing and
 *   two run days for a race took out the rest, and the climb from what was
 *   done took the hybrids' `back-to-back` and the 10K's `taper-cut`.
 * - F4 `lift:misses`: the lifting side's, on a hybrid.
 */
const KNOWN_COACHING: Partial<Record<string, readonly string[]>> = {
  "couch-to-5k": ["spike", "volume-jump"],
  "half-3-days": ["long-share", "spike", "under-dose", "volume-jump"],
  "sub-3-30": ["spike", "under-dose", "volume-jump"],
  "sick-six-weeks": ["spike", "under-dose", "volume-jump"],
  "new-runner-marathon": ["long-share", "spike", "volume-jump"],
  "year-out-marathon": ["back-to-back", "spike", "volume-jump"],
  "hybrid-3-4-trim": ["spike", "volume-jump"],
  "hybrid-3-4-no-trim": ["spike", "volume-jump"],
  "hybrid-2-3-trim": ["lift:misses:overhead-press", "spike"],
  "hybrid-2-3-no-trim": ["lift:misses:overhead-press", "spike"],
  /* The owner's own set-up (R5): six run days and six lift days, a
     marathon 25 weeks out from about 3 km a run. The long run climbs a rung
     a done week from their 25 minutes, at the pace of their own runs, each
     rung past the single-run guard (`spike`, Run23's one-rung steps). The
     marathon read whole (R1) gives a benchmark 5 VDOT under them, which
     then calls their recovery runs too fast (`derived-low`, `easy-nag`).
     Six lift days leave a major group out of some weeks
     (`lift:acsm-coverage`). */
  "owner-marathon": [
    "derived-low",
    "easy-nag",
    "lift:acsm-coverage:chest",
    "lift:acsm-coverage:posterior",
    "lift:acsm-coverage:quads",
    "long-share",
    "spike",
    "volume-jump",
  ],
};

const seasons = new Map<string, Season>();
function seasonOf(persona: LiftPersona, weeks: number): Season {
  let season = seasons.get(persona.name);
  if (!season) {
    season = simulateLiftSeason(persona, { weeks, seed: SEED });
    seasons.set(persona.name, season);
  }
  return season;
}

const lifts = (persona: LiftPersona) => persona.tracked.length > 0;

describe.each(RUN_PERSONAS.map((p) => [p.persona.name, p] as const))(
  "%s",
  (name, { persona, weeks }) => {
    it(
      "keeps the app's rules, or only the ones known broken",
      () => {
        const season = seasonOf(persona, weeks);
        const known = KNOWN_RULE_FAILURES[name] ?? [];
        const fresh = season.failures
          .filter((f) => !known.includes(f.rule))
          .slice(0, 10)
          .map((f) => describeFailure(season, f));
        expect(fresh).toEqual([]);
        // A known failure that no longer happens: take it out of the list.
        const broken = new Set(season.failures.map((f) => f.rule));
        expect(known.filter((rule) => !broken.has(rule))).toEqual([]);
      },
      TIMEOUT
    );

    it(
      "does what its trace says",
      async () => {
        const season = seasonOf(persona, weeks);
        const text = lifts(persona)
          ? `${runTrace(season, persona)}\n${liftTrace(season, persona.tracked)}`
          : runTrace(season, persona);
        await expect(text).toMatchFileSnapshot(`./__traces__/run/${name}.txt`);
      },
      TIMEOUT
    );

    it(
      "has only the coaching findings known today",
      () => {
        const season = seasonOf(persona, weeks);
        const found = [
          ...runCoachingFindings(season, persona),
          ...(lifts(persona)
            ? coachingFindings(season, persona).map((f) => `lift:${f}`)
            : []),
        ].sort();
        expect(found).toEqual([...(KNOWN_COACHING[name] ?? [])].sort());
      },
      TIMEOUT
    );
  }
);

describe("the run simulator", () => {
  it(
    "replays a season exactly from its seed",
    () => {
      const once = simulateLiftSeason(HALF_ON_3_DAYS, { weeks: 6, seed: 7 });
      const again = simulateLiftSeason(HALF_ON_3_DAYS, { weeks: 6, seed: 7 });
      expect(runTrace(again, HALF_ON_3_DAYS)).toBe(
        runTrace(once, HALF_ON_3_DAYS)
      );
    },
    TIMEOUT
  );

  it(
    "draws a different runner from a different seed",
    () => {
      const one = simulateLiftSeason(HALF_ON_3_DAYS, { weeks: 6, seed: 7 });
      const other = simulateLiftSeason(HALF_ON_3_DAYS, { weeks: 6, seed: 8 });
      expect(runTrace(other, HALF_ON_3_DAYS)).not.toBe(
        runTrace(one, HALF_ON_3_DAYS)
      );
    },
    TIMEOUT
  );
});
