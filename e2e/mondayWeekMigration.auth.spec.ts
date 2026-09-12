import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type {
  ProgramState,
  ScheduledRunDay,
  WorkoutDay,
} from "../src/features/program/programTypes";
import { signInAsTestUser, TEST_USER } from "./helpers/auth";
import { emulatorActive } from "./helpers/emulator";
import { suppressCoachmarks } from "./helpers/suppressCoachmarks";
import { settleImages } from "./helpers/settleImages";

test.use({ viewport: { width: 393, height: 852 }, timezoneId: "UTC" });

test.describe("Monday migration on an existing account", () => {
  test.skip(!emulatorActive, "Requires the local Firebase emulators.");
  for (const colorScheme of ["dark", "light"] as const) {
    test(`preserves progress, moved runs and saved links — ${colorScheme}`, async ({
      page,
    }, testInfo) => {
      const app = initializeApp(
        { projectId: "demo-tropos" },
        `monday-${colorScheme}-${testInfo.retry}`
      );
      const auth = getAuth(app);
      const db = getFirestore(app);
      const user = await auth.createUser({
        email: `monday-${colorScheme}-${Date.now()}@tropos.test`,
        password: TEST_USER.password,
      });
      const userRef = db.collection("users").doc(user.uid);
      const programmeRef = userRef.collection("programState").doc("current");
      const now = new Date("2026-09-09T12:00:00Z");
      try {
        const seedUser = await auth.getUserByEmail(TEST_USER.email);
        const seedProfile = (
          await db.collection("users").doc(seedUser.uid).get()
        ).data();
        const raceGoal = { distance: "10k" as const, targetDate: "2026-12-13" };
        await userRef.set({
          ...seedProfile,
          uid: user.uid,
          email: user.email,
          darkMode: colorScheme === "dark",
          runMode: "race_prep",
          raceGoal,
          weeklyWorkoutsTarget: 2,
          weeklyRunDaysTarget: 3,
          weekScheduleVersion: 1,
          weekSchedule: Array.from({ length: 7 }, (_, day) => ({
            day,
            type: [1, 3].includes(day)
              ? "lift"
              : [0, 2, 4].includes(day)
                ? "run"
                : "rest",
          })),
        });
        const workouts: WorkoutDay[] = ["Upper A", "Lower A"].map(
          (dayName, i) => ({
            dayName,
            dayType: i === 0 ? "upper" : "lower",
            completed: i === 0,
            exercises: [
              {
                name: i === 0 ? "Overhead Press" : "Squat",
                exerciseId: i === 0 ? "overhead-press" : "squat",
                instanceId: `monday-${i}`,
                movementCategory: i === 0 ? "vertical_push" : "knee_dominant",
                sets: 3,
                reps: 8,
                baseSets: 3,
                baseReps: 8,
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
          })
        );
        const runs: ScheduledRunDay[] = [0, 2, 4].map((dayIndex) => ({
          id: `runday_2026-09-06_${dayIndex}_easy_30`,
          dayIndex,
          date: `2026-09-${String(6 + dayIndex).padStart(2, "0")}`,
          weekKey: "2026-09-06",
          templateId: "easy_30",
          type: "easy",
          status: "planned",
          completed: false,
        }));
        runs[0] = { ...runs[0], status: "completed_exact", completed: true };
        runs[2] = {
          ...runs[2],
          date: "2026-09-11",
          dayIndex: 5,
          movedFromDate: "2026-09-10",
          movedToDate: "2026-09-11",
        };
        const original: ProgramState = {
          goal: "recomp",
          currentPhase: "base",
          weekNumber: 3,
          splitType: "upper_lower",
          workouts,
          fatigueScore: 17,
          updatedAt: now.getTime(),
          liftWeekKey: "2026-09-06",
          programSchemaVersion: 3,
          settings: { autoProgression: true, microloading: true },
          weekHistory: [{ weekNumber: 2, workouts: [] }],
          runDays: runs,
          runPlan: {
            mode: "race_prep",
            raceGoal,
            currentWeek: 2,
            totalWeeks: 16,
          },
          manualCompletions: {
            [runs[1].id!]: { completedAt: new Date("2026-09-08T12:00:00Z") },
          },
        };
        await programmeRef.set(original);
        await suppressCoachmarks(page);
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await page.clock.setFixedTime(now);
        await signInAsTestUser(page, {
          email: user.email!,
          password: TEST_USER.password,
        });
        await page.addStyleTag({
          content: ".firebase-emulator-warning { display: none !important; }",
        });
        await expect
          .poll(
            async () => (await programmeRef.get()).data()?.programSchemaVersion
          )
          .toBe(4);
        const saved = (await programmeRef.get()).data() as ProgramState;
        expect(saved.liftWeekKey).toBe("2026-09-07");
        expect(saved.weekNumber).toBe(3);
        expect(saved.weekHistory).toEqual(original.weekHistory);
        expect(
          saved.workouts.map(({ dayName, completed, exercises }) => ({
            dayName,
            completed,
            exercises,
          }))
        ).toEqual(
          workouts.map(({ dayName, completed, exercises }) => ({
            dayName,
            completed,
            exercises,
          }))
        );
        expect(saved.runDays?.map((rd) => rd.date)).toEqual([
          "2026-09-06",
          "2026-09-08",
          "2026-09-11",
        ]);
        expect(saved.runDays?.every((rd) => rd.weekKey === "2026-09-07")).toBe(
          true
        );
        expect(saved.runDays?.map((rd) => rd.id)).toEqual(
          runs.map((rd) => rd.id)
        );
        expect(saved.runPlan?.currentWeek).toBe(2);
        expect(saved.manualCompletions?.[saved.runDays![1].id!]).toBeTruthy();
        expect(Object.keys(saved.manualCompletions ?? {})).toEqual([
          saved.runDays![1].id,
        ]);
        expect(saved.runDays?.[2]).toMatchObject({
          id: runs[2].id,
          movedFromDate: "2026-09-10",
          movedToDate: "2026-09-11",
        });

        const days = page.getByRole("button", {
          name: /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d+ September/,
        });
        await expect(days).toHaveCount(7);
        expect(
          await days.evaluateAll((els) =>
            els.map((el) => el.getAttribute("aria-label")?.split(",")[0])
          )
        ).toEqual([
          "Monday 7 September",
          "Tuesday 8 September",
          "Wednesday 9 September",
          "Thursday 10 September",
          "Friday 11 September",
          "Saturday 12 September",
          "Sunday 13 September",
        ]);
        await expect(days.nth(1)).toHaveAttribute(
          "aria-label",
          /completed run/
        );
        await settleImages(page);
        await page.screenshot({
          path: testInfo.outputPath(`monday-home-${colorScheme}.png`),
          animations: "disabled",
        });

        await page.goto("/Maiin/program?tab=run");
        const week = page.getByRole("tablist", {
          name: "Run week",
          exact: true,
        });
        await expect(week.getByRole("tab")).toHaveCount(7);
        expect(
          await week
            .getByRole("tab")
            .evaluateAll((els) =>
              els.map((el) => el.getAttribute("aria-label")?.split(",")[0])
            )
        ).toEqual(["7", "30m", "9", "10", "30m", "12", "13"]);
        expect(
          await week
            .locator(":scope > div")
            .evaluateAll((els) =>
              els.map((el) => el.firstElementChild?.textContent)
            )
        ).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
        await expect(week.getByRole("tab").nth(1)).toHaveAttribute(
          "aria-label",
          /completed/
        );
        await expect(
          week.getByRole("tab", { name: /^9, today/ })
        ).toHaveAttribute("aria-selected", "true");
        await settleImages(page);
        await page.screenshot({
          path: testInfo.outputPath(`monday-programme-${colorScheme}.png`),
          animations: "disabled",
        });

        await page.goto(
          `/Maiin/run?scheduledRunId=${encodeURIComponent(runs[2].id!)}`
        );
        await expect(
          page.getByRole("button", { name: /^Start Easy/ })
        ).toBeVisible();
        await expect(page.getByRole("heading", { name: /Easy/ })).toBeVisible();
        expect((await programmeRef.get()).data()?.weekNumber).toBe(3);
      } finally {
        await page.close();
        await db.recursiveDelete(userRef);
        await auth.deleteUser(user.uid);
        await deleteApp(app);
      }
    });
  }
});
