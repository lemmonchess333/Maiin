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
 *   60-minute session drifts to 61–63.
 * - F10 `below-bar`: barbell curls, skull crushers and a weak lifter's
 *   press planned lighter than the 20 kg bar.
 */
const KNOWN_RULE_FAILURES: Partial<Record<string, readonly Rule[]>> = {
  "novice-man": ["below-bar"],
  "novice-woman": ["below-bar"],
  "intermediate-man": ["over-time"],
  "intermediate-woman": ["below-bar"],
  "advanced-man": ["below-bar"],
  "powerbuilder-size": ["below-bar"],
  "powerbuilder-strength": ["over-time"],
  "light-trainer": ["below-bar"],
  "layoff-eases-back": ["below-bar", "over-time"],
  "layoff-keeps-weights": ["below-bar", "over-time"],
  "off-sick": ["below-bar"],
  holidays: ["below-bar", "over-time"],
  "over-55": ["below-bar"],
};

/**
 * Coaching findings each persona has today. Take an entry out with its
 * fix.
 *
 * - F9 `stall`: a light lift whose next weight is more than 15% heavier
 *   waits at a stretched rep target for the person to pick it up, with
 *   reps to spare (a 10 kg leg curl at 20 reps, dumbbells from 10 kg).
 * - F11 `stall:squat`: one exercise on two days pre-fills each day's sets
 *   from the other day's last session.
 * - F4 `misses`: the plan's steps outrun a lifter who gains slowly or
 *   trains half the planned sessions.
 * - F12 `acsm-size:quads`: size plans give the quads 9 sets a week.
 */
const KNOWN_COACHING: Partial<Record<string, readonly string[]>> = {
  "novice-man": ["stall:barbell-curl", "stall:squat"],
  "novice-woman": [
    "stall:overhead-press",
    "stall:seated-calf-raise",
    "stall:seated-leg-curl",
  ],
  "intermediate-woman": ["acsm-size:quads"],
  "powerbuilder-size": ["acsm-size:quads"],
  "light-trainer": ["misses:overhead-press", "misses:squat", "stall:db-bench"],
  "dumbbell-beginner": [
    "stall:db-rdl",
    "stall:db-row",
    "stall:db-shoulder-press",
    "stall:goblet-squat",
  ],
  "off-sick": ["misses:overhead-press"],
  holidays: ["acsm-size:quads"],
  "over-55": [
    "misses:bench-press",
    "misses:deadlift",
    "misses:overhead-press",
    "stall:seated-calf-raise",
    "stall:seated-leg-curl",
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
