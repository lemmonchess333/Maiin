/**
 * A planned run, done on a treadmill.
 *
 * `/run?scheduledRunId=` is the one way into a run that keeps its link to
 * the plan; the run summary's router state, the other way a spec logs a
 * run, saves none (test-infrastructure-audit §4(b)). Here a race plan's
 * first run is started from Home's card, done on the treadmill, and saved.
 * The treadmill is where a run is done, not a run type (Pgm8): the saved
 * run carries the planned run's id and its type, with the treadmill as its
 * place. So the summary names the planned session complete and asks
 * nothing about it, and Home's week shows the run done, with no "Mark
 * scheduled run complete" tap.
 */
import { test, expect } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import {
  deleteAccount,
  moveDay,
  nextWeekday,
  openJourney,
  openTab,
  pageErrors,
  passTime,
  plusDays,
  programme,
  setUpPlan,
  signUp,
  type JourneyAccount,
} from "../helpers/journey";
import { plannedSize } from "../helpers/journeyRun";
import { emulatorAdmin } from "../helpers/realCallables";
import { resetNodeClock } from "../helpers/nodeClock";
import { ACTIVITY_TYPES } from "../../src/components/run/runConfigDefaults";
import { RUN_TEMPLATES } from "../../src/lib/workoutTemplates";
import { RUN, STRIP, TABS } from "../../src/test/journeyScreens";

/** The `YYYY-MM-DD` day as the week strip names it: "Monday 12 October". */
function stripDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** The treadmill screen's clock `minutes` in, to the minute: "36:07",
 *  "1:12:07" (`formatClock`). */
function clockAt(minutes: number): RegExp {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0
    ? new RegExp(`^${hours}:${String(rest).padStart(2, "0")}:\\d\\d$`)
    : new RegExp(`^${rest}:\\d\\d$`);
}

test("a planned run, done on a treadmill, is the planned run", async ({
  page,
}) => {
  test.skip(!emulatorActive, "needs the local emulators");
  test.setTimeout(10 * 60_000);
  const start = nextWeekday(1);
  let account: JourneyAccount | null = null;
  try {
    await openJourney(page, start);
    account = await signUp(page, "treadmill");
    await setUpPlan(page, {
      aim: "Support my running",
      activity: "Running",
      runner: "Regular runner",
      race: {
        distance: "10K",
        date: plusDays(start, 12 * 7 + 5),
        runsPerWeek: 3,
      },
      weightKg: 70,
      heightCm: 175,
      sex: "Female",
      age: "25–34",
    });
    // The plan's first run. Setup's default week (Run20 (2)) need not hold
    // one on the day the plan is made, so the journey moves to its day.
    const planned = (await programme(account.uid)).runDays
      ?.filter((run) => run.date !== undefined && run.date >= start)
      .sort((a, b) => a.date!.localeCompare(b.date!))[0];
    expect(planned, "the plan has a run this week").toBeTruthy();
    await moveDay(page, planned!.date!);
    const session = RUN_TEMPLATES.find(
      (template) =>
        template.id === (planned!.userOverride ?? planned!.templateId)
    );
    expect(session, "today's run is a session the app knows").toBeTruthy();
    const typeName = ACTIVITY_TYPES.find(
      (type) => type.type === session!.type
    )?.name;
    expect(typeName, "today's run has a type the setup names").toBeTruthy();
    // The run as planned: its distance where the plan sets one, else its
    // time, at the journey runner's six minutes a kilometre.
    const size = plannedSize(planned!);
    const minutes = Math.round(size.minutes);

    // Today's run, started from Home's card: the Run page opens on it.
    await page
      .getByRole("button", { name: RUN.homeStart, exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`scheduledRunId=${encodeURIComponent(planned!.id!)}`)
    );

    // On the treadmill: the place changes, the type and the link stay.
    await page
      .getByRole("button", { name: RUN.customise, exact: true })
      .click();
    await page.getByRole("switch", { name: RUN.treadmill }).click();
    await expect(
      page.getByRole("switch", { name: RUN.treadmill })
    ).toBeChecked();
    await expect(
      page.getByRole("button", { name: RUN.runType(typeName!), exact: true })
    ).toBeVisible();
    await page
      .getByRole("button", { name: RUN.startTreadmill, exact: true })
      .click();
    // The run's clock starts with the treadmill screen; the run's time on.
    const distance = page.getByRole("spinbutton", { name: RUN.distance });
    await expect(distance).toBeVisible();
    await passTime(page, minutes);
    // The screen's clock reads the time on its next tick.
    await expect(page.getByText(clockAt(minutes))).toBeVisible();
    await distance.fill(String(size.km));
    await page
      .getByRole("button", { name: RUN.saveTreadmill, exact: true })
      .click();
    // The planned session, complete: nothing on the summary is off plan.
    await expect(
      page.getByRole("heading", { name: RUN.summary(session!.name), level: 1 })
    ).toBeVisible();
    await page.getByRole("button", { name: RUN.save, exact: true }).click();

    // Saved with the planned run's id and type, on the treadmill.
    const runs = emulatorAdmin().db.collection(`users/${account.uid}/runs`);
    await expect
      .poll(async () => (await runs.get()).size, {
        message: "the run was never saved",
      })
      .toBe(1);
    const saved = (await runs.get()).docs[0].data();
    expect(saved.scheduledRunId, "the planned run's link").toBe(planned!.id);
    expect(saved.activityType, "the planned run's type").toBe(session!.type);
    expect(saved.place, "where it was run").toBe("treadmill");
    expect(saved.offPlan, "the planned run, not an extra").toBe(false);
    expect(saved.distance).toBeCloseTo(size.km * 1000, 6);
    expect(Math.round(saved.duration / 60)).toBe(minutes);

    // Saved, which is when the summary would ask about the planned run: it
    // asks nothing.
    await expect(
      page.getByRole("button", { name: RUN.done, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: RUN.markPlannedDone, exact: true })
    ).toHaveCount(0);
    await page.getByRole("button", { name: RUN.done, exact: true }).click();

    // Home's week: today's run, done by the run itself, not by a tap.
    // Home reads the week from its listeners, which the emulators can take
    // seconds to fill once earlier journeys have loaded them.
    await openTab(page, TABS.home);
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^${stripDay(planned!.date!)}, ${STRIP.runDone}`),
      })
    ).toBeVisible({ timeout: 20_000 });
    expect(
      (await programme(account.uid)).manualCompletions?.[planned!.id!],
      "no mark by hand"
    ).toBeFalsy();
    expect(pageErrors(page), "no error on the page").toEqual([]);
  } finally {
    resetNodeClock();
    if (account) await deleteAccount(page, account);
  }
});
