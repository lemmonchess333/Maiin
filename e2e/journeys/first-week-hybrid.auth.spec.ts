/** A hybrid athlete saves both kinds of first-week activity after setup. */
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
  setUpPlan,
  signUp,
  type JourneyAccount,
} from "../helpers/journey";
import { finishLiftViaUi } from "../helpers/journeyLift";
import { emulatorAdmin } from "../helpers/realCallables";
import { resetNodeClock } from "../helpers/nodeClock";
import { RUN, TABS } from "../../src/test/journeyScreens";

test("a hybrid reaches Today and completes both first-week tasks", async ({
  page,
}) => {
  test.skip(!emulatorActive, "needs the local emulators");
  test.setTimeout(10 * 60_000);
  const start = nextWeekday(1);
  let account: JourneyAccount | null = null;
  try {
    await openJourney(page, start);
    account = await signUp(page, "first-week-hybrid");
    await setUpPlan(page, {
      aim: "Build muscle",
      activity: "Both",
      liftDays: "3",
      liftMinutes: "45 min",
      runner: "Regular runner",
      weightKg: 75,
      heightCm: 175,
      sex: "Female",
      age: "25–34",
    });
    const db = emulatorAdmin().db;
    const profile = (await db.doc(`users/${account.uid}`).get()).data();
    expect(profile?.activationJourneyVersion).toBe(2);

    const firstWeek = page.getByRole("region", { name: "Your first week" });
    await expect(firstWeek).toBeVisible({ timeout: 20_000 });
    await expect(
      firstWeek.getByText("Finish your first workout")
    ).toBeVisible();
    await expect(firstWeek.getByText("Go for your first run")).toBeVisible();
    await expect(firstWeek.getByText("Log your first meal")).toHaveCount(0);
    await expect(firstWeek.getByText("Weigh in on three mornings")).toHaveCount(
      0
    );

    // The first Home action is the lift. The first-week card stays until the
    // run is saved too.
    await finishLiftViaUi(page, account, { startFromHome: true });
    await openTab(page, TABS.home);
    await expect(firstWeek).toBeVisible();
    await expect(
      firstWeek.getByRole("button", { name: /Go for your first run/ })
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (await db.collection(`users/${account!.uid}/workouts`).get()).size
      )
      .toBe(1);

    // A lift-only Monday has no separate free-run card. On Tuesday's rest
    // day a freeform runner can still start a run from Home.
    await moveDay(page, plusDays(start, 1));
    await page
      .getByRole("button", { name: RUN.homeStart, exact: true })
      .click();
    await page
      .getByRole("button", { name: RUN.gpsTreadmill, exact: true })
      .click();
    const distance = page.getByRole("textbox", { name: RUN.distance });
    await expect(distance).toBeVisible();
    await passTime(page, 30);
    await expect(page.getByRole("timer", { name: RUN.elapsedTime })).toHaveText(
      /^30:\d\d$/
    );
    await distance.fill("5");
    await page
      .getByRole("button", { name: RUN.saveTreadmill, exact: true })
      .click();
    await expect(page.getByRole("button", { name: RUN.save })).toBeVisible();
    await page.getByRole("button", { name: RUN.save }).click();
    await expect
      .poll(
        async () =>
          (await db.collection(`users/${account!.uid}/runs`).get()).size
      )
      .toBe(1);
    await page.getByRole("button", { name: RUN.done, exact: true }).click();
    await openTab(page, TABS.home);
    await expect(
      page.getByRole("heading", { name: "Your first week" }),
      "both saved activities complete the hybrid card"
    ).toHaveCount(0);
    expect(pageErrors(page), "no error on the page").toEqual([]);
  } finally {
    resetNodeClock();
    if (account) await deleteAccount(page, account);
  }
});
