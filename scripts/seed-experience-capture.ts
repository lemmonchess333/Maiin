/**
 * Seed for the ExperienceSuggestionCard capture (design-review channel).
 *
 * The card renders NULL unless the experience classifier has evidence
 * (experienceDetection.ts: ≥2 main lifts, ≥6 valid records each spanning
 * ≥21 days, all stalled, stored level "beginner") — which is why it shipped
 * without screenshots: no ordinary seed ever renders it. This user is that
 * evidence, exactly the classifier's own test fixture made real: a beginner
 * whose bench and squat sat at 60 kg × 8 for six straight weekly sessions.
 *
 * Run against the emulator only (same guard as the sibling seeds):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     npm run seed:experience
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? "demo-tropos";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "[seed-experience] refusing to run without FIRESTORE_EMULATOR_HOST — this seed is emulator-only."
  );
  process.exit(1);
}

export const EXPERIENCE_CAPTURE_USER = {
  email: "experience-capture@tropos.test",
  password: "test-password-123",
  displayName: "Exp Capture",
};

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

async function ensureUser(): Promise<string> {
  try {
    const existing = await auth.getUserByEmail(EXPERIENCE_CAPTURE_USER.email);
    return existing.uid;
  } catch {
    const created = await auth.createUser({
      email: EXPERIENCE_CAPTURE_USER.email,
      password: EXPERIENCE_CAPTURE_USER.password,
      emailVerified: true,
      displayName: EXPERIENCE_CAPTURE_USER.displayName,
    });
    return created.uid;
  }
}

/** The v2 exhaustion shape ending recently — honest misses, a ~4% reset,
 *  a rebuild that only reached the old ceiling (the classifier's own
 *  fixture). Dates relative to today so the capture never goes stale. */
function stalledHistory(): Array<{
  date: string;
  weight: number;
  repsCompleted: number;
  repsTarget: number;
}> {
  const sessions = [
    { weight: 60, repsCompleted: 8 },
    { weight: 60, repsCompleted: 6 },
    { weight: 60, repsCompleted: 6 },
    { weight: 57.5, repsCompleted: 8 }, // the reset
    { weight: 60, repsCompleted: 8 },
    { weight: 60, repsCompleted: 7 },
  ];
  return sessions.map((sess, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (5 - idx) * 7);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { date, ...sess, repsTarget: 8 };
  });
}

function main(
  exerciseId: string,
  name: string,
  movementCategory: string,
  instanceId: string
) {
  return {
    name,
    exerciseId,
    instanceId,
    movementCategory,
    sets: 3,
    reps: 8,
    baseReps: 8,
    repRangeMax: 12,
    weight: 60,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: stalledHistory(),
    lastPerformance: null,
    isAccessory: false,
  };
}

async function run() {
  const uid = await ensureUser();

  await db
    .collection("users")
    .doc(uid)
    .set(
      {
        uid,
        displayName: EXPERIENCE_CAPTURE_USER.displayName,
        email: EXPERIENCE_CAPTURE_USER.email,
        photoURL: null,
        athleteType: "Lifter",
        weightKg: 80,
        heightCm: 180,
        weeklyWorkoutsTarget: 3,
        weeklyMealsTarget: 10,
        preferredWeightUnit: "kg",
        preferredHeightUnit: "cm",
        darkMode: false,
        onboardingComplete: true,
        subscriptionTier: "free",
        currentStreak: 6,
        longestStreak: 6,
        lastLogDate: null,
        adjustCaloriesForTraining: true,
        program: { goal: "recomp", startWeight: 80, currentPhase: "base" },
        targetCalories: 2400,
        targetProtein: 170,
        targetCarbs: 270,
        targetFat: 70,
        primaryGoal: "hypertrophy",
        // The stored level the evidence contradicts — the card's trigger.
        experience: "beginner",
        daysPerWeek: 3,
        equipment: "full_gym",
        runMode: "freeform",
      },
      { merge: true }
    );

  await db
    .collection("users")
    .doc(uid)
    .collection("programState")
    .doc("current")
    .set({
      goal: "recomp",
      primaryGoal: "hypertrophy",
      currentPhase: "progression",
      weekNumber: 7,
      splitType: "full_body",
      fatigueScore: 10,
      updatedAt: Date.now(),
      settings: { autoProgression: true, microloading: true },
      weekHistory: [],
      workouts: [
        {
          dayName: "Full Body — Squat Focus",
          dayType: "full_body",
          completed: false,
          exercises: [
            main("bench-press", "Bench Press", "horizontal_push", "cap-b1"),
            main("squat", "Squat", "knee_dominant", "cap-s1"),
          ],
        },
        {
          dayName: "Full Body — Deadlift Focus",
          dayType: "full_body",
          completed: false,
          exercises: [
            main("deadlift", "Deadlift", "hip_dominant", "cap-d1"),
            main("overhead-press", "Overhead Press", "vertical_push", "cap-o1"),
          ],
        },
      ],
    });

  console.log(
    `[seed-experience] ${uid}: beginner profile + 2-day programme; mains carry the v2 exhaustion shape (misses + survived reset).`
  );
}

run().then(
  () => process.exit(0),
  (e) => {
    console.error("[seed-experience] failed:", e);
    process.exit(1);
  }
);
