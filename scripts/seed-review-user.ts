#!/usr/bin/env node
/**
 * Seed for an account whose Weekly Review has something in it.
 *
 * The shared e2e user is the cold-start fixture under `seed:e2e` alone
 * (the authenticated suite's chain), so its `/review` is the "Your first
 * review" placeholder, and the a11y sweep that opened the route checked
 * the spinner in front of it. This account joined a month ago and
 * logged last week: three lifts, a run and two days of meals, so the
 * recap opens on "Your week" and walks through the week ahead.
 *
 * A separate account, so nothing here reaches the cold-start screens
 * `coldstart.auth.spec.ts` asserts. The plan is built by the REAL
 * planBuilder, as Onboarding calls it. Same emulator-only gate as every
 * other seed; idempotent, so it can run on a seeded emulator.
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { assertEmulatorEnvOrExit } from "../e2e/helpers/emulator";
import { buildPlan } from "../src/features/program/planBuilder";
import { stripUndefined } from "../src/lib/firestoreGuards";
import { localDateString } from "../src/lib/dateHelpers";
import { REVIEW_TEST_USER } from "../e2e/helpers/reviewUser";

assertEmulatorEnvOrExit();

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-tropos" });
}
const auth = getAuth();
const db = getFirestore();

async function ensureUser(): Promise<string> {
  try {
    return (await auth.getUserByEmail(REVIEW_TEST_USER.email)).uid;
  } catch {
    const created = await auth.createUser({
      email: REVIEW_TEST_USER.email,
      password: REVIEW_TEST_USER.password,
      emailVerified: true,
      displayName: REVIEW_TEST_USER.displayName,
    });
    return created.uid;
  }
}

const ymd = (d: Date) => localDateString(d);

/** A day of the week before this one, 0 = its Monday, at 08:00. */
function lastWeek(dayOfWeek: number): Date {
  const d = new Date();
  const fromMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - fromMonday - 7 + dayOfWeek);
  d.setHours(8, 0, 0, 0);
  return d;
}

async function run() {
  const uid = await ensureUser();
  const base = db.collection("users").doc(uid);
  const joined = new Date();
  joined.setDate(joined.getDate() - 30);

  const plan = buildPlan({
    primaryGoal: "hypertrophy",
    nutritionPhase: "recomp",
    experience: "intermediate",
    bodyweightKg: 74,
    sex: "female",
    liftDays: 3,
    preferredSplit: "auto",
    runMode: "freeform",
    weeklyRunDays: 0,
    equipment: "full_gym",
    injuries: [],
    currentDate: localDateString(new Date()),
    preserveHistory: false,
  } as Parameters<typeof buildPlan>[0]);

  await base.set(
    {
      uid,
      displayName: REVIEW_TEST_USER.displayName,
      email: REVIEW_TEST_USER.email,
      photoURL: null,
      athleteType: "Hybrid",
      weightKg: 74,
      heightCm: 170,
      age: 30,
      sex: "female",
      weeklyMealsTarget: 10,
      preferredWeightUnit: "kg",
      preferredHeightUnit: "cm",
      darkMode: false,
      onboardingComplete: true,
      subscriptionTier: "free",
      currentStreak: 0,
      longestStreak: 0,
      lastLogDate: null,
      adjustCaloriesForTraining: true,
      targetCalories: 2100,
      targetProtein: 130,
      createdAt: Timestamp.fromDate(joined),
      ...plan.profileUpdates,
    },
    { merge: true }
  );
  // A freeform plan leaves `runPlan` undefined, which the Admin SDK
  // refuses; the app's callable drops it in JSON, as this does.
  await base
    .collection("programState")
    .doc("current")
    .set(stripUndefined(plan.programState));

  // Last week's sessions, in the shapes the app writes.
  const lifts = [
    { id: "bench-press", name: "Bench Press", cat: "push", kg: 40 },
    { id: "back-squat", name: "Back Squat", cat: "legs", kg: 60 },
    { id: "barbell-row", name: "Barbell Row", cat: "pull", kg: 45 },
  ];
  for (const [i, dow] of [0, 2, 4].entries()) {
    const at = lastWeek(dow);
    const exercises = lifts.map((l) => ({
      exerciseId: l.id,
      exerciseName: l.name,
      category: l.cat,
      caloriesBurned: 0,
      sets: Array.from({ length: 3 }, (_, s) => ({
        setNumber: s + 1,
        reps: 8,
        weightKg: l.kg + i * 2.5,
      })),
    }));
    await base
      .collection("workouts")
      .doc(`review-w${i}`)
      .set({
        date: ymd(at),
        exercises,
        totalCalories: 300,
        durationMinutes: 45,
        source: "programme",
        createdAt: Timestamp.fromDate(at),
        tonnageKg: exercises.reduce(
          (t, e) => t + e.sets.reduce((s, x) => s + x.weightKg * x.reps, 0),
          0
        ),
      });
  }
  const runAt = lastWeek(5);
  await base
    .collection("runs")
    .doc("review-r0")
    .set({
      date: ymd(runAt),
      distance: 5000,
      duration: 1800,
      avgPace: 360,
      elevationGain: 20,
      calories: 310,
      activityType: "freerun",
      completedAt: Timestamp.fromDate(runAt),
      createdAt: Timestamp.fromDate(runAt),
    });
  for (const [i, dow] of [1, 3].entries()) {
    const at = lastWeek(dow);
    await base
      .collection("meals")
      .doc(`review-m${i}`)
      .set({
        date: ymd(at),
        foodName: "Porridge with berries",
        meal: "breakfast",
        totalCalories: 420,
        totalProtein: 18,
        totalCarbs: 62,
        totalFat: 10,
        items: [
          {
            name: "Porridge with berries",
            calories: 420,
            protein: 18,
            carbs: 62,
            fat: 10,
          },
        ],
        createdAt: Timestamp.fromDate(at),
      });
  }

  console.log(
    `[seed-review] ready: ${REVIEW_TEST_USER.email} (uid ${uid}), ` +
      `last week ${ymd(lastWeek(0))} to ${ymd(lastWeek(6))}`
  );
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error("[seed-review] failed:", err);
    process.exit(1);
  }
);
