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
import { suppressCoachmarks } from "./helpers/suppressCoachmarks";
import { settleImages } from "./helpers/settleImages";

test.use({ viewport: { width: 393, height: 852 }, timezoneId: "UTC" });

test.describe("Home training recovery", () => {
  test.skip(!emulatorActive, "Requires the local Firebase emulators.");

  for (const colorScheme of ["dark", "light"] as const) {
    test(`overflow lift opens the next unfinished session and the layout stays editable — ${colorScheme}`, async ({
      page,
    }, testInfo) => {
      const app = initializeApp(
        { projectId: "demo-tropos" },
        `home-recovery-${colorScheme}-${testInfo.retry}`
      );
      const auth = getAuth(app);
      const db = getFirestore(app);
      const user = await auth.createUser({
        email: `home-recovery-${colorScheme}-${Date.now()}@tropos.test`,
        password: TEST_USER.password,
      });
      const userRef = db.collection("users").doc(user.uid);
      try {
        const saturday = new Date();
        saturday.setUTCDate(saturday.getUTCDate() + 6 - saturday.getUTCDay());
        saturday.setUTCHours(12, 0, 0, 0);
        const workouts: WorkoutDay[] = Array.from({ length: 6 }, (_, i) => ({
          dayName: `Session ${i + 1}`,
          dayType: "push",
          completed: i === 0,
          skipped: i === 1,
          exercises: [
            {
              name: "Bench Press",
              exerciseId: "bench_press",
              instanceId: `home-recovery-${i}`,
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
            },
          ],
        }));
        // Seed before opening the app so its cache starts with the same
        // progress as Firestore; no out-of-band edits race a live client.
        const programmeRef = userRef.collection("programState").doc("current");
        await programmeRef.set({
          goal: "recomp",
          currentPhase: "base",
          weekNumber: 1,
          splitType: "ppl",
          workouts,
          fatigueScore: 0,
          updatedAt: saturday.getTime(),
          liftWeekKey: localWeekKey(saturday),
          programSchemaVersion: 3,
          settings: { autoProgression: true, microloading: true },
          weekHistory: [],
        } satisfies ProgramState);
        // Give each theme its own account; other auth specs use the shared seed.
        const seedUser = await auth.getUserByEmail(TEST_USER.email);
        const seedProfile = await db
          .collection("users")
          .doc(seedUser.uid)
          .get();
        await userRef.set({
          ...seedProfile.data(),
          uid: user.uid,
          email: user.email,
          darkMode: colorScheme === "dark",
          weekScheduleVersion: 1,
          // #2253: Saturday is the seventh lifting day in a six-workout plan.
          weekSchedule: Array.from({ length: 7 }, (_, day) => ({
            day,
            type: "lift",
          })),
        });
        await suppressCoachmarks(page);
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await page.clock.setFixedTime(saturday);
        await signInAsTestUser(page, {
          email: user.email!,
          password: TEST_USER.password,
        });
        await page.addStyleTag({
          content: ".firebase-emulator-warning { display: none !important; }",
        });
        const training = page.getByLabel("Today’s training", { exact: true });
        const open = training.getByRole("button", { name: "Open programme" });
        await expect(open).toBeVisible();
        await expect(training).toContainText("Check your lifting plan");
        await expect(training).not.toContainText("Rest day");
        expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await settleImages(page);
        await testInfo.attach(`home-recovery-${colorScheme}`, {
          body: await page.screenshot({
            path: testInfo.outputPath(`home-recovery-${colorScheme}.png`),
            animations: "disabled",
          }),
          contentType: "image/png",
        });

        await open.click();
        await expect(page).toHaveURL(/\/program\?day=2$/);
        await expect(
          page.getByRole("heading", { name: workouts[2].dayName, exact: true })
        ).toBeVisible();
        await page
          .getByRole("button", { name: "More options", exact: true })
          .click();
        await page.getByRole("button", { name: /Edit weekly layout/ }).click();
        const sheet = page.getByRole("dialog", {
          name: "Edit weekly layout",
          exact: true,
        });
        await expect(sheet.getByRole("alert")).toContainText(
          "up to six lifting days"
        );
        await sheet.getByRole("button", { name: /Sun: Lift/ }).click();
        await expect(
          sheet.getByRole("button", { name: "Apply changes" })
        ).toBeEnabled();
        await sheet.getByRole("button", { name: /Sun: Run/ }).click();
        await expect(
          sheet.getByRole("button", { name: "Apply changes" })
        ).toBeDisabled();
        await settleImages(page);
        await testInfo.attach(`layout-limit-${colorScheme}`, {
          body: await page.screenshot({
            path: testInfo.outputPath(`layout-limit-${colorScheme}.png`),
            animations: "disabled",
          }),
          contentType: "image/png",
        });
        await sheet.getByRole("button", { name: /Sun: Both/ }).click();
        await sheet.getByRole("button", { name: "Apply changes" }).click();
        const confirmation = page.getByRole("alertdialog", {
          name: "Restructure programme?",
        });
        await expect(confirmation).toBeVisible();
        await confirmation
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await expect(confirmation).not.toBeVisible();
        await sheet
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        const savedWorkouts = (await programmeRef.get()).data()!
          .workouts as WorkoutDay[];
        expect(
          savedWorkouts.map(({ dayName, completed, skipped }) => ({
            dayName,
            completed,
            skipped,
          }))
        ).toEqual(
          workouts.map(({ dayName, completed, skipped }) => ({
            dayName,
            completed,
            skipped,
          }))
        );
      } finally {
        await page.close();
        await db.recursiveDelete(userRef);
        await auth.deleteUser(user.uid);
        await deleteApp(app);
      }
    });
  }
});
