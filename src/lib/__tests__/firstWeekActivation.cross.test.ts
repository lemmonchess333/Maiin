import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { isFirstWeekWorkoutEligible } from "../firstWeek";
import { isVolumeEligible } from "../runStatsEligibility";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/firstWeekActivation.js") as {
  isFirstWeekWorkoutEligible: (value: unknown) => boolean;
};
const { isVolumeEligibleRun } =
  require("../../../functions/lib/runEligibility.js") as {
    isVolumeEligibleRun: (value: unknown) => boolean;
  };

describe("first-week activity validity stays aligned across client and server", () => {
  const workoutCases: unknown[] = [
    null,
    {},
    { exercises: [] },
    { exercises: [{ sets: [] }] },
    { exercises: [{ sets: [{ reps: 0 }] }] },
    { exercises: [{ sets: [{ reps: -2 }] }] },
    { exercises: [{ sets: [{ reps: 8 }] }] },
    { exercises: [{ repUnit: "seconds", sets: [{ reps: 45 }] }] },
    { exercises: [{ repUnit: "seconds", durationMinutes: 3, sets: [] }] },
    { exercises: [{ durationMinutes: 3, sets: [] }] },
    { exercises: [null, { sets: [null, { reps: 5 }] }] },
  ];

  it.each(workoutCases)("matches workout eligibility for %j", (workout) => {
    expect(isFirstWeekWorkoutEligible(workout as never)).toBe(
      server.isFirstWeekWorkoutEligible(workout)
    );
  });

  const runCases = [
    { distance: 50, duration: 30 },
    { distance: 49, duration: 30 },
    { distance: 50, duration: 29 },
    { distance: 1200, duration: 500, savedAnyway: true },
    { distance: 1200, duration: 500, isInvalid: true },
  ];

  it.each(runCases)("matches run eligibility for %j", (run) => {
    expect(isVolumeEligible(run)).toBe(isVolumeEligibleRun(run));
  });
});
