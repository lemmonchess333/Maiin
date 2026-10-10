/**
 * A planned run, done on a treadmill.
 *
 * `/run?scheduledRunId=` is the one way into a run that keeps its link to
 * the plan; the run summary's router state, the other way a spec logs a
 * run, saves none (test-infrastructure-audit §4(b)). Here a race plan's
 * first run is started from Home's card, done on the treadmill, and saved.
 * The saved run carries the planned run's id. Because a treadmill run is
 * another type than the plan's, the summary asks what the planned run
 * should do; once the person says they did it, Home's week shows it done.
 */
import { test, expect } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import {
  deleteAccount,
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
import { emulatorAdmin } from "../helpers/realCallables";
import { resetNodeClock } from "../helpers/nodeClock";
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
      aim: "Improve running",
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
    const planned = (await programme(account.uid)).runDays?.find(
      (run) => run.date === start
    );
    expect(planned, "the plan has a run today").toBeTruthy();

    // Today's run, started from Home's card: the Run page opens on it.
    await page
      .getByRole("button", { name: RUN.homeStart, exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`scheduledRunId=${encodeURIComponent(planned!.id!)}`)
    );

    // On the treadmill: the type changes, the link stays.
    await page
      .getByRole("button", { name: RUN.customise, exact: true })
      .click();
    await page.getByRole("button", { name: RUN.runType }).click();
    await page.getByRole("button", { name: RUN.treadmill }).click();
    await page
      .getByRole("button", { name: RUN.startTreadmill, exact: true })
      .click();
    // The run's clock starts with the treadmill screen; 36 minutes on.
    const distance = page.getByRole("spinbutton", { name: RUN.distance });
    await expect(distance).toBeVisible();
    await passTime(page, 36);
    // The screen's clock reads the time on its next tick.
    await expect(page.getByText(/^36:\d\d$/)).toBeVisible();
    await distance.fill("6");
    await page
      .getByRole("button", { name: RUN.saveTreadmill, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: RUN.summary, level: 1 })
    ).toBeVisible();
    await page.getByRole("button", { name: RUN.save, exact: true }).click();

    // Saved with the planned run's id: 6 km in 36 minutes.
    const runs = emulatorAdmin().db.collection(`users/${account.uid}/runs`);
    await expect
      .poll(async () => (await runs.get()).size, {
        message: "the run was never saved",
      })
      .toBe(1);
    const saved = (await runs.get()).docs[0].data();
    expect(saved.scheduledRunId, "the planned run's link").toBe(planned!.id);
    expect(saved.activityType).toBe("treadmill");
    expect(saved.distance).toBe(6000);
    expect(Math.round(saved.duration / 60)).toBe(36);

    // Another type than the plan's, so the summary asks; the person did it.
    await page
      .getByRole("button", { name: RUN.markPlannedDone, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await programme(account!.uid)).manualCompletions?.[planned!.id!],
        { message: "the planned run was never marked done" }
      )
      .toBeTruthy();
    await page.getByRole("button", { name: RUN.done, exact: true }).click();

    // Home's week: today's run, done.
    await openTab(page, TABS.home);
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^${stripDay(start)}, ${STRIP.runDone}`),
      })
    ).toBeVisible();
    expect(pageErrors(page), "no error on the page").toEqual([]);
  } finally {
    resetNodeClock();
    if (account) await deleteAccount(page, account);
  }
});
