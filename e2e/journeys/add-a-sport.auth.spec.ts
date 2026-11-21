/**
 * A sport added after setup, and taken off again (TrainWk1 step 6; the
 * Train grill's Q27, Q28, Q31 to Q33). A runner adds lifting from Lift
 * plan on a Wednesday and lifts that week and the next day; a lifter adds
 * running from Run plan as someone new to it and has the 30-minute goal's
 * runs on their days. Each then takes the sport off again, and every
 * session they saved stays.
 *
 * The saves are answered by the real `configurePlan` (`realCallables.ts`).
 * What the week shows is read where a person sees it: Train's Start workout
 * for the next lift, Home's Start run on a run day.
 */
import { test, expect, type Page } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import {
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
import { finishLiftViaUi } from "../helpers/journeyLift";
import { fastForwardRun } from "../helpers/journeyRun";
import { emulatorAdmin } from "../helpers/realCallables";
import { resetNodeClock } from "../helpers/nodeClock";
import {
  HOME,
  RUN,
  SETUP,
  SETUP_OPTIONS,
  SPORT_CHANGE,
  STARTER,
  TABS,
} from "../../src/test/journeyScreens";
import type { ProgramState } from "../../src/features/program/programTypes";

const runDaysOf = (plan: ProgramState) =>
  [...(plan.runDays ?? [])]
    .filter((d) => d.status === "planned")
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

/** Days of the usual week a sport is on, Sunday first. */
function daysOf(
  schedule: readonly { day: number; type: string }[] | undefined,
  sport: "lift" | "run"
): number[] {
  return (schedule ?? [])
    .filter((d) => d.type === sport || d.type === "both")
    .map((d) => d.day);
}

async function profileOf(account: JourneyAccount) {
  return (
    (await emulatorAdmin().db.doc(`users/${account.uid}`).get()).data() ?? {}
  );
}

async function savedCount(account: JourneyAccount, kind: "workouts" | "runs") {
  return (
    await emulatorAdmin().db.collection(`users/${account.uid}/${kind}`).get()
  ).size;
}

/** A settings page by its address, as a link to it opens it. */
async function openSettings(page: Page, path: string) {
  await page.goto(path.replace(/^\//, ""));
}

test("a runner adds lifting mid-week, lifts that week, and can stop again", async ({
  page,
}) => {
  test.skip(!emulatorActive, "needs the local emulators");
  test.setTimeout(10 * 60_000);
  assertUtc();
  // A Wednesday: the lifts go into the days left of this week.
  const start = nextWeekday(3);
  let account: JourneyAccount | null = null;
  try {
    await openJourney(page, start);
    account = await signUp(page, "add-lifting");
    await setUpPlan(page, {
      aim: "Support my running",
      activity: "Running",
      runner: "New to running",
      weightKg: 70,
      heightCm: 172,
      sex: "Female",
      birthYear: 1992,
    });
    const before = await profileOf(account);
    const runDays = daysOf(before.weekSchedule, "run");
    expect(daysOf(before.weekSchedule, "lift")).toEqual([]);
    const plannedRuns = runDaysOf(await programme(account.uid)).map(
      (d) => d.date
    );

    // Lift plan opens on setup's first lifting question.
    await openSettings(page, SPORT_CHANGE.liftPlan);
    await expect(
      page.getByRole("heading", { name: SPORT_CHANGE.addLiftingQuestion })
    ).toBeVisible({ timeout: 20_000 });
    await page
      .getByRole("radiogroup", { name: SETUP.liftDays })
      .getByRole("radio", { name: "3", exact: true })
      .click();
    await page.getByRole("button", { name: SETUP.continue }).click();
    await page
      .getByRole("button", {
        name: new RegExp(`^${SETUP_OPTIONS.equipment[0]}`),
      })
      .click();
    await page
      .getByRole("button", {
        name: new RegExp(`^${SETUP_OPTIONS.experience[1]}`),
      })
      .click();
    await page.getByRole("button", { name: SETUP.continue }).click();
    await page
      .getByRole("button", { name: SETUP.noInjuries, exact: true })
      .click();
    await page
      .getByRole("button", { name: SPORT_CHANGE.addLifting, exact: true })
      .click();

    // The plan has the lifts; the runs kept their days; the setup answer
    // stays setup's (TrainWk1, 18 November call 5).
    await expect
      .poll(async () => (await profileOf(account!)).weeklyWorkoutsTarget, {
        timeout: 20_000,
      })
      .toBe(3);
    const after = await profileOf(account);
    expect(daysOf(after.weekSchedule, "run")).toEqual(runDays);
    expect(daysOf(after.weekSchedule, "lift")).toHaveLength(3);
    expect(after.athleteType).toBe(before.athleteType);
    let plan = await programme(account.uid);
    expect(plan.workouts).toHaveLength(3);
    expect(runDaysOf(plan).map((d) => d.date)).toEqual(plannedRuns);
    // The page is now the lift plan editor, with Stop lifting at its foot.
    await expect(
      page.getByRole("button", { name: SPORT_CHANGE.stopLifting })
    ).toBeVisible({ timeout: 20_000 });

    // The week's lifts are there to do from today, the next day too.
    await finishLiftViaUi(page, account);
    await moveDay(page, plusDays(start, 1));
    await finishLiftViaUi(page, account);
    expect(await savedCount(account, "workouts")).toBe(2);
    plan = await programme(account.uid);
    expect(plan.workouts.filter((w) => w.completed)).toHaveLength(2);

    // Lifting off again: one confirmation, and the saved workouts stay.
    await openSettings(page, SPORT_CHANGE.liftPlan);
    await page.getByRole("button", { name: SPORT_CHANGE.stopLifting }).click();
    const dialog = page.getByRole("alertdialog", {
      name: SPORT_CHANGE.stopLiftingAsked,
    });
    await dialog
      .getByRole("button", { name: SPORT_CHANGE.stopLifting })
      .click();
    await expect
      .poll(async () => (await programme(account!.uid)).workouts.length, {
        timeout: 20_000,
      })
      .toBe(0);
    expect(await savedCount(account, "workouts")).toBe(2);
    expect(daysOf((await profileOf(account)).weekSchedule, "run")).toEqual(
      runDays
    );
    // And Lift plan asks again.
    await expect(
      page.getByRole("heading", { name: SPORT_CHANGE.addLiftingQuestion })
    ).toBeVisible({ timeout: 20_000 });
    expect(pageErrors(page), "no error on the page").toEqual([]);
  } finally {
    resetNodeClock();
    if (account) await deleteAccount(page, account);
  }
});

test("a lifter adds running as someone new to it, runs on its days, and can stop again", async ({
  page,
}) => {
  test.skip(!emulatorActive, "needs the local emulators");
  test.setTimeout(10 * 60_000);
  assertUtc();
  const start = nextWeekday(1);
  let account: JourneyAccount | null = null;
  try {
    await openJourney(page, start);
    account = await signUp(page, "add-running");
    await setUpPlan(page, {
      aim: "Build muscle",
      activity: "Lifting",
      liftDays: "3",
      liftMinutes: "45 min",
      weightKg: 80,
      heightCm: 180,
      sex: "Male",
      birthYear: 1990,
    });
    const before = await profileOf(account);
    const liftDays = daysOf(before.weekSchedule, "lift");
    expect(before.runFrequency).toBe("none");

    // Run plan asks setup's running question, then offers the 30 minutes.
    await openSettings(page, SPORT_CHANGE.runPlan);
    await expect(
      page.getByRole("heading", { name: SPORT_CHANGE.addRunningQuestion })
    ).toBeVisible({ timeout: 20_000 });
    await page
      .getByRole("button", {
        name: new RegExp(`^${SETUP_OPTIONS.runners[0]}`),
      })
      .click();
    await expect(page.getByRole("radio", { name: STARTER.goal })).toBeChecked();
    await page
      .getByRole("button", { name: SPORT_CHANGE.addRunning, exact: true })
      .click();

    await expect
      .poll(async () => (await profileOf(account!)).runMode, {
        timeout: 20_000,
      })
      .toBe("starter");
    const after = await profileOf(account);
    expect(after).toMatchObject({
      runFrequency: "new",
      starterGoal: { startedOn: start },
      athleteType: before.athleteType,
    });
    expect(daysOf(after.weekSchedule, "lift")).toEqual(liftDays);
    let plan = await programme(account.uid);
    const runs = runDaysOf(plan);
    expect(runs.length).toBeGreaterThan(0);
    expect(plan.workouts).toHaveLength(3);

    // On each of the next two run days, Home starts the run.
    for (const run of runs.slice(0, 2)) {
      await moveDay(page, run.date!);
      await openTab(page, TABS.home);
      await expect(
        page.getByRole("heading", { name: HOME.heading, level: 1 })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: RUN.homeStart, exact: true }).first()
      ).toBeVisible({ timeout: 20_000 });
      plan = await programme(account.uid);
      await fastForwardRun(account, run, plan, "starter");
    }
    const saved = await savedCount(account, "runs");
    expect(saved).toBeGreaterThanOrEqual(1);

    // Running off again: one confirmation, the saved runs stay, the lifts
    // keep their days.
    await openSettings(page, SPORT_CHANGE.runPlan);
    await page.getByRole("button", { name: SPORT_CHANGE.stopRunning }).click();
    await page
      .getByRole("alertdialog", { name: SPORT_CHANGE.stopRunningAsked })
      .getByRole("button", { name: SPORT_CHANGE.stopRunning })
      .click();
    await expect
      .poll(async () => (await profileOf(account!)).runFrequency, {
        timeout: 20_000,
      })
      .toBe("none");
    const stopped = await profileOf(account);
    expect(stopped.starterGoal ?? null).toBeNull();
    expect(daysOf(stopped.weekSchedule, "lift")).toEqual(liftDays);
    expect(daysOf(stopped.weekSchedule, "run")).toEqual([]);
    expect(runDaysOf(await programme(account.uid))).toEqual([]);
    expect(await savedCount(account, "runs")).toBe(saved);
    expect(pageErrors(page), "no error on the page").toEqual([]);
  } finally {
    resetNodeClock();
    if (account) await deleteAccount(page, account);
  }
});
