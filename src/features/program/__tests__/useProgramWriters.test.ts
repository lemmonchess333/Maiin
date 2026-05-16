/**
 * PR-0b-ii: integration tests for useProgram's writer paths.
 *
 * Pins the V1→V2 swap end-to-end. Mocks the Firestore surface so
 * we can inspect what useProgram tries to save without booting a
 * real Firebase project, then renders the hook and triggers
 * different writer paths.
 *
 * What each test asserts:
 *   - initial no-doc creation writes `programSchemaVersion` and
 *     V2-shaped runDays (id/date/weekKey/status)
 *   - 6 lift + 2 run schedule produces 2 scheduled runs (the V1
 *     hybrid bug — V1 lost the Both-day's run exposure)
 *   - structured + race-prep refresh both write V2 runDays
 *   - compressed race plans propagate the compressed flag
 *   - regenerate writes programSchemaVersion
 *
 * The editor's stale-schedule fix is covered in
 * `useProgrammeScheduleEditor.test.ts` (PR-0b-ii block).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- firebase mock surface needs any casts */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { generateSchedule } from "@/lib/scheduleUtils";
import { CURRENT_PROGRAM_SCHEMA_VERSION } from "../programTypes";
import type { ProgramState, ScheduledRunDay } from "../programTypes";

// ─── Firebase mocks ──────────────────────────────────────────────────

// Storage we control across tests.
let mockDocData: ProgramState | null = null;
let mockDocExists = false;
const setDocCalls: { ref: unknown; data: any; opts?: any }[] = [];

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({ __ref: true })),
  getDoc: vi.fn(async () => ({
    exists: () => mockDocExists,
    data: () => mockDocData,
  })),
  setDoc: vi.fn(async (ref: unknown, data: any, opts?: any) => {
    setDocCalls.push({ ref, data, opts });
    // Mirror the write back into our mock store so subsequent
    // reads see what was just written. saveProgram inside
    // useProgram doesn't re-read, but readback is useful for
    // assertions on the final stored doc.
    mockDocData = { ...(mockDocData ?? ({} as ProgramState)), ...data };
    mockDocExists = true;
  }),
  Timestamp: { fromDate: vi.fn((d: Date) => ({ seconds: d.getTime() / 1000 })) },
}));

vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));

// ─── useAuth + adjacent mocks ────────────────────────────────────────

type MockProfile = {
  uid?: string;
  weekSchedule?: { day: number; type: string }[];
  weekScheduleVersion?: number;
  weeklyWorkoutsTarget?: number;
  weeklyRunDaysTarget?: number;
  weeklyRunsTarget?: number;
  runMode?: "freeform" | "structured" | "race_prep";
  raceGoal?: { distance: "5k" | "10k" | "half" | "marathon"; targetDate: string };
  primaryGoal?: string;
  program?: { goal?: string };
};

let mockProfile: MockProfile | null = null;
const mockUpdateProfile = vi.fn(async (patch: Partial<MockProfile>) => {
  mockProfile = { ...mockProfile, ...patch } as MockProfile;
  return { ok: true };
});

// Hoist `user` to a stable reference — returning a new object
// literal every call would churn useProgram's useEffect deps and
// produce an infinite re-render loop in tests.
const stableUser = { uid: "test-user-1" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: stableUser,
    profile: mockProfile,
    updateProfile: mockUpdateProfile,
  }),
}));

// Stub everything else useProgram imports but doesn't matter for
// PR-0b-ii's writer assertions.
vi.mock("@/lib/socialApi", () => ({ postActivity: vi.fn() }));
vi.mock("@/lib/shareComposer", () => ({
  compose: vi.fn(),
  enqueueShare: vi.fn(),
  showQueuedToast: vi.fn(),
}));
vi.mock("@/lib/workoutBurn", () => ({ estimateLiftBurn: vi.fn(() => 0) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("date-fns", () => ({ format: vi.fn(() => "2026-05-12") }));

// ─── Test fixtures ───────────────────────────────────────────────────

function structuredProfile(overrides: Partial<MockProfile> = {}): MockProfile {
  return {
    uid: "test-user-1",
    weekSchedule: generateSchedule(6, 2), // hybrid — includes a Both day
    weekScheduleVersion: 1,
    weeklyWorkoutsTarget: 6,
    weeklyRunDaysTarget: 2,
    runMode: "structured",
    primaryGoal: "hypertrophy",
    program: { goal: "recomp" },
    ...overrides,
  };
}

function raceProfile(targetDate: string, overrides: Partial<MockProfile> = {}): MockProfile {
  return {
    ...structuredProfile(overrides),
    runMode: "race_prep",
    raceGoal: { distance: "10k", targetDate },
    ...overrides,
  };
}

// V2 runDays carry id / date / weekKey / status. Assert all four
// in one helper.
function expectV2Shape(rd: ScheduledRunDay) {
  expect(rd.id).toBeTruthy();
  expect(rd.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(rd.weekKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(rd.status).toBeTruthy();
}

// ─── Tests ───────────────────────────────────────────────────────────

// Vitest hoists vi.mock() above any imports, so a top-level
// import here resolves to the mocked dependencies. We deliberately
// import last so the read order is "mocks → consumers".
import { useProgram } from "../useProgram";

beforeEach(() => {
  setDocCalls.length = 0;
  mockDocData = null;
  mockDocExists = false;
  mockProfile = null;
  mockUpdateProfile.mockClear();
});

describe("PR-0b-ii — useProgram writers swap V1 → V2", () => {
  it("initial no-doc creation writes programSchemaVersion + V2-shape runDays (structured, 6+2 hybrid)", async () => {
    mockProfile = structuredProfile();
    mockDocExists = false; // no existing programState doc

    const { result } = renderHook(() => useProgram());

    // Wait for the load effect to complete and write the initial doc.
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 });

    // The most recent setDoc call carries the initial ProgramState.
    expect(setDocCalls.length).toBeGreaterThan(0);
    const lastWrite = setDocCalls[setDocCalls.length - 1].data as ProgramState;

    // Schema version pinned (PR-0b-ii explicit set).
    expect(lastWrite.programSchemaVersion).toBe(CURRENT_PROGRAM_SCHEMA_VERSION);

    // V1 hybrid bug fix: 6+2 produces 2 runDays (including one
    // on the Both day). V1 would have produced 1.
    expect(lastWrite.runDays).toBeDefined();
    expect(lastWrite.runDays!.length).toBe(2);

    // All runDays are V2-shaped.
    lastWrite.runDays!.forEach(expectV2Shape);
  });

  it("race-prep initial creation writes compressed flag on runPlan", async () => {
    // 3 weeks until race + 10K (minWeeks=6) → compressed.
    const threeWeeksOut = new Date();
    threeWeeksOut.setDate(threeWeeksOut.getDate() + 21);
    const targetDate = threeWeeksOut.toISOString().split("T")[0];
    mockProfile = raceProfile(targetDate);
    mockDocExists = false;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 });

    const lastWrite = setDocCalls[setDocCalls.length - 1].data as ProgramState;
    expect(lastWrite.runPlan).toBeDefined();
    expect(lastWrite.runPlan!.mode).toBe("race_prep");
    expect(lastWrite.runPlan!.compressed).toBe(true);
  });

  it("race-prep refresh writes V2-shaped runDays + preserves compressed flag", async () => {
    // Set up an existing race-prep doc, then call refreshRunSchedule.
    const threeWeeksOut = new Date();
    threeWeeksOut.setDate(threeWeeksOut.getDate() + 21);
    const targetDate = threeWeeksOut.toISOString().split("T")[0];
    mockProfile = raceProfile(targetDate);
    mockDocData = {
      goal: "recomp",
      currentPhase: "base",
      weekNumber: 1,
      splitType: "ppl",
      workouts: [],
      fatigueScore: 0,
      updatedAt: Date.now(),
      settings: { autoProgression: true, microloading: true },
      weekHistory: [],
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      runDays: [], // empty so refresh writes
      runPlan: { mode: "race_prep", raceGoal: mockProfile.raceGoal, totalWeeks: 6, currentWeek: 2 },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 });
    setDocCalls.length = 0; // reset to capture only the refresh write

    await act(async () => {
      await result.current.refreshRunSchedule();
    });

    expect(setDocCalls.length).toBeGreaterThan(0);
    const lastWrite = setDocCalls[setDocCalls.length - 1].data as ProgramState;
    expect(lastWrite.runDays).toBeDefined();
    expect(lastWrite.runDays!.length).toBeGreaterThan(0);
    lastWrite.runDays!.forEach(expectV2Shape);
    // Compressed flag survives the refresh (V2 always re-derives;
    // a 3-weeks-out 10K stays compressed).
    expect(lastWrite.runPlan!.compressed).toBe(true);
  });

  it("structured refresh writes V2-shaped runDays", async () => {
    mockProfile = structuredProfile();
    mockDocData = {
      goal: "recomp",
      currentPhase: "base",
      weekNumber: 1,
      splitType: "ppl",
      workouts: [],
      fatigueScore: 0,
      updatedAt: Date.now(),
      settings: { autoProgression: true, microloading: true },
      weekHistory: [],
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      runDays: [],
      runPlan: { mode: "structured" },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 });
    setDocCalls.length = 0;

    await act(async () => {
      await result.current.refreshRunSchedule();
    });

    const lastWrite = setDocCalls[setDocCalls.length - 1].data as ProgramState;
    expect(lastWrite.runDays!.length).toBeGreaterThan(0);
    lastWrite.runDays!.forEach(expectV2Shape);
  });

  it("refreshRunSchedule accepts explicit weekSchedule override (not stale closure)", async () => {
    // Set profile.weekSchedule to all-rest; override with hybrid
    // 6+2; assert the override is what gets used.
    const staleSchedule = [
      { day: 0, type: "rest" }, { day: 1, type: "rest" }, { day: 2, type: "rest" },
      { day: 3, type: "rest" }, { day: 4, type: "rest" }, { day: 5, type: "rest" },
      { day: 6, type: "rest" },
    ];
    mockProfile = structuredProfile({ weekSchedule: staleSchedule });
    mockDocData = {
      goal: "recomp",
      currentPhase: "base",
      weekNumber: 1,
      splitType: "ppl",
      workouts: [],
      fatigueScore: 0,
      updatedAt: Date.now(),
      settings: { autoProgression: true, microloading: true },
      weekHistory: [],
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      runDays: [],
      runPlan: { mode: "structured" },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 });
    setDocCalls.length = 0;

    const overrideSchedule = generateSchedule(6, 2);
    await act(async () => {
      await result.current.refreshRunSchedule({
        weekSchedule: overrideSchedule,
        weeklyRunDaysTarget: 2,
      });
    });

    const lastWrite = setDocCalls[setDocCalls.length - 1].data as ProgramState;
    // Override won → 2 runDays (one on Both). Stale profile.weekSchedule
    // (all rest) would have produced 0.
    expect(lastWrite.runDays!.length).toBe(2);
  });

  it("regenerateProgram writes programSchemaVersion + V2-shape runDays", async () => {
    mockProfile = structuredProfile();
    mockDocData = {
      goal: "recomp",
      currentPhase: "base",
      weekNumber: 5,
      splitType: "ppl",
      workouts: [],
      fatigueScore: 0,
      updatedAt: Date.now(),
      settings: { autoProgression: true, microloading: true },
      weekHistory: [],
      // Deliberately omit programSchemaVersion to test the
      // explicit write on regenerate.
      runDays: [],
      runPlan: { mode: "structured" },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 });
    setDocCalls.length = 0;

    await act(async () => {
      await result.current.regenerateProgram();
    });

    const lastWrite = setDocCalls[setDocCalls.length - 1].data as ProgramState;
    expect(lastWrite.programSchemaVersion).toBe(CURRENT_PROGRAM_SCHEMA_VERSION);
    expect(lastWrite.runDays).toBeDefined();
    lastWrite.runDays!.forEach(expectV2Shape);
  });
});

// ─── PR-0b-iii — writers respect status-aware gates ──────────────────

describe("PR-0b-iii — legacy completed:true is not treated as planned", () => {
  // Pre-PR-0b-iii, completeRunDay/skipRunDay read
  // `targetDay.status ?? "planned"` — which silently treated a
  // legacy `completed: true` + `status: undefined` doc as planned,
  // letting the transitionStatus gate accept planned → completed_exact
  // (or planned → skipped) on top of an already-done slot. With
  // getScheduledRunStatus the resolution is "completed_exact" so
  // the transitionStatus check refuses (terminal → anything is illegal).

  function legacyCompletedRunDay() {
    // Legacy shape: only `completed: true`, no v2 status field.
    // PR-0b-i migration would normally repair this on read, but
    // the helper is the defensive line for any caller that hasn't
    // been through migration. We construct the legacy shape
    // directly in the programState to bypass migration and verify
    // the writer-side gate.
    return {
      dayIndex: 2,
      templateId: "easy_30",
      type: "easy",
      completed: true,
      // intentionally no `status` field
    } as ScheduledRunDay;
  }

  it("completeRunDay refuses to re-complete a legacy completed:true doc", async () => {
    mockProfile = structuredProfile();
    mockDocData = {
      goal: "recomp",
      currentPhase: "base",
      weekNumber: 1,
      splitType: "ppl",
      workouts: [],
      fatigueScore: 0,
      updatedAt: Date.now(),
      settings: { autoProgression: true, microloading: true },
      weekHistory: [],
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      runDays: [legacyCompletedRunDay()],
      runPlan: { mode: "structured" },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 });
    // PR-0b-i's migration MAY have already aligned status on load
    // (writing back to Firestore). Reset the call log so we
    // capture only the post-load completeRunDay attempt.
    setDocCalls.length = 0;

    await act(async () => {
      await result.current.completeRunDay(2); // by dayIndex
    });

    // Helper resolves the legacy doc to "completed_exact".
    // transitionStatus(completed_exact, completed_exact) is
    // illegal → completeRunDay logs + skips → zero writes.
    expect(setDocCalls.length).toBe(0);
  });

  it("skipRunDay refuses to skip a legacy completed:true doc", async () => {
    mockProfile = structuredProfile();
    mockDocData = {
      goal: "recomp",
      currentPhase: "base",
      weekNumber: 1,
      splitType: "ppl",
      workouts: [],
      fatigueScore: 0,
      updatedAt: Date.now(),
      settings: { autoProgression: true, microloading: true },
      weekHistory: [],
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      runDays: [legacyCompletedRunDay()],
      runPlan: { mode: "structured" },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 });
    setDocCalls.length = 0;

    await act(async () => {
      await result.current.skipRunDay(2);
    });

    // transitionStatus(completed_exact, skipped) is illegal —
    // completed_* is terminal. Zero writes.
    expect(setDocCalls.length).toBe(0);
  });
});
