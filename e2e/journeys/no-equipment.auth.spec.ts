/**
 * No equipment: setup builds a week with nothing in it that needs kit.
 *
 * The person picks "No equipment" at setup, and the real
 * `completeOnboarding` stores the plan. Every exercise in it is one the
 * floor allows (`noEquipment.ts`), its back work is the superman hold,
 * it has no pull, and Train shows the first session as stored.
 */
import { test, expect } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import {
  deleteAccount,
  nextWeekday,
  openJourney,
  pageErrors,
  programme,
  setUpPlan,
  signUp,
  type JourneyAccount,
} from "../helpers/journey";
import { expectTrainShowsSession } from "../helpers/journeyLift";
import { resetNodeClock } from "../helpers/nodeClock";
import { emulatorAdmin } from "../helpers/realCallables";
import { nextUpIndex } from "../../src/features/program/nextUpCursor";
import { NO_EQUIPMENT_EXERCISE_IDS } from "../../src/features/program/noEquipment";

test("No equipment: a week of floor work, with no pull", async ({ page }) => {
  test.skip(!emulatorActive, "needs the local emulators");
  test.setTimeout(5 * 60_000);
  let account: JourneyAccount | null = null;
  try {
    await openJourney(page, nextWeekday(1));
    account = await signUp(page, "no-equipment");
    await setUpPlan(page, {
      aim: "Build muscle",
      activity: "Lifting",
      liftDays: "4",
      liftMinutes: "45 min",
      equipment: "No equipment",
      experience: "Some experience",
      weightKg: 78,
      heightCm: 178,
      sex: "Male",
      age: "25–34",
    });

    const profile = (
      await emulatorAdmin().db.doc(`users/${account.uid}`).get()
    ).data();
    expect(profile?.equipment).toBe("no_equipment");
    // No equipment takes no barbell, whatever the toggle held.
    expect(profile?.barbellAtHome ?? false).toBe(false);

    const state = await programme(account.uid);
    const ids = state.workouts.flatMap((day) =>
      day.exercises.map((exercise) => exercise.exerciseId)
    );
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !NO_EQUIPMENT_EXERCISE_IDS.has(id))).toEqual([]);
    expect(ids).toContain("superman-hold");
    expect(state.workouts.some((day) => /^Pull/.test(day.dayName))).toBe(false);

    await expectTrainShowsSession(page, state.workouts[nextUpIndex(state)]);
    expect(pageErrors(page)).toEqual([]);
  } finally {
    resetNodeClock();
    if (account) await deleteAccount(page, account);
  }
});
