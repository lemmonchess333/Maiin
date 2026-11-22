/**
 * Run24 (11), deep dive D14: Home's weekly race check through whole
 * marathon seasons, read as Home reads it each day the app is opened, from
 * the plan, the profile and the runs it read then (`observeHome`).
 *
 * - The owner's marathon (`OWNER_MARATHON`, the trace): at seed 1 the
 *   long runs of four build weeks are missed while most of the rest is
 *   run, and the check opens the sheet in the last build week.
 * - The reviewer's runner: the same set-up with a 10K benchmark at VDOT 27
 *   (easy about 8:30 /km), whose marathon's 180-minute ceiling holds the
 *   plan's long run to 20 km, under half the race. Going out for every run
 *   they never hear it; before, reach in the taper was the 20 km done,
 *   under 21.1, and the sheet opened in each of its three weeks. Missing
 *   some, they hear it once, in the last build week.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import { raceLongRunCheck } from "@/features/program/raceLongRunCheck";
import { getPhaseForWeek } from "@/features/program/runPlanTiming";
import { simulateLiftSeason, type LiftPersona } from "@/test/sim/liftSeason";
import { OWNER_MARATHON } from "@/test/sim/runPersonas";
import { raceTimeS } from "@/test/sim/runSeason";

const SEED = 1;
/** To the race, through its recovery and on. */
const WEEKS = 33;
/** Each season takes a few seconds here; CI's slowest jobs run several
 *  suites at once. */
const TIMEOUT = 60_000;

/** A week of the season, by its Monday: the plan's phase, the peak it
 *  carried, and whether the check opened the sheet on a day of it. */
interface CheckedWeek {
  phase: string;
  peakKm: number | null;
  opened: boolean;
}

function checkedSeason(persona: LiftPersona): Map<string, CheckedWeek> {
  const weeks = new Map<string, CheckedWeek>();
  simulateLiftSeason(persona, {
    weeks: WEEKS,
    seed: SEED,
    observeHome: ({ date, state, profile, recentRuns }) => {
      const runPlan = state.runPlan;
      const distance = runPlan?.raceGoal?.distance as "marathon" | undefined;
      const phase =
        runPlan?.phase === "recovery"
          ? "recovery"
          : distance &&
              runPlan?.currentWeek !== undefined &&
              runPlan.totalWeeks !== undefined
            ? getPhaseForWeek(runPlan.currentWeek, runPlan.totalWeeks, distance)
            : "none";
      const opened =
        raceLongRunCheck({
          profile,
          programState: state,
          recentRuns,
          today: date,
        }) !== null;
      const key = localWeekKey(parseLocalDate(date));
      weeks.set(key, {
        phase,
        peakKm: runPlan?.peakLongRunKm ?? null,
        opened: (weeks.get(key)?.opened ?? false) || opened,
      });
    },
  });
  return weeks;
}

const openedWeeks = (weeks: Map<string, CheckedWeek>) =>
  [...weeks].filter(([, w]) => w.opened).map(([key, w]) => [key, w.phase]);

/** The owner's set-up, run by the reviewer's runner. */
const slowRunner = (runShare: number): LiftPersona => ({
  ...OWNER_MARATHON,
  name: `owner-marathon-vdot-27-${String(runShare)}`,
  running: {
    ...OWNER_MARATHON.running!,
    runner: { ...OWNER_MARATHON.running!.runner, vdot: 27 },
    runShare,
    benchmark: {
      distanceM: 10000,
      timeS: Math.round(raceTimeS(27, 10000, 0)),
    },
  },
});

describe("the weekly race check through a marathon season", () => {
  it(
    "opens in the owner's last build week, after a month without a long run",
    () => {
      // The trace's week 22, plan week 21 of 25: one build week left, and
      // 4 km builds to 6.
      expect(openedWeeks(checkedSeason(OWNER_MARATHON))).toEqual([
        ["2026-08-03", "build"],
      ]);
    },
    TIMEOUT
  );

  it(
    "never opens for a runner at the long run's ceiling who goes out for every run",
    () => {
      const weeks = checkedSeason(slowRunner(1));
      const build = [...weeks.values()].filter((w) => w.phase === "build");
      expect(build.length).toBeGreaterThan(0);
      // What the plan builds to, all through the build: under half the
      // marathon.
      for (const week of build) expect(week.peakKm).toBe(20);
      expect(openedWeeks(weeks)).toEqual([]);
    },
    TIMEOUT
  );

  it(
    "opens once in the last build week for the same runner missing the last long runs",
    () => {
      expect(openedWeeks(checkedSeason(slowRunner(0.85)))).toEqual([
        ["2026-08-03", "build"],
      ]);
    },
    TIMEOUT
  );
});
