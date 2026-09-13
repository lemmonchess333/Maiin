import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { signInAsTestUser, TEST_USER } from "./helpers/auth";
import { emulatorActive } from "./helpers/emulator";
import { suppressCoachmarks } from "./helpers/suppressCoachmarks";
import { settleImages } from "./helpers/settleImages";
test.use({ viewport: { width: 393, height: 852 }, timezoneId: "UTC" });
test.describe("saved workout correction", () => {
  test.setTimeout(60_000);
  test.skip(!emulatorActive, "Requires local Firebase emulators.");
  for (const colorScheme of ["dark", "light"] as const) {
    test(`edits performed facts and reloads the saved detail — ${colorScheme}`, async ({
      page,
    }, testInfo) => {
      const app = initializeApp(
        { projectId: "demo-tropos" },
        `correction-${colorScheme}`
      );
      const auth = getAuth(app),
        db = getFirestore(app);
      const user = await auth.createUser({
        email: `correction-${colorScheme}-${Date.now()}@tropos.test`,
        password: TEST_USER.password,
      });
      const userRef = db.doc(`users/${user.uid}`);
      try {
        const seed = await auth.getUserByEmail(TEST_USER.email);
        const profile = (await db.doc(`users/${seed.uid}`).get()).data();
        await userRef.set({
          ...profile,
          uid: user.uid,
          email: user.email,
          darkMode: colorScheme === "dark",
        });
        const ref = userRef.collection("workouts").doc("correct-this");
        await ref.set({
          date: "2026-09-10",
          createdAt: Timestamp.fromDate(new Date("2026-09-10T12:00:00Z")),
          notes: "Push — Programme Week 2",
          durationMinutes: 40,
          totalCalories: 240,
          totalVolume: 1680,
          burnContext: { bodyweightKg: 80 },
          exercises: [
            {
              exerciseId: "bench",
              exerciseName: "Bench Press",
              category: "horizontal_push",
              caloriesBurned: 0,
              sets: Array.from({ length: 3 }, (_, i) => ({
                setNumber: i + 1,
                reps: 8,
                weightKg: 70,
                plannedReps: 8,
                plannedWeightKg: 70,
              })),
            },
          ],
        });
        await suppressCoachmarks(page);
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await signInAsTestUser(page, {
          email: user.email!,
          password: TEST_USER.password,
        });
        await page.goto("/Maiin/workout/correct-this");
        await page
          .getByRole("button", { name: "Correct workout", exact: true })
          .click();
        const sheet = page.getByRole("dialog", {
          name: "Correct workout",
          exact: true,
        });
        await expect(sheet).toBeVisible();
        await expect(
          sheet.getByRole("button", { name: "Save corrections" })
        ).toBeDisabled();
        await sheet.getByLabel("Set 1 weight (kg)").fill("50");
        await sheet.getByLabel("Duration (minutes)").fill("30");
        expect(
          (await sheet.getByLabel("Set 1 weight (kg)").boundingBox())!.height
        ).toBeGreaterThanOrEqual(44);
        await page.addStyleTag({
          content: ".firebase-emulator-warning { display: none !important; }",
        });
        await settleImages(page);
        await testInfo.attach(`workout-correction-${colorScheme}`, {
          body: await page.screenshot({
            path: testInfo.outputPath(`workout-correction-${colorScheme}.png`),
            animations: "disabled",
          }),
          contentType: "image/png",
        });
        await sheet.getByRole("button", { name: "Save corrections" }).click();
        await expect(sheet).not.toBeVisible();
        await expect
          .poll(async () => (await ref.get()).data()?.revision)
          .toBe(1);
        expect((await ref.get()).data()).toMatchObject({
          date: "2026-09-10",
          totalVolume: 1520,
          durationMinutes: 30,
          exercises: [
            {
              sets: [
                { weightKg: 50, reps: 8, plannedWeightKg: 70, plannedReps: 8 },
                { weightKg: 70 },
                { weightKg: 70 },
              ],
            },
          ],
        });
        await page.reload();
        await page
          .getByRole("button", { name: "Correct workout", exact: true })
          .click();
        await expect(sheet.getByLabel("Set 1 weight (kg)")).toHaveValue("50");
        await expect(sheet.getByLabel("Duration (minutes)")).toHaveValue("30");
        await sheet
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
      } finally {
        await page.close();
        await db.recursiveDelete(userRef);
        await auth.deleteUser(user.uid);
        await deleteApp(app);
      }
    });
  }
});
