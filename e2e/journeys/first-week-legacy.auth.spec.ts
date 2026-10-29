/** An older client that sends no cohort marker retains the established path. */
import { test, expect } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import {
  deleteAccount,
  nextWeekday,
  openJourney,
  setUpPlan,
  signUp,
  type JourneyAccount,
} from "../helpers/journey";
import { emulatorAdmin } from "../helpers/realCallables";
import { resetNodeClock } from "../helpers/nodeClock";

test("an old client still sees the offer and original first-week tasks", async ({
  page,
}) => {
  test.skip(!emulatorActive, "needs the local emulators");
  test.setTimeout(5 * 60_000);
  let account: JourneyAccount | null = null;
  try {
    await openJourney(page, nextWeekday(1));
    // `openJourney` registered the real callable route. This route runs
    // first and removes the one field an older app would not send, then
    // forwards the request to that same handler.
    await page.route(
      "**/demo-tropos/us-central1/completeOnboarding",
      async (route) => {
        if (route.request().method() === "OPTIONS") {
          await route.fallback();
          return;
        }
        const body = route.request().postDataJSON() as {
          data: Record<string, unknown>;
        };
        delete body.data.activationJourneyVersion;
        await route.fallback({ postData: JSON.stringify(body) });
      }
    );
    account = await signUp(page, "first-week-legacy");
    await setUpPlan(
      page,
      {
        aim: "Build muscle",
        activity: "Lifting",
        liftDays: "3",
        liftMinutes: "45 min",
        equipment: "Full gym",
        experience: "Some experience",
        weightKg: 75,
        heightCm: 175,
        sex: "Female",
        age: "25–34",
      },
      { legacyClient: true }
    );
    const profile = (
      await emulatorAdmin().db.doc(`users/${account.uid}`).get()
    ).data();
    expect(profile?.activationJourneyVersion).toBeUndefined();
    await expect(
      page.getByRole("heading", { name: "Your first week" })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Log your first meal")).toBeVisible();
    await expect(page.getByText("Weigh in on three mornings")).toBeVisible();
  } finally {
    resetNodeClock();
    if (account) await deleteAccount(page, account);
  }
});
