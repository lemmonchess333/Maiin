import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { signInAsTestUser } from "./helpers/auth";
import { emulatorActive } from "./helpers/emulator";
import { settleImages } from "./helpers/settleImages";
import { normalizeProgramState } from "../src/features/program/programTypes";
import { buildPlan } from "../src/features/program/planBuilder";
import {
  localDateString,
  localWeekKey,
  addLocalDays,
} from "../src/lib/dateHelpers";

test.use({ viewport: { width: 393, height: 852 }, timezoneId: "UTC" });
test("training advice, saved correction and the next session agree", async ({
  page,
}, testInfo) => {
  test.skip(!emulatorActive, "Requires isolated local Firebase emulators.");
  test.setTimeout(120_000);
  const app = initializeApp(
    { projectId: "demo-tropos" },
    `training-journeys-${Date.now()}`
  );
  const auth = getAuth(app),
    db = getFirestore(app);
  const user = await auth.createUser({
    email: `training-journeys-${Date.now()}@tropos.test`,
    password: "test-password-123",
  });
  const root = db.doc(`users/${user.uid}`);
  const current = root.collection("programState").doc("current");
  const now = new Date(),
    today = localDateString(now);
  const yesterday = addLocalDays(now, -1),
    tomorrow = addLocalDays(now, 1);
  // Build this isolated account's plan without depending on capture seeds
  // or another test's mutations of the shared authentication fixture.
  const plan = buildPlan({
    primaryGoal: "hypertrophy",
    nutritionPhase: "recomp",
    experience: "intermediate",
    bodyweightKg: 72,
    sex: "female",
    liftDays: 3,
    preferredSplit: "auto",
    runMode: "race_prep",
    weeklyRunDays: 3,
    raceGoal: {
      distance: "marathon",
      targetDate: localDateString(addLocalDays(now, 42)),
    },
    equipment: "full_gym",
    injuries: [],
    currentDate: today,
    preserveHistory: false,
  });
  const state = normalizeProgramState({
    ...plan.programState,
    weekNumber: 1,
    currentPhase: "base",
    liftWeekKey: localWeekKey(now),
    settings: { autoProgression: true, smallPlates: false },
    workouts: [
      {
        dayName: "Lower",
        dayType: "lower",
        completed: false,
        exercises: [
          {
            instanceId: "squat-journey",
            exerciseId: "squat",
            name: "Barbell Squat",
            movementCategory: "knee_dominant",
            sets: 3,
            baseSets: 3,
            reps: 8,
            weight: 100,
            progressionType: "linear",
            isAccessory: false,
            restSeconds: 0,
            lastSuccessfulWeight: 100,
            lastAttemptedWeight: 100,
            consecutiveFailures: 0,
            plateauCount: 0,
            performanceHistory: [],
            lastPerformance: null,
          },
        ],
      },
    ],
    runDays: [
      {
        id: "tomorrow-tempo",
        date: localDateString(tomorrow),
        dayIndex: tomorrow.getDay(),
        weekKey: localWeekKey(tomorrow),
        templateId: "tempo_30",
        type: "tempo",
        status: "planned",
        completed: false,
      },
    ],
  });
  try {
    await root.set({
      uid: user.uid,
      email: user.email,
      displayName: "Training Journey",
      photoURL: null,
      athleteType: "Hybrid",
      weightKg: 72,
      heightCm: 168,
      age: 29,
      sex: "female",
      weeklyMealsTarget: 10,
      preferredWeightUnit: "kg",
      preferredHeightUnit: "cm",
      onboardingComplete: true,
      subscriptionTier: "free",
      currentStreak: 0,
      longestStreak: 0,
      lastLogDate: null,
      adjustCaloriesForTraining: true,
      targetCalories: 2100,
      targetProtein: 130,
      ...plan.profileUpdates,
      darkMode: false,
      weeklyWorkoutsTarget: 1,
      weekScheduleVersion: 1,
      weekSchedule: Array.from({ length: 7 }, (_, day) => ({
        day,
        type:
          day === now.getDay()
            ? "lift"
            : day === tomorrow.getDay()
              ? "run"
              : "rest",
      })),
    });
    await current.set(state);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signInAsTestUser(page, {
      email: user.email!,
      password: "test-password-123",
    });
    await page.goto("program");
    const start = page.getByRole("button", {
      name: "Start workout",
      exact: true,
    });
    await expect(start).toBeVisible({ timeout: 20_000 });
    const advice = page.getByRole("button", { name: /^Go easier today/ });
    // Tomorrow's plan is not evidence that a hard run happened yesterday.
    await expect(advice).toHaveCount(0);
    const plannedRuns = (await current.get()).data()!.runDays;
    expect(plannedRuns).toEqual(state.runDays);
    const run = root.collection("runs").doc("midnight-run");
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const hardRun = {
      date: localDateString(yesterday),
      completedAt: Timestamp.fromDate(midnight),
      distance: 5000,
      duration: 1800,
      activityType: "tempo",
      avgPace: 360,
    };
    await run.set(hardRun);
    await expect(advice).toContainText("hard run yesterday", {
      timeout: 20_000,
    });
    for (const dark of [false, true]) {
      await page.evaluate(
        (value) => document.documentElement.classList.toggle("dark", value),
        dark
      );
      await settleImages(page);
      await testInfo.attach(`training-advice-${dark ? "dark" : "light"}`, {
        body: await advice.screenshot({ animations: "disabled" }),
        contentType: "image/png",
      });
    }
    await run.update({ date: localDateString(addLocalDays(now, -2)) });
    await expect(advice).toHaveCount(0);
    await run.update({ date: localDateString(yesterday), distance: 0 });
    await expect(advice).toHaveCount(0);
    await run.update({ distance: 5000 });
    await expect(advice).toBeVisible();
    await run.delete();
    await expect(advice).toHaveCount(0);
    // A lift logged yesterday is no reason to go easier (Lift4 (3)): the
    // advice speaks for a hard run alone, and the calendar's "still
    // recovering" guess is retired. With yesterday's squats logged, a hard
    // run beside them brings the run's reason only, and taking the run
    // away clears the advice while the squats are still there.
    const yesterdaysLift = root.collection("workouts").doc("yesterday-lift");
    await yesterdaysLift.set({
      date: localDateString(yesterday),
      createdAt: Timestamp.now(),
      exercises: [
        {
          exerciseId: "squat",
          exerciseName: "Barbell Squat",
          category: "knee_dominant",
          plannedSetCount: 3,
          sets: [{ type: "working", reps: 8, weightKg: 100 }],
        },
      ],
      durationMinutes: 0,
      totalCalories: 0,
    });
    await run.set(hardRun);
    await expect(advice).toContainText(
      "hard run yesterday, and this session loads the same legs"
    );
    await expect(advice).not.toContainText(/quads|recovering/i);
    await run.delete();
    await expect(advice).toHaveCount(0);
    await yesterdaysLift.delete();
    expect((await current.get()).data()!.workouts).toEqual(state.workouts);

    await start.click();
    await expect(page.getByLabel("Close workout")).toBeVisible();
    const uncompleted = page.getByLabel("Mark set complete", { exact: true });
    const setCount = await uncompleted.count();
    expect(setCount).toBeGreaterThanOrEqual(3);
    // Keep the real warm-up ramp; only working sets enter the saved receipt.
    for (let i = 0; i < setCount; i++) {
      await uncompleted.first().click();
      await expect(uncompleted).toHaveCount(setCount - i - 1);
    }
    // Completing the last set opens the review automatically.
    await page
      .getByRole("button", { name: "Save workout", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Done", exact: true })
    ).toBeVisible({ timeout: 20_000 });
    const savedId = (await current.get()).data()!.workouts[0]
      .completedWorkoutId;
    const saved = root.collection("workouts").doc(savedId);
    expect((await saved.get()).data()!.exercises[0]).toMatchObject({
      plannedSetCount: 3,
      sets: [
        { reps: 8, weightKg: 100, plannedReps: 8, plannedWeightKg: 100 },
        { reps: 8, weightKg: 100 },
        { reps: 8, weightKg: 100 },
      ],
    });
    expect(
      (await current.get()).data()!.workouts[0].exercises[0].weight
    ).toBeGreaterThan(100);
    await page.goto(`workout/${savedId}`);
    await page
      .getByRole("button", { name: "Correct workout", exact: true })
      .click();
    const sheet = page.getByRole("dialog", {
      name: "Correct workout",
      exact: true,
    });
    await sheet.getByLabel("Set 3 reps").fill("6");
    await sheet
      .getByRole("button", { name: "Save corrections", exact: true })
      .click();
    await expect(sheet).toHaveCount(0);
    await expect.poll(async () => (await saved.get()).data()?.revision).toBe(1);
    const corrected = (await current.get()).data()!;
    // Every working set counts (Lift4 (7)): 8, 8 and 6 against 3×8 at the
    // plan's weight is a miss, and the record is the average set, 7.
    expect(corrected.workouts[0].exercises[0]).toMatchObject({
      weight: 100,
      consecutiveFailures: 1,
      lastPerformance: { reps: 7, weight: 100 },
    });
    expect(corrected.workouts[0].exercises[0].performanceHistory).toHaveLength(
      1
    );
    expect(corrected.runDays).toEqual(plannedRuns);
    await page.goto("program");
    await page
      .getByRole("button", { name: "Start next week", exact: true })
      .click();
    await expect
      .poll(async () => (await current.get()).data()?.weekNumber)
      .toBe(2);
    await page.reload();
    await start.click();
    await expect(
      page.getByText("Target: 3×8 @ 100 kg", { exact: true })
    ).toBeVisible();
    // Previous is the same set last time, so the corrected third set reads
    // as corrected and the two before it as they were lifted.
    for (const [set, last] of [
      ["set 1", "100 × 8"],
      ["set 2", "100 × 8"],
      ["set 3", "100 × 6"],
    ]) {
      await expect(
        page.getByRole("button", {
          name: `Last time ${last}. Use it for ${set}`,
          exact: true,
        })
      ).toBeVisible();
    }
    for (const dark of [false, true]) {
      await page.evaluate(
        (value) => document.documentElement.classList.toggle("dark", value),
        dark
      );
      await settleImages(page);
      await testInfo.attach(
        `corrected-next-session-${dark ? "dark" : "light"}`,
        {
          body: await page.screenshot({ animations: "disabled" }),
          contentType: "image/png",
        }
      );
    }
    expect((await saved.get()).data()!.date).toBe(today);
    expect((await saved.get()).data()!.exercises[0].sets[2]).toMatchObject({
      reps: 6,
      plannedReps: 8,
    });
  } finally {
    await page.close();
    await db.recursiveDelete(root);
    await auth.deleteUser(user.uid);
    await deleteApp(app);
  }
});
