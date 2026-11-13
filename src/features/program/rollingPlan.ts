/**
 * Run24 (3), deep dive D7: running plans with no race date. A rolling plan
 * keeps going on a four-week cycle (three weeks that build, one that steps
 * back; `isRollingStepBack`), climbs from where the runner is to its goal's
 * soft horizon (a long run, an easy run and a week's minutes), then holds
 * there and keeps rotating its quality sessions. The weeks are built by
 * `rollingRun` in `runScheduler.ts` with the race plan's own ladders,
 * placement and fits; this module is what each goal asks of them.
 *
 * The same rolling weeks run before a race block that the race is too far
 * away to fill (`raceBaseRolling`, `RACE_BLOCK_MAX_WEEKS`).
 *
 * Every number here is a Tropos heuristic in the RUN-EV-06 register: the
 * horizons sit at or under the race plans' own peaks for the distance (a
 * 5K plan's 8 km long run, a 10K's 12), and the rotations use the sessions
 * the race plans already hold.
 */

/** The goals a plan with no race date can have. */
export type RollingGoal = "build_5k" | "build_10k" | "faster_5k" | "keep_fit";

export const ROLLING_GOALS: readonly RollingGoal[] = [
  "keep_fit",
  "build_5k",
  "build_10k",
  "faster_5k",
];

/** A quality slot in a rolling week: a session from one of the ladders, a
 *  week of strides alone, or the short reps (`8x400`). */
export type RollingQuality = "tempo" | "intervals" | "reps" | "strides";

/**
 * What a rolling run climbs to and then holds: its soft horizon. A runner
 * whose own week is already above it keeps their own (the generator takes
 * the larger), so a goal never cuts anyone's running.
 */
export interface RollingHorizon {
  /** The long run's top rung, km. */
  longKm: number;
  /** An ordinary easy run's top, minutes. */
  easyMinutes: number;
  /** The week's one medium-long easy run's top, minutes (RUN-EV-11). */
  mediumLongMinutes: number;
  /** The week's planned minutes, past which its easy runs give way, a tier
   *  at a time, never under 30. */
  weekMinutes: number;
}

/**
 * What a rolling run asks of the generator: its horizon, the quality it
 * rotates through its build weeks, how far up each ladder that quality
 * climbs, and whether it holds time trials (Run24 (4)).
 */
export interface RollingSpec {
  horizon: RollingHorizon;
  /** The build weeks' quality, in turn. A step-back week holds strides. */
  rotation: readonly RollingQuality[];
  /** The tempo ladder's top, work minutes, and the 1 km reps' top. */
  qualityPeak: { tempoWorkMinutes: number; intervalReps: number };
  /** A 3 km trial in the second week without a benchmark, then a 5 km
   *  about every five weeks, as a race block holds them. */
  timeTrials: boolean;
  /** The long run a runner with no starting point opens on, km. */
  startLongKm: number;
}

/**
 * Each goal's run. Build to 5K climbs to a long run past the distance and
 * keeps its quality to strides and a short tempo; build to 10K climbs to
 * the 10K plan's 12 km peak; get faster at 5K holds a 10 km long run and
 * rotates the 1 km reps, a tempo and short reps, which is where a 5K's
 * speed comes from; keep fit holds a 10 km long run and an easy week with a
 * light tempo, strides and short reps in turn.
 */
export const ROLLING_SPECS: Record<RollingGoal, RollingSpec> = {
  build_5k: {
    horizon: {
      longKm: 8,
      easyMinutes: 40,
      mediumLongMinutes: 40,
      weekMinutes: 150,
    },
    rotation: ["strides", "strides", "tempo"],
    qualityPeak: { tempoWorkMinutes: 20, intervalReps: 4 },
    timeTrials: false,
    startLongKm: 6,
  },
  build_10k: {
    horizon: {
      longKm: 12,
      easyMinutes: 50,
      mediumLongMinutes: 60,
      weekMinutes: 240,
    },
    rotation: ["tempo", "strides", "intervals"],
    qualityPeak: { tempoWorkMinutes: 30, intervalReps: 5 },
    timeTrials: true,
    startLongKm: 6,
  },
  faster_5k: {
    horizon: {
      longKm: 10,
      easyMinutes: 50,
      mediumLongMinutes: 50,
      weekMinutes: 240,
    },
    rotation: ["intervals", "tempo", "reps"],
    qualityPeak: { tempoWorkMinutes: 20, intervalReps: 6 },
    timeTrials: true,
    startLongKm: 6,
  },
  keep_fit: {
    horizon: {
      longKm: 10,
      easyMinutes: 40,
      mediumLongMinutes: 50,
      weekMinutes: 180,
    },
    rotation: ["tempo", "strides", "reps"],
    qualityPeak: { tempoWorkMinutes: 20, intervalReps: 4 },
    timeTrials: true,
    startLongKm: 6,
  },
};

/**
 * The long run the rolling base before a race block holds, by the race's
 * distance (Run24 (3), D9): the 5K and 10K plans' own peaks, and for a half
 * or a marathon a long run well short of the race (14 and 18 km), so the
 * months before a race far away build and keep a long run the block then
 * starts from, where a block opening at its base (10 and 14 km) held the
 * long run still for months.
 */
const RACE_BASE_LONG_KM: Record<"5k" | "10k" | "half" | "marathon", number> = {
  "5k": 8,
  "10k": 12,
  half: 14,
  marathon: 18,
};

/**
 * The rolling base before a race block (Run24 (3), D9): keep fit's run,
 * held at the long run for the race's distance and with a medium-long for
 * a half or a marathon. Its horizon is the block's opening: the block
 * starts from it.
 */
export function raceBaseRolling(
  distance: "5k" | "10k" | "half" | "marathon"
): RollingSpec {
  const longer = distance === "half" || distance === "marathon";
  return {
    ...ROLLING_SPECS.keep_fit,
    horizon: {
      longKm: RACE_BASE_LONG_KM[distance],
      easyMinutes: 40,
      mediumLongMinutes: longer ? 50 : 40,
      weekMinutes: longer ? 240 : 180,
    },
  };
}

/** How many build weeks a rolling long run takes per rung of the ladder:
 *  two, so it climbs about 3 km a month, more slowly than a race block's
 *  rung a week, as a plan with no date has no reason to hurry. */
export const ROLLING_WEEKS_PER_LONG_RUNG = 2;

/** How many build weeks a rolling easy run takes per 10-minute tier: three,
 *  a tier a cycle. */
export const ROLLING_WEEKS_PER_EASY_TIER = 3;
