/**
 * Integration: the PI scorer is fed the user's REAL nutrition phase.
 *
 * `performanceEngineParity.cross.test.ts` already pins the two copies of the
 * scorer against each other, and its header records why it exists: "the
 * server copy silently lagged the client's goal-awareness — all four goal
 * branches … were goal-blind server-side, recomputing every cut/bulk user's
 * stored PI wrong. … Drift fails CI."
 *
 * The same defect then re-entered one level up, where that test cannot see
 * it. `functions/performanceEngine.js` passed `goal: profile.goal` — a
 * TOP-LEVEL field on the user document that nothing has ever written.
 * Onboarding writes `program: { goal }`; `buildGoalWeightPersistPayload`
 * writes `program: { goal }`; `GoalReachedSheet` writes the program mirror.
 * `getNutritionPhase` exists in `src/lib` precisely to be the single reader
 * of that location, and the server had no equivalent.
 *
 * So the goal argument was `undefined` for every user, always, and all five
 * goal-dependent behaviours fell to their unknown branch — on the ONLY copy
 * that runs in production (`computePerformanceIndex` has no client callers;
 * the client reads the persisted document).
 *
 * The parity test cannot catch this by construction: it builds a profile
 * object and hands the SAME one to both copies, so it pins the seam and says
 * nothing about what the call site puts into it. This test drives the real
 * `computeAndWritePerformanceForUser` against real documents instead, which
 * is the only way the wiring is on the hook. Reachability over prose
 * (ADR-0008).
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let admin;
let db;
let engine;
let dateKeyMinusN;

const UID = "u-pi-goal-wiring";
const COMPUTE_KEY = "2026-08-10";

/* Chosen so ONLY the calorie factor separates the two goals.
 *
 * `computeAdherenceScore` averages up to three factors. Protein is omitted
 * from the profile so its factor never counts; `weeklyWorkoutsTarget` is set
 * EXPLICITLY (rather than left to default) because the default is itself
 * goal-dependent — `cut ? 3 : lean bulk ? 5 : 4` — which would move the
 * workout factor too and blur what the assertion is measuring.
 *
 * 2240 / 2000 = 1.12. Outside a cut's ±10%, inside everything else's ±15%.
 *   cut:    (0 + (100 - 0.12*200)) / 2 = (0 + 76) / 2 = 38
 *   recomp: (0 + 100)            / 2 =              50
 */
const TARGET_CALORIES = 2000;
const DAILY_CALORIES = 2240;

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  // index.js owns initializeApp — performanceEngine.js only consumes the
  // already-initialised default app, so requiring it alone throws.
  require("../../index");
  engine = require("../../performanceEngine");
  dateKeyMinusN = engine._internal.dateKeyMinusN;
  admin = require("firebase-admin");
  db = admin.firestore();
});

async function wipe() {
  for (const sub of ["meals", "workouts", "runs", "performance", "locks"]) {
    const docs = await db
      .collection("users")
      .doc(UID)
      .collection(sub)
      .listDocuments();
    for (const d of docs) await d.delete().catch(() => {});
  }
  await db.collection("users").doc(UID).delete().catch(() => {});
}

/** Four logged days inside the rolling window (the factor needs >= 3). */
async function seedMeals() {
  for (let i = 0; i < 4; i++) {
    const date = dateKeyMinusN(COMPUTE_KEY, i);
    await db
      .collection("users")
      .doc(UID)
      .collection("meals")
      .doc(`m-${i}`)
      .set({ date, totalCalories: DAILY_CALORIES });
  }
}

async function seedProfile(programGoal) {
  await db
    .collection("users")
    .doc(UID)
    .set({
      targetCalories: TARGET_CALORIES,
      weeklyWorkoutsTarget: 4,
      // Deliberately NO top-level `goal`. That is the field the call site
      // used to read, and writing one here would let this test pass against
      // the old wiring.
      ...(programGoal ? { program: { goal: programGoal } } : {}),
    });
}

async function adherence() {
  const snap = await db
    .collection("users")
    .doc(UID)
    .collection("performance")
    .doc(COMPUTE_KEY)
    .get();
  return snap.exists ? snap.data().adherenceScore : null;
}

suite("PI scoring reads the user's real nutrition phase", () => {
  beforeEach(async () => {
    await wipe();
    await seedMeals();
  });

  it("scores a cut against the tighter calorie tolerance", async () => {
    await seedProfile("cut");
    await engine.computeAndWritePerformanceForUser(UID, COMPUTE_KEY);

    // Pre-fix this was 50: the goal never reached the scorer, so a cutter
    // 12% over target was scored as if they were inside tolerance.
    expect(await adherence()).toBe(38);
  });

  it("scores a recomp against the wider one", async () => {
    // The paired positive. Without it the assertion above would pass just as
    // happily against a scorer that had become goal-blind in the other
    // direction, or against a hard-coded 38.
    await seedProfile("recomp");
    await engine.computeAndWritePerformanceForUser(UID, COMPUTE_KEY);

    expect(await adherence()).toBe(50);
  });

  it("treats a user with no program goal exactly as it always did", async () => {
    // The compatibility claim, made explicit. `getNutritionPhase` defaults to
    // "recomp", and every goal branch in the scorer tests for "cut" or
    // "lean bulk" explicitly — so the fix moves NOBODY except the cut and
    // lean-bulk users it was mis-scoring. If that ever stops being true this
    // fails rather than silently re-scoring the whole user base.
    await seedProfile(null);
    await engine.computeAndWritePerformanceForUser(UID, COMPUTE_KEY);

    expect(await adherence()).toBe(50);
  });

  it("ignores a stray top-level goal field", async () => {
    // Belt and braces on the direction of the fix: a document that somehow
    // carries the vestigial top-level field must not be able to override the
    // real phase, or the old wiring survives as a back door.
    await db
      .collection("users")
      .doc(UID)
      .set({
        targetCalories: TARGET_CALORIES,
        weeklyWorkoutsTarget: 4,
        goal: "cut",
        program: { goal: "recomp" },
      });
    await engine.computeAndWritePerformanceForUser(UID, COMPUTE_KEY);

    expect(await adherence()).toBe(50);
  });
});
