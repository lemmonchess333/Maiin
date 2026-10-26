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
 * It also stages the runner's twin, `RunReturnSheet`: a free runner (no
 * race, so the fell-behind sheet has nothing to say) whose last run is
 * RUN_DAYS_AWAY back, which the large-text and axe captures open on Home.
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
 *  the copy that matter.
 *
 *  CENTRED IN ITS ROUNDING BUCKET, not just inside it. The sheet rounds to
 *  whole weeks, so 22, 23 and 24 days all read "about 3 weeks" and 25 reads
 *  "about 4". This seed runs minutes before the specs do, and on 2026-09-13
 *  the two straddled midnight UTC: 24 days was staged, the capture measured
 *  25, the sheet said "4 weeks", and the spec — which waits on "3 weeks" to
 *  prove it filmed the right branch — failed on four PRs at once. At 23 a
 *  rollover in either direction still lands inside the bucket, and 22 and 24
 *  are both still detrained. `liftReturnCaptureFixture.test.ts` pins that. */
const DAYS_AWAY = 23;

export const RUNRETURN_CAPTURE_USER = {
  email: "runreturn-capture@tropos.test",
  password: "test-password-123",
  displayName: "Returning Robin",
};

/** From two weeks away (`WELCOME_BACK_DAYS`) a free runner is greeted, and
 *  the sheet says "about 2 weeks" from 11 to 17 days. 15 leaves the line
 *  and the greeting where they are if the capture runs a day or two after
 *  the seed. `runReturnCaptureFixture.test.tsx` pins that. */
const RUN_DAYS_AWAY = 15;

async function ensureUser(account: {
  email: string;
  password: string;
  displayName: string;
}): Promise<string> {
  try {
    const existing = await auth.getUserByEmail(account.email);
    return existing.uid;
  } catch {
    const created = await auth.createUser({
      email: account.email,
      password: account.password,
      emailVerified: true,
      displayName: account.displayName,
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
  const uid = await ensureUser(LIFTRETURN_CAPTURE_USER);
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

/** The free runner: a run-only plan from the same planBuilder call
 *  Onboarding makes for someone who only runs, and two runs, the newer
 *  RUN_DAYS_AWAY back. */
async function seedRunner() {
  const uid = await ensureUser(RUNRETURN_CAPTURE_USER);
  const base = db.collection("users").doc(uid);

  const plan = buildPlan({
    primaryGoal: "running",
    nutritionPhase: "recomp",
    experience: "intermediate",
    bodyweightKg: 66,
    sex: "female",
    liftDays: 0,
    preferredSplit: "auto",
    runMode: "freeform",
    weeklyRunDays: 3,
    equipment: "full_gym",
    injuries: [],
    currentDate: localDateString(new Date()),
    preserveHistory: false,
  } as Parameters<typeof buildPlan>[0]);

  await base.set(
    {
      uid,
      displayName: RUNRETURN_CAPTURE_USER.displayName,
      email: RUNRETURN_CAPTURE_USER.email,
      photoURL: null,
      athleteType: "Runner",
      weightKg: 66,
      heightCm: 168,
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
      targetProtein: 120,
      ...plan.profileUpdates,
    },
    { merge: true }
  );
  await base
    .collection("programState")
    .doc("current")
    .set(stripUndefined(plan.programState));

  const runs = [
    { at: daysAgo(RUN_DAYS_AWAY + 4), km: 6 },
    { at: daysAgo(RUN_DAYS_AWAY), km: 5 },
  ];
  for (const [i, r] of runs.entries()) {
    await base
      .collection("runs")
      .doc(`runreturn-r${i}`)
      .set({
        date: ymd(r.at),
        distance: r.km * 1000,
        duration: r.km * 345,
        avgPace: 345,
        elevationGain: 18,
        calories: Math.round(r.km * 60),
        activityType: "freerun",
        completedAt: Timestamp.fromDate(r.at),
        createdAt: Timestamp.fromDate(r.at),
      });
  }

  console.log(
    `[seed-liftreturn] ready: ${RUNRETURN_CAPTURE_USER.email} (uid ${uid})\n` +
      `  last run ${ymd(daysAgo(RUN_DAYS_AWAY))} (${RUN_DAYS_AWAY} days back), free running`
  );
}

run()
  .then(seedRunner)
  .then(
    () => process.exit(0),
    (err) => {
      console.error("[seed-liftreturn] failed:", err);
      process.exit(1);
    }
  );
