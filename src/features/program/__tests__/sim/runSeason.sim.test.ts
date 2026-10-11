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
 * doc has each). Take an entry out with its fix.
 *
 * - F13 `not-counted`: Home counts a tempo or interval day only when the
 *   whole run averaged under 4:30/km, so a recreational runner's quality
 *   sessions never count.
 * - F14 `race-day-card`: setup's week schedules never run on a Sunday, and
 *   Home shows a run only on a run day, so race day reads as a rest day.
 * - F16 `before-plan`: a plan made on a Thursday writes that week's Monday
 *   and Wednesday runs.
 * - F22 `verdict-slow`: the run summary judges a tempo on the whole run's
 *   average, warm-up and cool-down included, so one run at its tempo pace
 *   reads slow (Phase 5a).
 * - F8 `over-time` and F10 `below-bar`: the lifting side's, on a hybrid.
 */
const KNOWN_RULE_FAILURES: Partial<Record<string, readonly Rule[]>> = {
  "couch-to-5k": ["before-plan", "not-counted", "race-day-card"],
  "half-3-days": ["not-counted", "race-day-card", "verdict-slow"],
  "sub-3-30": ["not-counted", "race-day-card", "verdict-slow"],
  "sick-six-weeks": ["not-counted", "race-day-card"],
  "new-runner-marathon": ["race-day-card"],
  "year-out-marathon": [
    "below-bar",
    "not-counted",
    "over-time",
    "verdict-slow",
  ],
  "hybrid-3-4-trim": ["below-bar", "not-counted", "over-time", "verdict-slow"],
  "hybrid-3-4-no-trim": [
    "below-bar",
    "not-counted",
    "over-time",
    "verdict-slow",
  ],
  "hybrid-2-3-trim": ["below-bar", "not-counted", "race-day-card"],
  "hybrid-2-3-no-trim": ["below-bar", "not-counted", "race-day-card"],
};

/**
 * Coaching findings each persona has today; a hybrid's lifting ones carry
 * `lift:`. Take an entry out with its fix.
 *
 * - F15 `under-dose`: setup never asks how much someone runs, so the plan
 *   starts a runner on 175–280 minutes a week at 57–75% of it.
 * - F17 `derived-low`: the benchmark the app derives reads the best of the
 *   first easy runs as a race, 7–10 VDOT under the runner; `easy-nag`: the
 *   run summary, which reads it at once, then tells the runner to slow down
 *   on most easy and long runs.
 * - F18, the plan's shape (running-engine-audit §7): long runs that step
 *   past the single-run guard (`spike`), weeks that jump (`volume-jump`),
 *   demanding days back to back, a one-step taper with no long run
 *   (`taper-cut`, `taper-long`), long runs over half the week
 *   (`long-share`), and for a new runner, continuous runs from week 1
 *   (`run-walk`), quality from week 5 (`novice-quality`) and a marathon on
 *   one run a week (`one-run-week`).
 * - F4 `lift:misses`: the lifting side's, on a hybrid.
 */
const KNOWN_COACHING: Partial<Record<string, readonly string[]>> = {
  "couch-to-5k": [
    "derived-low",
    "easy-nag",
    "novice-quality",
    "run-walk",
    "spike",
    "volume-jump",
  ],
  "half-3-days": [
    "long-share",
    "spike",
    "taper-cut",
    "taper-long",
    "under-dose",
    "volume-jump",
  ],
  "sub-3-30": [
    "back-to-back",
    "spike",
    "taper-cut",
    "taper-long",
    "under-dose",
    "volume-jump",
  ],
  "sick-six-weeks": ["back-to-back", "spike", "under-dose", "volume-jump"],
  "new-runner-marathon": [
    "derived-low",
    "easy-nag",
    "long-share",
    "one-run-week",
    "run-walk",
    "spike",
    "taper-cut",
    "taper-long",
    "volume-jump",
  ],
  "freeform-runner": ["derived-low"],
  "year-out-marathon": [
    "back-to-back",
    "spike",
    "taper-cut",
    "taper-long",
    "volume-jump",
  ],
  "hybrid-3-4-trim": [
    "back-to-back",
    "spike",
    "taper-cut",
    "taper-long",
    "volume-jump",
  ],
  "hybrid-3-4-no-trim": [
    "back-to-back",
    "spike",
    "taper-cut",
    "taper-long",
    "volume-jump",
  ],
  "hybrid-2-3-trim": [
    "back-to-back",
    "derived-low",
    "easy-nag",
    "lift:misses:overhead-press",
    "spike",
    "taper-cut",
    "volume-jump",
  ],
  "hybrid-2-3-no-trim": [
    "back-to-back",
    "derived-low",
    "easy-nag",
    "lift:misses:overhead-press",
    "spike",
    "taper-cut",
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
