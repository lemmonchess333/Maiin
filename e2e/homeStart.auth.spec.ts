import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type {
  ProgramState,
  WorkoutDay,
} from "../src/features/program/programTypes";
import { localWeekKey } from "../src/lib/dateHelpers";
import { signInAsTestUser, TEST_USER } from "./helpers/auth";
import { emulatorActive } from "./helpers/emulator";

/**
 * Home's Today card has two actions (DS3): Start begins the session, and
 * the rest of the card opens the day in Train to look it over. Start is a
 * deep link (`/program?day=N&start=1`) that Train acts on once, so this is
 * the only place the whole chain runs: the card, the link, Train's effect,
 * the session screen, and the link being consumed.
 *
 * The day is chosen to be the hard case. Home resolves a lift by weekday
 * and Train's rotation cursor is the first unfinished day (ADR-0002), so
 * with Monday's session missed, Wednesday's card is session 2 while Train
 * would call session 1 next. Start must open the day the card showed.
 */
test.use({ viewport: { width: 393, height: 852 }, timezoneId: "UTC" });

function exercise(name: string, exerciseId: string, i: number) {
  return {
    name,
    exerciseId,
    instanceId: `home-start-${i}`,
    movementCategory: "horizontal_push",
    sets: 3,
    reps: 8,
    weight: 30,
    progressionType: "double",
    lastSuccessfulWeight: 30,
    lastAttemptedWeight: 30,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
  };
}

test.describe("Home's Today card", () => {
  test.skip(!emulatorActive, "Requires the local Firebase emulators.");

  test("Start opens the session the card shows; the card itself only previews it", async ({
    page,
  }, testInfo) => {
    const app = initializeApp(
      { projectId: "demo-tropos" },
      `home-start-${testInfo.retry}`
    );
    const auth = getAuth(app);
    const db = getFirestore(app);
    const user = await auth.createUser({
      email: `home-start-${Date.now()}@tropos.test`,
      password: TEST_USER.password,
    });
    const userRef = db.collection("users").doc(user.uid);
    try {
      const wednesday = new Date();
      wednesday.setUTCDate(
        wednesday.getUTCDate() + ((3 - wednesday.getUTCDay() + 7) % 7)
      );
      wednesday.setUTCHours(12, 0, 0, 0);
      // Session 1 (Monday's) is still open, so Train's cursor sits on it.
      const workouts: WorkoutDay[] = [
        {
          dayName: "Session 1",
          dayType: "push",
          completed: false,
          skipped: false,
          exercises: [exercise("Bench Press", "bench_press", 0)],
        },
        {
          dayName: "Session 2",
          dayType: "legs",
          completed: false,
          skipped: false,
          exercises: [exercise("Squat", "squat", 1)],
        },
      ] as WorkoutDay[];
      await userRef
        .collection("programState")
        .doc("current")
        .set({
          goal: "recomp",
          currentPhase: "base",
          weekNumber: 1,
          splitType: "upper_lower",
          workouts,
          fatigueScore: 0,
          updatedAt: wednesday.getTime(),
          liftWeekKey: localWeekKey(wednesday),
          programSchemaVersion: 3,
          settings: { autoProgression: true, smallPlates: false },
          weekHistory: [],
        } satisfies ProgramState);
      const seedUser = await auth.getUserByEmail(TEST_USER.email);
      const seedProfile = await db.collection("users").doc(seedUser.uid).get();
      await userRef.set({
        ...seedProfile.data(),
        uid: user.uid,
        email: user.email,
        darkMode: true,
        weekScheduleVersion: 1,
        // Lifts on Monday (day 1) and Wednesday (day 3), rest otherwise.
        // Wednesday is the week's second lift day, but Session 1 is still
        // open, so Home shows Session 1, as Train does (ADR-0002).
        weekSchedule: Array.from({ length: 7 }, (_, day) => ({
          day,
          type: day === 1 || day === 3 ? "lift" : "rest",
        })),
      });
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await page.clock.setFixedTime(wednesday);
      await signInAsTestUser(page, {
        email: user.email!,
        password: TEST_USER.password,
      });

      const training = page.getByLabel("Today’s training", { exact: true });
      await expect(training).toContainText("Session 1", { timeout: 20_000 });

      // The card is the preview: it opens the day and starts nothing.
      await training
        .getByRole("button", { name: "Open Session 1 in Train" })
        .click();
      await expect(page).toHaveURL(/\/program\?day=0$/);
      await expect(
        page.getByRole("heading", { name: "Session 1", exact: true })
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel("Close workout")).toHaveCount(0);

      // Start begins that same day.
      await page.goBack();
      await training.getByRole("button", { name: "Start workout" }).click();
      const close = page.getByLabel("Close workout");
      await expect(close).toBeVisible({ timeout: 15_000 });
      // The session header names its day beside the close control. Train's
      // own page for day 1 sits underneath, so a bare "Bench Press" anywhere on
      // screen would pass whichever day the session had opened.
      await expect(close.locator("..")).toContainText("Session 1");
      // The link is consumed, so a refresh or Back lands on the day.
      await expect(page).toHaveURL(/\/program\?day=0$/);

      await close.click();
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Session 1", exact: true })
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel("Close workout")).toHaveCount(0);
    } finally {
      await page.close();
      await db.recursiveDelete(userRef);
      await auth.deleteUser(user.uid);
      await deleteApp(app);
    }
  });
});
