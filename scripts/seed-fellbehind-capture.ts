#!/usr/bin/env node
/**
 * Seed for the FellBehindSheet DETRAINED capture (Run15 voice packet).
 *
 * Provisions a dedicated user whose state makes the detrained register
 * reachable on Home, all three legs staged the way production stages them:
 *
 *   1. race_prep profile + programState built by the REAL planBuilder —
 *      the exact call Onboarding makes — so nothing here is a hand-rolled
 *      shape that drifts from what the app writes.
 *   2. `pendingFellBehindPrompt` overlaid on the programState doc, the
 *      same field the weeklyFellBehindCheck cron writes.
 *   3. A run history with a detraining-length gap that ended recently
 *      (last run ~35 days ago, one comeback run 3 days ago) so
 *      fetchRecentLayoff classifies `detrained` via the re-entry window.
 *
 * A separate user (not the e2e/rich fixtures) because those captures
 * depend on RECENT run history — the gap staged here would corrupt them.
 *
 * Same emulator-only safety gate as every other seed.
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { assertEmulatorEnvOrExit } from "../e2e/helpers/emulator";
import { buildPlan } from "../src/features/program/planBuilder";
import { localDateString, localWeekKey } from "../src/lib/dateHelpers";

assertEmulatorEnvOrExit();

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-tropos" });
}
const auth = getAuth();
const db = getFirestore();

export const FELLBEHIND_CAPTURE_USER = {
  email: "fellbehind-capture@tropos.test",
  password: "test-password-123",
  displayName: "Detrained Dana",
};

async function ensureUser(): Promise<string> {
  try {
    const existing = await auth.getUserByEmail(FELLBEHIND_CAPTURE_USER.email);
    return existing.uid;
  } catch {
    const created = await auth.createUser({
      email: FELLBEHIND_CAPTURE_USER.email,
      password: FELLBEHIND_CAPTURE_USER.password,
      emailVerified: true,
      displayName: FELLBEHIND_CAPTURE_USER.displayName,
    });
    return created.uid;
  }
}

const ymd = (d: Date) => localDateString(d);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(9, 0, 0, 0);
  return d;
};
const daysAhead = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

async function run() {
  const uid = await ensureUser();
  const base = db.collection("users").doc(uid);

  // ── The REAL plan build, exactly as Onboarding calls it. ──
  const raceTargetDate = ymd(daysAhead(42)); // 6 weeks out — mid-block
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
    raceGoal: { distance: "marathon", targetDate: raceTargetDate },
    equipment: "full_gym",
    injuries: [],
    currentDate: localDateString(new Date()),
    preserveHistory: false,
  } as Parameters<typeof buildPlan>[0]);

  // ── Profile: cold-start base + the plan's own profileUpdates. ──
  await base.set(
    {
      uid,
      displayName: FELLBEHIND_CAPTURE_USER.displayName,
      email: FELLBEHIND_CAPTURE_USER.email,
      photoURL: null,
      athleteType: "Hybrid",
      weightKg: 72,
      heightCm: 168,
      age: 29,
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
      program: { goal: "recomp", startWeight: 72, currentPhase: "base" },
      targetCalories: 2100,
      targetProtein: 130,
      ...plan.profileUpdates,
    },
    { merge: true }
  );

  // ── programState: the built plan + the cron's fell-behind flag. ──
  const lastMonday = (() => {
    const d = new Date();
    const dow = (d.getDay() + 6) % 7; // 0 = Monday
    d.setDate(d.getDate() - dow - 7); // the PRIOR week's Monday
    return ymd(d);
  })();
  await base
    .collection("programState")
    .doc("current")
    .set({
      ...plan.programState,
      pendingFellBehindPrompt: {
        weekKey: lastMonday,
        completedRatio: 0,
        realRunCount: 0,
        weeklyTarget: 3,
      },
    });

  // ── Runs: a 32-day gap ending 3 days ago → `detrained` via the
  //    re-entry window (gap ≥ 21d, comeback within 21d). Both runs are
  //    volume-eligible so the layoff read sees them. ──
  const runFixtures = [
    { at: daysAgo(35), km: 8 },
    { at: daysAgo(3), km: 4 }, // the comeback run
  ];
  for (const [i, r] of runFixtures.entries()) {
    await base
      .collection("runs")
      .doc(`fellbehind-r${i}`)
      .set({
        date: ymd(r.at),
        distance: r.km * 1000,
        duration: r.km * 360,
        avgPace: 360,
        elevationGain: 12,
        calories: Math.round(r.km * 60),
        activityType: "freerun",
        completedAt: Timestamp.fromDate(r.at),
        createdAt: Timestamp.fromDate(r.at),
      });
  }

  console.log(
    `[seed-fellbehind] ready: ${FELLBEHIND_CAPTURE_USER.email} (uid ${uid})\n` +
      `  race ${raceTargetDate}, prompt week ${lastMonday}, ` +
      `runs ${runFixtures.map((r) => ymd(r.at)).join(" + ")} — ` +
      `weekKey anchor ${localWeekKey()}`
  );
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error("[seed-fellbehind] failed:", err);
    process.exit(1);
  }
);
