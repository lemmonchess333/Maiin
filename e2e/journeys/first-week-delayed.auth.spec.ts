/** A delayed setup gets its full first week from plan completion. */
import { test, expect } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import {
  deleteAccount,
  openJourney,
  setUpPlan,
  signUp,
  type JourneyAccount,
} from "../helpers/journey";
import { emulatorAdmin } from "../helpers/realCallables";
import { resetNodeClock } from "../helpers/nodeClock";

test("setup days after sign-up still opens on first-week day one", async ({
  page,
}) => {
  test.skip(!emulatorActive, "needs the local emulators");
  test.setTimeout(5 * 60_000);
  let account: JourneyAccount | null = null;
  try {
    // Keep the browser's day aligned with Firestore's server clock. The
    // account date is moved back after sign-up, before onboarding commits.
    const today = new Date().toISOString().slice(0, 10);
    await openJourney(page, today);
    account = await signUp(page, "first-week-delayed");
    const { db, Timestamp } = emulatorAdmin();
    const profileRef = db.doc(`users/${account.uid}`);
    await profileRef.update({
      createdAt: Timestamp.fromMillis(Date.now() - 5 * 86_400_000),
    });

    await setUpPlan(page, {
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
    });
    const profile = (await profileRef.get()).data();
    expect(profile?.activationJourneyVersion).toBe(2);
    expect(profile?.onboardingCompletedAt?.toMillis()).toBeGreaterThan(
      profile?.createdAt?.toMillis() + 4 * 86_400_000
    );
    const firstWeek = page.getByRole("region", { name: "Your first week" });
    await expect(firstWeek).toBeVisible({ timeout: 20_000 });
    await expect(firstWeek).toContainText("Day 1 of 7");
    await expect(
      firstWeek.getByText("Finish your first workout")
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /Log meals from a photo|Upgrade to Pro/,
      })
    ).toHaveCount(0);
  } finally {
    resetNodeClock();
    if (account) await deleteAccount(page, account);
  }
});
