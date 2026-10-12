/**
 * The lifting simulator (training-engine prompt, Phase 2): each persona
 * lives 26 weeks through the app's own plan code, one day at a time
 * (`src/test/sim/liftSeason.ts`), and the suite holds three things:
 *
 *   - the app's rules (`Rule`): none broken, or only those listed below,
 *     each with the finding that explains it;
 *   - each persona's trace (`__traces__/`), so any change to what the plan
 *     does shows as a diff to read, and lands with `-u` once read;
 *   - the coaching checks (`liftCoaching.ts`), in a ratchet like
 *     `planSweep.golden.test.ts`'s: today's findings pinned, a new one fails,
 *     and a fix that clears one must take its entry out.
 *
 * The findings are written up in
 * docs/training-engine-2026-10/simulator.md. Seed 1, the base model: the
 * outcome suite (`liftOutcomes.sim.test.ts`) runs the other seeds and the
 * harsh model.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { generateInstanceId } from "@/features/program/programTypes";
import { coachingFindings } from "@/test/sim/liftCoaching";
import { LIFT_PERSONAS, NOVICE_WOMAN } from "@/test/sim/liftPersonas";
import {
  describeFailure,
  simulateLiftSeason,
  type LiftPersona,
  type Rule,
  type Season,
} from "@/test/sim/liftSeason";
import { liftTrace } from "@/test/sim/liftTrace";

const WEEKS = 26;
const SEED = 1;
/** A season takes a tenth of a second here; CI's slowest jobs run several
 *  suites at once. */
const TIMEOUT = 30_000;

/**
 * Rules each persona breaks today, by the finding that explains them (the
 * doc has each). Take an entry out with its fix.
 *
 * - F8 `over-time`: the time fit prices a light barbell lift's warm-ups at
 *   its starting weight, and it gains warm-up sets as it grows, so a
 *   60-minute session drifts to 61–62. The intermediate man's arms day
 *   runs over as well now: his press passes 50 kg there, and the dumbbell
 *   curl's warm-up set takes the minute the barbell curl left.
 *
 * F10 `below-bar` is gone: Pgm8 L15 builds a new plan's barbell lift whose
 * first weight would be under the 20 kg bar as its dumbbell version (the
 * curls, skull crushers and weak lifters' presses it found). F8 went with
 * it for the powerbuilder on Get stronger and both layoff personas: the
 * dumbbell curl's warm-ups are priced when the plan is built, so the day
 * gave a set back then (a pull-up or squat set), and has room for what its
 * lifts gain.
 */
const KNOWN_RULE_FAILURES: Partial<Record<string, readonly Rule[]>> = {
  "intermediate-man": ["over-time"],
  holidays: ["over-time"],
};

/**
 * Coaching findings each persona has today. Take an entry out with its
 * fix.
 *
 * - F9 `stall`: a light lift whose next weight is more than 15% heavier
 *   waits at a stretched rep target for the person to pick it up, with
 *   reps to spare (a 10 kg leg curl or calf raise, dumbbells from 10 kg).
 *   The ceiling from Nuzzo 2024's means (Pgm7 A3) is a few reps under
 *   Epley's, so the wait starts sooner, and shows in lifts Epley's let
 *   climb on: a light curl or pushdown at 17 reps, not 20. The dumbbell
 *   curls and presses Pgm8 L15 builds wait the same way (5 kg to 6 kg is
 *   20%), as the barbell ones under the bar did (F2).
 * - F4 `misses`: the plan's steps outrun a lifter who gains slowly or
 *   trains half the planned sessions. The over-55's press is no longer
 *   one: a 15 kg barbell press at her 15 kg 1RM, it is a 5 kg dumbbell
 *   press now (L15).
 * - F12 `acsm-size:quads`: size plans give the quads 9 sets a week.
 */
const KNOWN_COACHING: Partial<Record<string, readonly string[]>> = {
  "novice-man": ["stall:db-curl"],
  "novice-woman": [
    "stall:db-shoulder-press",
    "stall:seated-calf-raise",
    "stall:standing-calf-raise",
  ],
  "intermediate-woman": ["acsm-size:quads"],
  "powerbuilder-size": ["acsm-size:quads"],
  "light-trainer": [
    "misses:overhead-press",
    "misses:squat",
    "stall:db-bench",
    "stall:db-curl",
    "stall:rope-tricep-pushdown",
  ],
  "dumbbell-beginner": [
    "stall:db-curl",
    "stall:db-rdl",
    "stall:db-row",
    "stall:db-shoulder-press",
    "stall:goblet-squat",
  ],
  "off-sick": ["misses:overhead-press", "stall:db-curl"],
  holidays: ["acsm-size:quads"],
  "over-55": [
    "misses:bench-press",
    "misses:deadlift",
    "stall:db-shoulder-press",
    "stall:seated-calf-raise",
    "stall:standing-calf-raise",
  ],
};

const seasons = new Map<string, Season>();
function seasonOf(persona: LiftPersona): Season {
  let season = seasons.get(persona.name);
  if (!season) {
    season = simulateLiftSeason(persona, { weeks: WEEKS, seed: SEED });
    seasons.set(persona.name, season);
  }
  return season;
}

describe.each(LIFT_PERSONAS.map((p) => [p.name, p] as const))(
  "%s",
  (name, persona) => {
    it(
      "keeps the app's rules, or only the ones known broken",
      () => {
        const season = seasonOf(persona);
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
        await expect(
          liftTrace(seasonOf(persona), persona.tracked)
        ).toMatchFileSnapshot(`./__traces__/${name}.txt`);
      },
      TIMEOUT
    );

    it(
      "has only the coaching findings known today",
      () => {
        expect(coachingFindings(seasonOf(persona), persona)).toEqual(
          [...(KNOWN_COACHING[name] ?? [])].sort()
        );
      },
      TIMEOUT
    );
  }
);

describe("the simulator", () => {
  it(
    "replays a season exactly from its seed",
    () => {
      const once = simulateLiftSeason(NOVICE_WOMAN, { weeks: 8, seed: 7 });
      const again = simulateLiftSeason(NOVICE_WOMAN, { weeks: 8, seed: 7 });
      expect(liftTrace(again, NOVICE_WOMAN.tracked)).toBe(
        liftTrace(once, NOVICE_WOMAN.tracked)
      );
    },
    TIMEOUT
  );

  it(
    "draws a different person from a different seed",
    () => {
      const one = simulateLiftSeason(NOVICE_WOMAN, { weeks: 8, seed: 7 });
      const other = simulateLiftSeason(NOVICE_WOMAN, { weeks: 8, seed: 8 });
      expect(liftTrace(other, NOVICE_WOMAN.tracked)).not.toBe(
        liftTrace(one, NOVICE_WOMAN.tracked)
      );
    },
    TIMEOUT
  );

  it(
    "leaves the clock and the id source as it found them",
    () => {
      const before = Date.now();
      simulateLiftSeason(NOVICE_WOMAN, { weeks: 1, seed: 1 });
      expect(vi.isFakeTimers()).toBe(false);
      expect(Math.abs(Date.now() - before)).toBeLessThan(60_000);
      expect(generateInstanceId()).not.toMatch(/^novice-woman-1-/);
    },
    TIMEOUT
  );
});
