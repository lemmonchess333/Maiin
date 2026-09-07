#!/usr/bin/env node
/**
 * Seed for the LiftReturnSheet capture.
 *
 * Provisions a lifter whose last logged session is old enough for
 * `assessLiftReturn` to classify `detrained`, so the welcome-back sheet is
 * reachable on Home:
 *
 *   1. A lift-only profile + programState built by the REAL planBuilder —
 *      the same call Onboarding makes — so nothing here is a hand-rolled
 *      shape that can drift from what the app writes.
 *   2. A workout history whose most recent session has SETS in it and sits
 *      24 days back. The sets matter: the assessment ignores a document
 *      with no completed work, so a fixture without them would seed a user
 *      the sheet never greets and produce an empty frame that looked like
 *      a regression.
 *
 * A dedicated user rather than ageing a shared one, for the reason
 * `seed-fellbehind-capture` gives: every other capture depends on RECENT
 * history, and the gap staged here would corrupt them. It is also why this
 * user runs FREEFORM with no race goal — a pendingFellBehindPrompt would
 * suppress the very sheet this seed exists to photograph, since the lift
 * surface stands down when the run side is speaking about the same lapse.
 *
 * Same emulator-only safety gate as every other seed.
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { assertEmulatorEnvOrExit } from "../e2e/helpers/emulator";
import { buildPlan } from "../src/features/program/planBuilder";
import { stripUndefined } from "../src/lib/firestoreGuards";
import { localDateString } from "../src/lib/dateHelpers";

assertEmulatorEnvOrExit();

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-tropos" });
}
const auth = getAuth();
const db = getFirestore();

export const LIFTRETURN_CAPTURE_USER = {
  email: "liftreturn-capture@tropos.test",
  password: "test-password-123",
  displayName: "Returning Rae",
};

/** Comfortably past LAYOFF_DETRAINED_DAYS (21), and past the sheet's
 *  14-day switch from days to weeks, so the frame shows both branches of
 *  the copy that matter. */
const DAYS_AWAY = 24;

async function ensureUser(): Promise<string> {
  try {
    const existing = await auth.getUserByEmail(LIFTRETURN_CAPTURE_USER.email);
    return existing.uid;
  } catch {
    const created = await auth.createUser({
      email: LIFTRETURN_CAPTURE_USER.email,
      password: LIFTRETURN_CAPTURE_USER.password,
      emailVerified: true,
      displayName: LIFTRETURN_CAPTURE_USER.displayName,
    });
    return created.uid;
  }
}

const ymd = (d: Date) => localDateString(d);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(18, 0, 0, 0);
  return d;
};

async function run() {
  const uid = await ensureUser();
  const base = db.collection("users").doc(uid);

  const plan = buildPlan({
    primaryGoal: "strength",
    nutritionPhase: "recomp",
    experience: "intermediate",
    bodyweightKg: 78,
    sex: "male",
    liftDays: 3,
    preferredSplit: "auto",
    // Freeform, no race goal: see the header — a race plan would let the
    // run side's prompt suppress this sheet.
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
      displayName: LIFTRETURN_CAPTURE_USER.displayName,
      email: LIFTRETURN_CAPTURE_USER.email,
      photoURL: null,
      athleteType: "Lifter",
      weightKg: 78,
      heightCm: 180,
      age: 33,
      sex: "male",
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
      targetCalories: 2400,
      targetProtein: 150,
      ...plan.profileUpdates,
    },
    { merge: true }
  );

  // A freeform plan carries no `runPlan`, so buildPlan leaves the key
  // `undefined` — which the Admin SDK rejects outright. The app never hits
  // this: onboarding posts the plan to a callable, and JSON serialisation
  // drops undefined keys before the server writes them. `stripUndefined` is
  // the same removal, applied here so the seeded document matches the one a
  // real freeform user ends up with.
  await base
    .collection("programState")
    .doc("current")
    .set(stripUndefined(plan.programState));

  // Two real sessions, the newest DAYS_AWAY back. Sets are present because
  // the assessment counts work done, not documents written.
  const history = [
    { at: daysAgo(DAYS_AWAY + 3), weight: 90 },
    { at: daysAgo(DAYS_AWAY), weight: 92.5 },
  ];
  for (const [i, h] of history.entries()) {
    await base
      .collection("workouts")
      .doc(`liftreturn-w${i}`)
      .set({
        date: ymd(h.at),
        exercises: [
          {
            exerciseId: "barbell-squat",
            exerciseName: "Barbell Squat",
            category: "legs",
            sets: [1, 2, 3].map((n) => ({
              setNumber: n,
              reps: 5,
              weightKg: h.weight,
            })),
            caloriesBurned: 0,
          },
        ],
        totalCalories: 300,
        durationMinutes: 45,
        notes: "",
        source: "programme",
        createdAt: Timestamp.fromDate(h.at),
      });
  }

  console.log(
    `[seed-liftreturn] ready: ${LIFTRETURN_CAPTURE_USER.email} (uid ${uid})\n` +
      `  last session ${ymd(daysAgo(DAYS_AWAY))} (${DAYS_AWAY} days back) ` +
      `-> detrained; freeform, no race goal so nothing suppresses the sheet`
  );
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error("[seed-liftreturn] failed:", err);
    process.exit(1);
  }
);
