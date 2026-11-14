/**
 * The person's actions (training-engine prompt, Phase 2): people who tap
 * Skip, swap a lift, replace one, take "Easier today", take a lighter week
 * or move a run, each through the command or the choice the app makes of
 * it (`src/test/sim/commands.ts`, `actionPersonas.ts`). The suite holds the
 * same three things as the lifting and running ones: the app's rules
 * (`Rule`), each persona's trace (`__traces__/actions/`) and the coaching
 * checks, in the same ratchet. Seed 1, the base model.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { ACTION_PERSONAS } from "@/test/sim/actionPersonas";
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
import { runTrace } from "@/test/sim/runTrace";

const SEED = 1;
const TIMEOUT = 60_000;

/**
 * Rules each persona breaks today, by the finding that explains them
 * (docs/training-engine-2026-10/simulator.md). Take an entry out with its
 * fix. None is broken today: F10 `below-bar` went with Pgm8 L15 and F8
 * `over-time` with Lift7, and the actions' own (F20 `session-off-grid`,
 * F21 `run-day-card`) are fixed, with the running side's.
 */
const KNOWN_RULE_FAILURES: Partial<Record<string, readonly Rule[]>> = {};

/**
 * Coaching findings each persona has today; a runner's lifting ones carry
 * `lift:`. Take an entry out with its fix. F4 `misses`, F9 `stall`, F12
 * `acsm-size:quads`, F15 `under-dose` and F18's plan shape are the base
 * personas'. Two follow the person's own choice:
 *
 * - `acsm-heavy:bench-press`: the kept swap took the barbell bench out of
 *   the plan in week 3.
 * - `stall:leg-press`: a swap Finish doesn't keep starts each session from
 *   last time's weight, and the app never moves it (Lift4 (11)).
 *
 * `acsm-heavy:seated-row` is the replacing row, tracked for the trace: an
 * accessory climbing 6–10 reps, never heavy. One more:
 *
 * - `stall:deadlift` after misses: F23. After one session's last two sets
 *   came down to 132.5 kg, the 5-rep slot starts them there again, under
 *   its 155 kg, and doesn't step until all four go at 155: misses (F4) and
 *   lighter weeks between, March to June. Since Lift11 this persona's
 *   60-minute days hold the deadlift at two sets, and neither it nor the
 *   hack squat waits long enough for the check to see; F23 itself is
 *   unchanged.
 *
 * The easier days' `stall:overhead-press` (F9 on a press under the bar,
 * which an easier session held where it was) went with Pgm8 L15: the
 * press is a 5 kg dumbbell press now, and an easier session takes it to
 * 4 kg, so its plan numbers never sit still for the check's eight
 * sessions, although it still waits at 15 reps.
 *
 * Since Lift21 (one main lift a day, sets by place):
 *
 * - `misses:bench-press` after misses: four sets of five across on the
 *   bench, all built now, and the fourth is the set that goes (F4).
 * - `stall:barbell-row` after misses: the day's first pull takes its
 *   press's four sets, the person loads it past the plan's weight, and the
 *   fourth set is the one that falls a rep short. With a lighter week after
 *   every third miss, every other session of it is an easy one, and the
 *   plan waits at 67.5 kg for 6 from March to May (F4, F9).
 * - the half marathoner's `lift:stall` on the squat, the deadlift and the
 *   Romanian deadlift: a race build holds its leg lifts' numbers, and the
 *   deadlift's own range (5 to 8) reaches its top sooner than 8 to 12 did,
 *   so the wait is long enough for the check to see.
 * - gone: the light trainer's missed press, the swapped squat's
 *   `acsm-size:quads` (F12) and the dumbbell lifter's waiting curl; the
 *   half marathoner's `long-share` and `under-dose`, with the plan started
 *   from their own week (Run24 (2)). Their `volume-jump`, gone with Run24
 *   (6)'s hold of a week to 15% over the last full one, is back: the week
 *   after their cutback is 28% over it, 9% over the week before it.
 */
const KNOWN_COACHING: Partial<Record<string, readonly string[]>> = {
  "light-trainer-skips": [
    "stall:db-bench",
    "stall:db-curl",
    "stall:rope-tricep-pushdown",
  ],
  "swaps-bench-keeps": ["acsm-heavy:bench-press"],
  "swaps-squat-today": ["stall:leg-press"],
  "replaces-row": ["acsm-heavy:seated-row", "stall:db-curl"],
  "lighter-after-misses": ["misses:bench-press", "stall:barbell-row"],
  "hybrid-lighter-week": [
    "lift:stall:deadlift",
    "lift:stall:romanian-deadlift",
    "lift:stall:squat",
    "spike",
    "volume-jump",
  ],
  "half-moves-long-run": ["spike", "volume-jump"],
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

describe.each(ACTION_PERSONAS.map((p) => [p.persona.name, p] as const))(
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
        const broken = new Set(season.failures.map((f) => f.rule));
        expect(known.filter((rule) => !broken.has(rule))).toEqual([]);
      },
      TIMEOUT
    );

    it(
      "does what its trace says",
      async () => {
        const season = seasonOf(persona, weeks);
        const text = !persona.running
          ? liftTrace(season, persona.tracked)
          : lifts(persona)
            ? `${runTrace(season, persona)}\n${liftTrace(season, persona.tracked)}`
            : runTrace(season, persona);
        await expect(text).toMatchFileSnapshot(
          `./__traces__/actions/${name}.txt`
        );
      },
      TIMEOUT
    );

    it(
      "has only the coaching findings known today",
      () => {
        const season = seasonOf(persona, weeks);
        const found = persona.running
          ? [
              ...runCoachingFindings(season, persona),
              ...(lifts(persona)
                ? coachingFindings(season, persona).map((f) => `lift:${f}`)
                : []),
            ]
          : coachingFindings(season, persona);
        expect([...found].sort()).toEqual(
          [...(KNOWN_COACHING[name] ?? [])].sort()
        );
      },
      TIMEOUT
    );
  }
);
