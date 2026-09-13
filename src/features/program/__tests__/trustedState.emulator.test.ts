// @vitest-environment jsdom
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { Firestore } from "firebase/firestore";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "../programTypes";

const h = vi.hoisted(() => ({
  user: { uid: `trusted-state-${Date.now()}` },
  profile: null as UserProfile | null,
  db: null as Firestore | null,
  refresh: vi.fn(async () => {}),
}));
vi.mock("@/lib/firebase", () => ({
  get db() {
    return h.db;
  },
  auth: { currentUser: h.user },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: h.user,
    profile: h.profile,
    refreshProfile: h.refresh,
    updateProfile: vi.fn(async () => ({ ok: true })),
  }),
}));
vi.mock("@/hooks/usePerformance", () => ({
  usePerformanceWeeks: () => ({ currentWeek: null }),
}));
vi.mock("../programCommandClient", () => ({
  sendProgramCommand: vi.fn(async () => {
    throw new Error("Unexpected command during load");
  }),
}));

// Actual Firestore SDK + checked-in rules, isolated to the local demo project.
const enabled = process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080";
describe.skipIf(!enabled)("trusted state with the Firestore emulator", () => {
  let useProgram: typeof import("../useProgram").useProgram;
  let adminDb: import("firebase-admin/firestore").Firestore;
  let adminApp: import("firebase-admin/app").App;
  let clientApp: import("firebase/app").FirebaseApp;
  let seed: ProgramState;
  let completedDate: string;
  beforeAll(async () => {
    const client = await import("firebase/app");
    const sdk = await import("firebase/firestore");
    clientApp = client.initializeApp(
      { projectId: "demo-tropos", apiKey: "emulator" },
      h.user.uid
    );
    h.db = sdk.initializeFirestore(clientApp, {
      experimentalForceLongPolling: true,
    });
    sdk.connectFirestoreEmulator(h.db, "127.0.0.1", 8080, {
      mockUserToken: { sub: h.user.uid },
    });
    const admin = await import("firebase-admin/app");
    adminApp = admin.initializeApp({ projectId: "demo-tropos" }, h.user.uid);
    adminDb = (await import("firebase-admin/firestore")).getFirestore(adminApp);
    useProgram = (await import("../useProgram")).useProgram;
    const { localDateString, localWeekKey, addLocalDays } =
      await import("@/lib/dateHelpers");
    const { generateSchedule } = await import("@/lib/scheduleUtils");
    const { generateRacePlanV2 } = await import("../runScheduler");
    const { normalizeProgramState, CURRENT_PROGRAM_SCHEMA_VERSION } =
      await import("../programTypes");
    const schedule = generateSchedule(3, 3);
    const today = localDateString();
    const week = localWeekKey();
    const raceGoal = {
      distance: "marathon" as const,
      targetDate: localDateString(addLocalDays(new Date(), 105)),
    };
    h.profile = {
      uid: h.user.uid,
      runMode: "race_prep",
      raceGoal,
      weekSchedule: schedule,
      weeklyWorkoutsTarget: 3,
      weeklyRunDaysTarget: 3,
      weekScheduleVersion: 1,
      program: { goal: "recomp", currentPhase: "base", startWeight: 80 },
      weightKg: 80,
    } as UserProfile;
    const fresh = generateRacePlanV2({
      raceGoal,
      weekSchedule: schedule,
      weeklyRunDays: 3,
      recentLayoff: "none",
      currentDate: today,
      weekStart: week,
    });
    const runDays = fresh.weeks[0];
    completedDate = runDays[0].date!;
    runDays[0] = {
      ...runDays[0],
      status: "completed_modified",
      completed: true,
    };
    runDays[runDays.length - 1] = {
      ...runDays.at(-1)!,
      templateId: "marathon_race",
      type: "race",
    };
    seed = normalizeProgramState({
      goal: "recomp",
      currentPhase: "base",
      weekNumber: 6,
      splitType: "ppl",
      workouts: [
        {
          dayName: "Push",
          dayType: "push",
          completed: true,
          completedWorkoutId: "prior-lift",
          exercises: [],
        },
      ],
      fatigueScore: 7,
      settings: { autoProgression: true, microloading: true },
      weekHistory: [],
      updatedAt: 1,
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      liftWeekKey: week,
      runDays,
      runPlan: {
        mode: "race_prep",
        raceGoal,
        currentWeek: 5,
        totalWeeks: 16,
        completedRaces: ["prior-race"],
      },
    } as ProgramState);
    await adminDb.doc(`users/${h.user.uid}`).set(h.profile);
    await adminDb.doc(`users/${h.user.uid}/programState/current`).set(seed);
  }, 30_000);
  afterEach(cleanup);
  afterAll(async () => {
    await (await import("firebase/firestore")).terminate(h.db!);
    await (await import("firebase/app")).deleteApp(clientApp);
    await adminDb.recursiveDelete(adminDb.doc(`users/${h.user.uid}`));
    await (await import("firebase-admin/app")).deleteApp(adminApp);
  });

  it("saves, retries and corrects a progression receipt with the real Firestore serializer", async () => {
    const { normalizeProgramState } = await import("../programTypes");
    const { commitWorkoutCompletion, workoutCompletionDayIdentity } =
      await import("@/lib/workoutCompletion");
    const { correctSavedWorkout } = await import("@/lib/workoutCorrection");
    const state = normalizeProgramState({
      ...seed,
      workouts: [
        {
          dayName: "Push",
          dayType: "upper",
          completed: false,
          exercises: [
            {
              instanceId: "bench-receipt",
              exerciseId: "bench",
              name: "Bench",
              sets: 3,
              reps: 8,
              weight: 100,
            },
          ],
        },
      ],
    } as unknown as ProgramState);
    const programRef = adminDb.doc(`users/${h.user.uid}/programState/current`);
    await programRef.set(state);
    const context = {
      weekNumber: state.weekNumber,
      dayIndex: 0,
      dayIdentity: workoutCompletionDayIdentity(state.workouts[0])!,
      progression: {
        completionId: "real-receipt",
        date: "2026-09-10",
        prescription: {
          exercises: state.workouts[0].exercises,
          progressionBaseline: state.workouts[0].exercises,
        },
        setLogs: [
          [0, 1, 2].map(() => ({ weight: 100, reps: 8, completed: true })),
        ],
      },
    };
    const data = {
      date: "2026-09-10",
      durationMinutes: 30,
      burnContext: { bodyweightKg: 80 },
      exercises: [
        {
          exerciseId: "bench",
          exerciseName: "Bench",
          category: "push",
          sets: [1, 2, 3].map((setNumber) => ({
            weightKg: 100,
            reps: 8,
            setNumber,
          })),
        },
      ],
    };
    await commitWorkoutCompletion(
      h.db!,
      h.user.uid,
      "real-receipt",
      data,
      context
    );
    await commitWorkoutCompletion(
      h.db!,
      h.user.uid,
      "real-receipt",
      data,
      context
    );
    const workoutRef = adminDb.doc(`users/${h.user.uid}/workouts/real-receipt`);
    expect(
      (await workoutRef.get()).data()?.programmeCompletion.context.progression
        .setLogs[0].sets
    ).toHaveLength(3);
    expect(
      (await programRef.get()).data()?.workouts[0].exercises[0]
        .performanceHistory
    ).toHaveLength(1);
    await correctSavedWorkout(
      h.db!,
      h.user.uid,
      "real-receipt",
      0,
      "correct-receipt",
      {
        durationMinutes: 30,
        exercises: [
          { sets: [1, 2, 3].map(() => ({ weightKg: 100, reps: 6 })) },
        ],
      }
    );
    expect((await workoutRef.get()).data()?.revision).toBe(1);
    expect(
      (await programRef.get()).data()?.workouts[0].exercises[0]
        .consecutiveFailures
    ).toBe(1);
    expect(
      (await programRef.get()).data()?.workouts[0].exercises[0]
        .performanceHistory
    ).toHaveLength(1);
    // Restore the saved-race fixture for the independent reconciliation test.
    await programRef.set(seed);
    await adminDb.doc(`users/${h.user.uid}/stats/prMap`).delete();
  }, 30_000);

  it("repairs a saved race in a base week without resetting progress or completions", async () => {
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 20_000,
    });
    const saved = (
      await adminDb.doc(`users/${h.user.uid}/programState/current`).get()
    ).data() as ProgramState;
    expect(
      saved.runDays!.some((day) => day.templateId === "marathon_race")
    ).toBe(false);
    expect(
      saved.runDays!.find((day) => day.date === completedDate)?.status
    ).toBe("completed_modified");
    expect(saved.runPlan).toMatchObject({
      currentWeek: 5,
      totalWeeks: 16,
      completedRaces: ["prior-race"],
    });
    expect(saved.weekNumber).toBe(6);
    expect(saved.workouts).toEqual(seed.workouts);
    expect(saved.weekHistory).toEqual([]);
    // Reopening must converge: no repeated reset or fresh progression.
    await act(async () => {
      await result.current.refreshRunSchedule();
    });
    expect(result.current.programState?.runPlan?.currentWeek).toBe(5);
  }, 30_000);

  it("corrects a saved workout under the real owner rules without touching a server-owned feed post", async () => {
    const { correctSavedWorkout } = await import("@/lib/workoutCorrection");
    const ref = adminDb.doc(`users/${h.user.uid}/workouts/correction`);
    await ref.set({
      date: "2026-09-10",
      durationMinutes: 40,
      totalCalories: 240,
      sharedActivityId: "nonexistent-feed-post",
      burnContext: { bodyweightKg: 80 },
      exercises: [
        {
          exerciseId: "bench",
          exerciseName: "Bench",
          category: "push",
          sets: [
            {
              weightKg: 100,
              reps: 8,
              plannedWeightKg: 100,
              plannedReps: 8,
              setNumber: 1,
            },
          ],
        },
      ],
    });
    const edits = {
      durationMinutes: 30,
      exercises: [{ sets: [{ weightKg: 60, reps: 6 }] }],
    };
    await correctSavedWorkout(
      h.db!,
      h.user.uid,
      "correction",
      0,
      "same-edit",
      edits
    );
    await correctSavedWorkout(
      h.db!,
      h.user.uid,
      "correction",
      0,
      "same-edit",
      edits
    );
    expect((await ref.get()).data()).toMatchObject({
      revision: 1,
      totalVolume: 360,
      durationMinutes: 30,
      exercises: [
        {
          sets: [
            { weightKg: 60, reps: 6, plannedWeightKg: 100, plannedReps: 8 },
          ],
        },
      ],
    });
    expect(
      (await adminDb.doc(`users/${h.user.uid}/stats/prMap`).get()).data()
    ).toMatchObject({ invalidated: true, revision: 1 });
    await expect(
      correctSavedWorkout(
        h.db!,
        h.user.uid,
        "correction",
        0,
        "stale-edit",
        edits
      )
    ).rejects.toThrow("changed elsewhere");
  }, 30_000);
});
