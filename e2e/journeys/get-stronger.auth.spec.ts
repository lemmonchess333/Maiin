/**
 * Get stronger, three days a week, for sixteen weeks.
 *
 * Lift4 (9): an intermediate's lighter week comes every fourth week, half
 * the sets at the same weights. Between them the main lifts climb, a step a
 * session when every set is made. Each Monday's session goes through the
 * workout screen; Wednesday's and Friday's through the app's own engine
 * (`fastForwardLift`).
 */
import { test, expect } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import {
  advanceTo,
  deleteAccount,
  moveDay,
  nextWeekday,
  openJourney,
  pageErrors,
  plusDays,
  programme,
  setUpPlan,
  signUp,
  type JourneyAccount,
} from "../helpers/journey";
import {
  expectTrainShowsSession,
  fastForwardLift,
  finishLiftViaUi,
  savedWorkout,
} from "../helpers/journeyLift";
import { resetNodeClock } from "../helpers/nodeClock";
import { nextUpIndex } from "../../src/features/program/nextUpCursor";
import type { ProgramState } from "../../src/features/program/programTypes";

const WEEKS = Number(process.env.JOURNEY_WEEKS ?? 16);

/** The squat as the week's plan holds it on Monday. */
function squat(state: ProgramState) {
  const found = state.workouts
    .flatMap((day) => day.exercises)
    .find((exercise) => exercise.exerciseId === "squat");
  expect(found, "the plan has no squat").toBeTruthy();
  return found!;
}

test("Get stronger: sixteen weeks of a three-day plan", async ({ page }) => {
  test.skip(!emulatorActive, "needs the local emulators");
  test.setTimeout(30 * 60_000);
  const start = nextWeekday(1);
  let account: JourneyAccount | null = null;
  try {
    await openJourney(page, start);
    account = await signUp(page, "stronger");
    await setUpPlan(page, {
      aim: "Get stronger",
      activity: "Lifting",
      liftDays: "3",
      liftMinutes: "60 min",
      equipment: "Full gym",
      experience: "Some experience",
      weightKg: 80,
      heightCm: 178,
      sex: "Male",
      age: "25–34",
    });

    /** The squat on each Monday, and whether that week was a lighter one. */
    const weeks: { load: number; sets: number; lighter: boolean }[] = [];
    for (let week = 1; week <= WEEKS; week++) {
      const monday = plusDays(start, (week - 1) * 7);
      await test.step(`week ${week}`, async () => {
        const state = await advanceTo(page, account!, monday);
        expect(state.weekNumber, "one week on the plan a calendar week").toBe(
          week
        );
        const lighter = state.currentPhase === "deload";
        expect(lighter, "a lighter week every fourth week").toBe(
          week % 4 === 0
        );
        expect(
          state.workouts.every((day) => !day.completed && !day.skipped),
          "a new week starts with every session to do"
        ).toBe(true);
        const { weight, sets } = squat(state);
        weeks.push({ load: weight, sets, lighter });

        // Monday on the workout screen: Train shows the session the plan
        // holds, and the workout saved is that session, set for set.
        const dayIndex = nextUpIndex(state);
        const planned = state.workouts[dayIndex];
        await expectTrainShowsSession(page, planned);
        await finishLiftViaUi(page, account!);
        const saved = await savedWorkout(account!, monday);
        for (const exercise of planned.exercises) {
          const working = saved.exercises
            .find((done) => done.exerciseId === exercise.exerciseId)
            ?.sets.filter((set) => set.type === "working");
          expect(
            working?.map((set) => [set.weightKg, set.reps]),
            `${exercise.name} as planned`
          ).toEqual(
            Array.from({ length: exercise.sets }, () => [
              exercise.weight,
              exercise.reps,
            ])
          );
        }

        for (const offset of [2, 4]) {
          const day = plusDays(monday, offset);
          await moveDay(page, day);
          await fastForwardLift(account!, day);
        }
        expect(
          (await programme(account!.uid)).workouts.every(
            (day) => day.completed
          ),
          "the week's three sessions done"
        ).toBe(true);
        expect(pageErrors(page), "no error on the page").toEqual([]);
      });
    }

    // Between lighter weeks the squat climbs, and a lighter week keeps the
    // weight with fewer sets.
    for (let week = 2; week <= weeks.length; week++) {
      const now = weeks[week - 1];
      const before = weeks[week - 2];
      if (now.lighter) {
        expect(now.sets, `week ${week} has fewer sets`).toBeLessThan(
          before.sets
        );
        expect(
          now.load,
          `week ${week} keeps the weight`
        ).toBeGreaterThanOrEqual(before.load);
      } else if (!before.lighter) {
        expect(now.load, `week ${week}'s squat climbs`).toBeGreaterThan(
          before.load
        );
      }
    }
    const heaviest = Math.max(...weeks.map((week) => week.load));
    expect(
      heaviest - weeks[0].load,
      "the squat over the block"
    ).toBeGreaterThanOrEqual(WEEKS >= 15 ? 20 : 0);
  } finally {
    resetNodeClock();
    if (account) await deleteAccount(page, account);
  }
});
