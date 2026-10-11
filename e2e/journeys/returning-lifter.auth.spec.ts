/**
 * A light trainer away for three weeks, and back (Lift4 (11)).
 *
 * Two lift days a week is a whole plan, not a cut-down one: each week on
 * the plan matches the calendar's, and the main lifts climb. Three weeks
 * away hold the plan where it was, since a week with no training holds the
 * week number. Home then greets the return with Welcome back, Ease back in
 * put first: each lift 10% lighter on its own steps (one step at least, so
 * a small load comes down more), a set off this week's sessions, and each
 * lift climbing back a step a session to where it was.
 */
import { test, expect } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import {
  advanceTo,
  deleteAccount,
  moveDay,
  nextWeekday,
  openJourney,
  openTab,
  pageErrors,
  plusDays,
  programme,
  setUpPlan,
  signUp,
  type JourneyAccount,
} from "../helpers/journey";
import { fastForwardLift, finishLiftViaUi } from "../helpers/journeyLift";
import { resetNodeClock } from "../helpers/nodeClock";
import type { ProgramState } from "../../src/features/program/programTypes";
import { TABS, WELCOME_BACK } from "../../src/test/journeyScreens";

/** Each loaded lift in the week's sessions, by day and slot. */
function loads(
  state: ProgramState
): Map<string, { weight: number; sets: number }> {
  const out = new Map<string, { weight: number; sets: number }>();
  state.workouts.forEach((day, d) =>
    day.exercises.forEach((exercise, e) => {
      if (exercise.weight > 0)
        out.set(`${d}:${e}:${exercise.exerciseId}`, {
          weight: exercise.weight,
          sets: exercise.sets,
        });
    })
  );
  return out;
}

test("a light trainer, three weeks away, eases back in", async ({ page }) => {
  test.skip(!emulatorActive, "needs the local emulators");
  test.setTimeout(15 * 60_000);
  const start = nextWeekday(1);
  let account: JourneyAccount | null = null;
  try {
    await openJourney(page, start);
    account = await signUp(page, "returning");
    await setUpPlan(page, {
      aim: "Build muscle",
      activity: "Lifting",
      liftDays: "2",
      liftMinutes: "45 min",
      equipment: "Full gym",
      experience: "New to lifting",
      weightKg: 64,
      heightCm: 168,
      sex: "Female",
      age: "35–44",
    });

    // Three weeks, two sessions each: Monday on the workout screen,
    // Thursday through the engine.
    const firstWeek = loads(await programme(account.uid));
    for (let week = 1; week <= 3; week++) {
      const monday = plusDays(start, (week - 1) * 7);
      await test.step(`week ${week}`, async () => {
        const state = await advanceTo(page, account!, monday);
        expect(state.weekNumber, "one week on the plan a calendar week").toBe(
          week
        );
        await finishLiftViaUi(page, account!);
        const thursday = plusDays(monday, 3);
        await moveDay(page, thursday);
        await fastForwardLift(account!, thursday);
      });
    }
    const left = await programme(account.uid);
    const leftLoads = loads(left);
    const climbed = [...leftLoads].filter(
      ([slot, now]) => now.weight > (firstWeek.get(slot)?.weight ?? Infinity)
    );
    expect(
      climbed.length,
      "the main lifts climbed on two days a week"
    ).toBeGreaterThan(0);

    // Three weeks away; back on a Monday, 25 days after the last session.
    const back = plusDays(start, 6 * 7);
    await test.step("back after three weeks", async () => {
      const state = await advanceTo(page, account!, back);
      expect(
        state.weekNumber,
        "weeks with no training hold the week number"
      ).toBe(left.weekNumber + 1);
      expect(loads(state), "the plan is where it was left").toEqual(leftLoads);

      await openTab(page, TABS.home);
      const sheet = page.getByRole("dialog", { name: WELCOME_BACK.sheet });
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText("It's been about 4 weeks");
      const choices = sheet.getByRole("button", {
        name: new RegExp(
          `${WELCOME_BACK.easeBack.source}|${WELCOME_BACK.keep.source}`
        ),
      });
      await expect(
        choices.first(),
        "Ease back in comes first"
      ).toHaveAccessibleName(WELCOME_BACK.easeBack);
      await sheet.getByRole("button", { name: WELCOME_BACK.easeBack }).click();
      await expect(sheet).toBeHidden();

      // Each loaded lift comes down 10% on its own steps, by at least one
      // step, keeps the weight it came from to climb back to, and has a set
      // fewer this week.
      await expect
        .poll(
          async () =>
            (await programme(account!.uid)).workouts.every((day, d) =>
              day.exercises.every((exercise, e) => {
                const was = leftLoads.get(`${d}:${e}:${exercise.exerciseId}`);
                return (
                  !was ||
                  (exercise.weight < was.weight &&
                    exercise.lowered?.from === was.weight &&
                    exercise.sets === Math.max(1, was.sets - 1))
                );
              })
            ),
          { message: "each lift eased back" }
        )
        .toBe(true);
      expect(pageErrors(page), "no error on the page").toEqual([]);
    });
  } finally {
    resetNodeClock();
    if (account) await deleteAccount(page, account);
  }
});
