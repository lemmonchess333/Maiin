/**
 * Run9's starter goal, one new runner through it: setup starts someone new
 * to running on 30 minutes without stopping, a week with one run repeats,
 * a week with two moves the stage on, and the last stage's done week says
 * Done on Home, with a 5K offered once, then finishes the goal on the
 * Monday after and leaves the runner free running.
 *
 * The runs are saved as the Run page saves them (`fastForwardRun`); the
 * planned run on the screen is `planned-run-treadmill`'s. To reach the
 * last stage without nine weeks of runs, the plan is put on it as the
 * rollover would have.
 */
import { test, expect } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import {
  advanceTo,
  assertUtc,
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
import { fastForwardRun } from "../helpers/journeyRun";
import { emulatorAdmin } from "../helpers/realCallables";
import { resetNodeClock } from "../helpers/nodeClock";
import { HOME, STARTER, TABS } from "../../src/test/journeyScreens";
import type { ProgramState } from "../../src/features/program/programTypes";

/** The plan's run days in date order. */
const runDaysOf = (plan: ProgramState) =>
  [...(plan.runDays ?? [])].sort((a, b) =>
    (a.date ?? "").localeCompare(b.date ?? "")
  );

test("a new runner repeats a week, moves on, and finishes the 30-minute goal", async ({
  page,
}) => {
  test.skip(!emulatorActive, "needs the local emulators");
  test.setTimeout(10 * 60_000);
  assertUtc();
  const start = nextWeekday(1);
  const week = (n: number) => plusDays(start, 7 * n);
  let account: JourneyAccount | null = null;
  try {
    await openJourney(page, start);
    account = await signUp(page, "new-runner-starter");
    await setUpPlan(page, {
      aim: "Support my running",
      activity: "Running",
      runner: "New to running",
      weightKg: 64,
      heightCm: 168,
      sex: "Female",
      age: "25–34",
    });
    const { db } = emulatorAdmin();
    const profileOf = async () =>
      (await db.doc(`users/${account!.uid}`).get()).data() ?? {};

    // Setup began the goal today, at the first stage, three runs a week.
    expect(await profileOf()).toMatchObject({
      runMode: "starter",
      starterGoal: { startedOn: start },
    });
    let plan = await programme(account.uid);
    expect(plan.runPlan).toMatchObject({
      mode: "starter",
      stage: 1,
      stageWeekKey: start,
    });
    expect(runDaysOf(plan)).toHaveLength(3);
    expect(runDaysOf(plan).every((d) => d.templateId === "run_walk_1")).toBe(
      true
    );

    // Week one: one run of three. The week repeats.
    await fastForwardRun(account, runDaysOf(plan)[0], plan, "starter");
    plan = await advanceTo(page, account, week(1));
    expect(plan.runPlan).toMatchObject({ stage: 1, stageWeekKey: week(1) });
    await openTab(page, TABS.train);
    await expect(
      page.getByText(`${STARTER.goal} · Week 1 of 9`),
      "Train's header names the goal and its week"
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("This week again: 2 runs move you on.")).toBeVisible();

    // Week two: two runs. The stage moves on.
    for (const run of runDaysOf(plan).slice(0, 2))
      await fastForwardRun(account, run, plan, "starter");
    plan = await advanceTo(page, account, week(2));
    expect(plan.runPlan).toMatchObject({ stage: 2, stageWeekKey: week(2) });
    expect(runDaysOf(plan)[0].templateId).toBe("run_walk_2");

    // The last stage, as the rollover would have put it after six more
    // done weeks.
    const lastWeekDays = runDaysOf(plan).map((d) => ({
      ...d,
      templateId: "run_nonstop_30",
    }));
    await db.doc(`users/${account.uid}/programState/current`).update({
      runPlan: { mode: "starter", stage: 9, stageWeekKey: week(2) },
      runDays: lastWeekDays,
    });
    plan = await programme(account.uid);
    const [first, second] = runDaysOf(plan);
    await fastForwardRun(account, first, plan, "starter");
    await fastForwardRun(account, second, plan, "starter");

    // The day after the second run, Home says Done and offers a 5K.
    await moveDay(page, plusDays(second.date!, 1));
    await openTab(page, TABS.home);
    await expect(
      page.getByRole("heading", { name: HOME.heading, level: 1 })
    ).toBeVisible();
    await expect(page.getByText(STARTER.done, { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: STARTER.offer })
    ).toBeVisible();

    // The Monday after, the goal is finished on that day and the runner is
    // free running, the plan with it.
    await advanceTo(page, account, week(3));
    await expect
      .poll(async () => (await profileOf()).runMode, {
        message: "the goal finished, back to free running",
        timeout: 20_000,
      })
      .toBe("freeform");
    expect((await profileOf()).starterGoal).toEqual({
      startedOn: start,
      finishedOn: second.date,
    });
    expect((await programme(account.uid)).runPlan).toBeUndefined();

    // Done stays until it is answered, once, for both screens.
    await openTab(page, TABS.home);
    await page.getByRole("button", { name: STARTER.notNow }).click();
    await expect(page.getByText(STARTER.done, { exact: true })).toHaveCount(0);
    await openTab(page, TABS.train);
    await expect(page.getByText(STARTER.done, { exact: true })).toHaveCount(0);
    expect(pageErrors(page), "no error on the page").toEqual([]);
  } finally {
    resetNodeClock();
    if (account) await deleteAccount(page, account);
  }
});
