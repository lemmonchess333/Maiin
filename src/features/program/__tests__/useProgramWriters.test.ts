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
import { localWeekKey, localDateString, addLocalDays } from "@/lib/dateHelpers";
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
  Timestamp: {
    fromDate: vi.fn((d: Date) => ({ seconds: d.getTime() / 1000 })),
  },
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
  raceGoal?: {
    distance: "5k" | "10k" | "half" | "marathon";
    targetDate: string;
  };
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
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
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

function raceProfile(
  targetDate: string,
  overrides: Partial<MockProfile> = {}
): MockProfile {
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
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });

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
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });

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
      runPlan: {
        mode: "race_prep",
        raceGoal: mockProfile.raceGoal,
        totalWeeks: 6,
        currentWeek: 2,
      },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
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
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
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
      { day: 0, type: "rest" },
      { day: 1, type: "rest" },
      { day: 2, type: "rest" },
      { day: 3, type: "rest" },
      { day: 4, type: "rest" },
      { day: 5, type: "rest" },
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
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
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
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
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

  // PR-J Q2 chunk B2: completeRunDay deleted. The legacy
  // re-completion path it guarded no longer exists — manual mark
  // (markManualComplete) writes to manualCompletions, not to the
  // runDay's status, so legacy completed_* + manual is just an OR
  // in the derivation (Q1 P27). This describe block's other tests
  // (skipRunDay refusal) survive unchanged.

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
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    setDocCalls.length = 0;

    await act(async () => {
      await result.current.skipRunDay(2);
    });

    // transitionStatus(completed_exact, skipped) is illegal —
    // completed_* is terminal. Zero writes.
    expect(setDocCalls.length).toBe(0);
  });
});

// ─── PR-1 — overrideRunDay id-preferring overload ───────────────────

describe("PR-1 — overrideRunDay accepts string id and number dayIndex", () => {
  // Pre-PR-1, overrideRunDay only took `dayIndex: number`. V2 docs
  // have stable IDs, and multi-week runDays arrays can share a
  // dayIndex across weeks — so a callable that addresses runDays
  // by id is essential before Week is retired (DayActionSheet
  // dispatches via id). The number overload stays for legacy
  // callers (per-day Run-tab select, Week-tab template <select>).

  function plannedRunDay(dayIndex: number, id: string): ScheduledRunDay {
    // Use TODAY's week so the auto-rollover effect (useProgram.ts:440)
    // doesn't fire and regenerate runDays with fresh IDs — which would
    // wipe the hard-coded `id` this test relies on for the
    // overrideRunDay lookup. Hard-coded dates like "2026-05-18" /
    // "2026-05-17" were stable when written but go stale as the
    // calendar advances; the rollover then runs as a silent
    // side-effect and the test sees zero setDoc calls. Anchor to
    // today instead.
    const todayWeekKey = localWeekKey();
    const todayDate = localDateString(addLocalDays(new Date(), 0));
    return {
      id,
      dayIndex,
      templateId: "easy_30",
      type: "easy",
      completed: false,
      status: "planned",
      // Date + weekKey present (PR-0b-i shape) so migration on
      // load doesn't touch the row.
      date: todayDate,
      weekKey: todayWeekKey,
    } as ScheduledRunDay;
  }

  it("called with a string id updates the matching runDay", async () => {
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
      runDays: [
        plannedRunDay(1, "runday_target_id"),
        plannedRunDay(3, "runday_other_id"),
      ],
      runPlan: { mode: "structured" },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    setDocCalls.length = 0;

    await act(async () => {
      await result.current.overrideRunDay("runday_target_id", "tempo_20");
    });

    expect(setDocCalls.length).toBe(1);
    const written = setDocCalls[0].data as ProgramState;
    const updated = written.runDays!.find((rd) => rd.id === "runday_target_id");
    const untouched = written.runDays!.find(
      (rd) => rd.id === "runday_other_id"
    );
    expect(updated!.templateId).toBe("tempo_20");
    expect(updated!.userOverride).toBe("tempo_20");
    // The other row stays on easy_30 — id lookup did not splash
    // across dayIndex matches.
    expect(untouched!.templateId).toBe("easy_30");
    expect(untouched!.userOverride).toBeUndefined();
  });

  it("called with a number dayIndex updates the matching runDay (legacy fallback)", async () => {
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
      runDays: [plannedRunDay(1, "runday_a"), plannedRunDay(3, "runday_b")],
      runPlan: { mode: "structured" },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    setDocCalls.length = 0;

    await act(async () => {
      await result.current.overrideRunDay(3, "tempo_20");
    });

    expect(setDocCalls.length).toBe(1);
    const written = setDocCalls[0].data as ProgramState;
    const updated = written.runDays!.find((rd) => rd.dayIndex === 3);
    expect(updated!.templateId).toBe("tempo_20");
    expect(updated!.userOverride).toBe("tempo_20");
  });

  it("refuses to override a non-editable runDay (terminal status)", async () => {
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
      runDays: [
        {
          ...plannedRunDay(1, "runday_skipped"),
          status: "skipped",
        },
      ],
      runPlan: { mode: "structured" },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    setDocCalls.length = 0;

    await act(async () => {
      await result.current.overrideRunDay("runday_skipped", "tempo_20");
    });

    // Editable gate refuses. Zero writes.
    expect(setDocCalls.length).toBe(0);
  });
});

// ─── PR-B regression — refreshRunSchedule REPLACES runDays, never patches ───

describe("PR-B — refreshRunSchedule replaces runDays on race_prep → structured", () => {
  // The inline mode picker (restored in PR-B) sequences
  // `updateProfile({ runMode: "structured" })` then
  // `refreshRunSchedule(...)`. Phase B QA flagged a concern: if
  // refreshRunSchedule were to MERGE the freshly-generated structured
  // runDays into the pre-existing race-shape array (rather than
  // replace), race-period templates would leak into structured mode
  // — the "leftover race entries in structured runDays" failure
  // mode in Test 4 of the device-QA brief.
  //
  // Structural pre-verification (read-only) showed:
  //   - scheduleStructuredWeekV2 builds a fresh array from scratch
  //   - refreshRunSchedule line 999: `saveProgram({ ...programState,
  //     runDays, runPlan })` — runDays is a top-level overwrite,
  //     not a merge
  //
  // This test locks that behaviour as a regression gate so a future
  // change to `saveProgram` or `refreshRunSchedule` that
  // accidentally introduces a merge-instead-of-replace pattern
  // fails CI before reaching device QA.

  const STRUCTURED_TEMPLATE_IDS = new Set([
    "long_10k",
    "tempo_20",
    "5x1k",
    "8x400",
    "easy_30",
  ]);
  const RACE_TEMPLATE_IDS = new Set([
    "5k_race",
    "10k_race",
    "half_race",
    "marathon_race",
  ]);

  it("structured-mode refresh emits zero race-period templates even when previous runDays were race-shaped", async () => {
    // Profile is already structured (matches the composing handler's
    // sequence: updateProfile → refreshRunSchedule, with the
    // refreshRunSchedule call running against the post-update profile).
    mockProfile = structuredProfile({
      weeklyRunDaysTarget: 3,
      // raceGoal preserved per R1 GATED — present on profile, but
      // refreshRunSchedule's race-branch only fires when runMode is
      // race_prep, so this should be a no-op input here.
      raceGoal: { distance: "10k", targetDate: "2027-09-15" },
    });

    // programState carries the previous race-period runDays. These
    // are the "leftover entries" the QA brief is worried about. They
    // include race-day template IDs (10k_race) plus marker IDs that
    // could not be produced by scheduleStructuredWeekV2 — so if any
    // of them survive into the post-refresh runDays, we know merge
    // happened.
    const racePeriodRunDays: ScheduledRunDay[] = [
      {
        id: "LEGACY_RACE_DAY_long_marker",
        dayIndex: 0,
        date: "2026-05-17",
        weekKey: "2026-05-17",
        templateId: "long_10k", // valid structured ID too — covers the merge-key collision case
        type: "long",
        status: "planned",
      } as ScheduledRunDay,
      {
        id: "LEGACY_RACE_DAY_race_marker",
        dayIndex: 6,
        date: "2026-05-23",
        weekKey: "2026-05-17",
        templateId: "10k_race", // distinctive race-only template
        type: "race",
        status: "planned",
      } as ScheduledRunDay,
    ];

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
      runDays: racePeriodRunDays,
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate: "2027-09-15" },
        currentWeek: 0,
        totalWeeks: 12,
        compressed: false,
      },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    setDocCalls.length = 0;

    await act(async () => {
      await result.current.refreshRunSchedule({
        weekSchedule: generateSchedule(6, 3),
        weeklyRunDaysTarget: 3,
      });
    });

    expect(setDocCalls.length).toBeGreaterThan(0);
    const lastWrite = setDocCalls[setDocCalls.length - 1].data as ProgramState;
    const writtenRunDays = lastWrite.runDays ?? [];

    // Replace, not merge: the legacy marker IDs MUST NOT survive.
    const markerIdsFound = writtenRunDays.filter((rd) =>
      rd.id?.startsWith("LEGACY_RACE_DAY_")
    );
    expect(markerIdsFound).toHaveLength(0);

    // Every written runDay's templateId is in the structured pool.
    // If a `10k_race` template leaks through, this catches it.
    writtenRunDays.forEach((rd) => {
      expect(STRUCTURED_TEMPLATE_IDS.has(rd.templateId)).toBe(true);
      expect(RACE_TEMPLATE_IDS.has(rd.templateId)).toBe(false);
    });

    // runPlan also resets to structured shape (not race_prep).
    expect(lastWrite.runPlan?.mode).toBe("structured");
  });

  it("race_prep refresh from a structured-shape runDays array also replaces (inverse direction)", async () => {
    // The reverse case — restoring race_prep from a structured
    // baseline. Same replace-not-merge contract; if we ever
    // regress to merging, structured easy_30 entries would leak
    // into race-period weeks.
    mockProfile = raceProfile("2027-09-15", { weeklyRunDaysTarget: 3 });

    const structuredPeriodRunDays: ScheduledRunDay[] = [
      {
        id: "LEGACY_STRUCTURED_easy_marker",
        dayIndex: 2,
        date: "2026-05-19",
        weekKey: "2026-05-17",
        templateId: "easy_30",
        type: "easy",
        status: "planned",
      } as ScheduledRunDay,
    ];

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
      runDays: structuredPeriodRunDays,
      runPlan: { mode: "structured" },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    setDocCalls.length = 0;

    await act(async () => {
      await result.current.refreshRunSchedule({
        weekSchedule: generateSchedule(6, 3),
        weeklyRunDaysTarget: 3,
      });
    });

    const lastWrite = setDocCalls[setDocCalls.length - 1].data as ProgramState;
    const writtenRunDays = lastWrite.runDays ?? [];

    // Marker ID must not survive.
    expect(
      writtenRunDays.some((rd) => rd.id?.startsWith("LEGACY_STRUCTURED_"))
    ).toBe(false);
    // runPlan flipped to race_prep with a goal.
    expect(lastWrite.runPlan?.mode).toBe("race_prep");
    expect(lastWrite.runPlan?.raceGoal?.distance).toBe("10k");
  });
});

// ─── PR-D — race-day auto-transition effect ─────────────────────────

describe("PR-D — auto-transition writes race_no_show after grace period", () => {
  // The load effect in useProgram walks `runDays` for an entry
  // matching `date === raceGoal.targetDate`. If the entry is still
  // `planned` more than 3 days past the race date, it transitions
  // to `race_no_show`. Idempotent — once status is non-planned,
  // the effect skips.

  function pastDateOffset(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  it("transitions planned race-day runDay to race_no_show once 3-day grace expires", async () => {
    const raceDate = pastDateOffset(5); // 5 days ago, past the 3-day grace
    mockProfile = raceProfile(raceDate);
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
      runDays: [
        {
          id: "race_day",
          dayIndex: new Date(raceDate + "T00:00:00").getDay(),
          date: raceDate,
          weekKey: raceDate,
          templateId: "10k_race",
          type: "race",
          status: "planned",
          completed: false,
        } as ScheduledRunDay,
      ],
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate: raceDate },
      },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    // Allow the auto-transition effect to fire and write. PR-G's
    // auto-rollover runs immediately after and archives the
    // (now-race_no_show) runDay into weekHistory, so we can't
    // assert against the last write. Instead, scan ALL writes for
    // the one PR-D produced — that's the race_no_show write,
    // regardless of what PR-G does next.
    await waitFor(
      () => {
        const wroteRaceNoShow = setDocCalls.some((c) => {
          const data = c.data as ProgramState | undefined;
          const raceRunDay = data?.runDays?.find((rd) => rd.date === raceDate);
          return raceRunDay?.status === "race_no_show";
        });
        expect(wroteRaceNoShow).toBe(true);
      },
      { timeout: 2000 }
    );
  });

  it("does NOT transition within the 3-day grace window", async () => {
    const raceDate = pastDateOffset(1); // 1 day ago, inside grace
    mockProfile = raceProfile(raceDate);
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
      runDays: [
        {
          id: "race_day",
          dayIndex: new Date(raceDate + "T00:00:00").getDay(),
          date: raceDate,
          weekKey: raceDate,
          templateId: "10k_race",
          type: "race",
          status: "planned",
          completed: false,
        } as ScheduledRunDay,
      ],
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate: raceDate },
      },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    setDocCalls.length = 0;
    // Wait a beat to ensure no auto-transition fires.
    await new Promise((r) => setTimeout(r, 100));
    // No writes happened during grace.
    expect(setDocCalls.length).toBe(0);
  });

  it("is idempotent — does not re-write race_no_show on second load", async () => {
    const raceDate = pastDateOffset(5);
    mockProfile = raceProfile(raceDate);
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
      runDays: [
        {
          id: "race_day",
          dayIndex: new Date(raceDate + "T00:00:00").getDay(),
          date: raceDate,
          weekKey: raceDate,
          templateId: "10k_race",
          type: "race",
          // Already race_no_show — second pass should skip.
          status: "race_no_show",
          completed: false,
        } as ScheduledRunDay,
      ],
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate: raceDate },
      },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    setDocCalls.length = 0;
    await new Promise((r) => setTimeout(r, 100));
    expect(setDocCalls.length).toBe(0);
  });
});

// ─── PR-E — recovery phase generation + exit ────────────────────────

describe("PR-E — recovery phase emits all easy_30 templates", () => {
  // PR-D writes the phase on race completion; PR-E consumes the
  // phase when refreshRunSchedule fires (e.g. mid-recovery
  // schedule edit). Test pins: while in recovery, ALL run/both
  // slots emit `easy_30` regardless of week position.

  it("scheduleRecoveryWeekV2 emits easy_30 for every scheduled run/both slot", async () => {
    // Set up: race_prep user in recovery phase. Schedule has 4
    // run slots (Mon/Tue/Thu/Sat). recoveryEndDate is in the
    // future so refreshRunSchedule's `inRecovery` check fires.
    const future = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 10);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();
    mockProfile = raceProfile("2099-09-15");
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
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate: "2099-09-15" },
        phase: "recovery",
        recoveryEndDate: future,
      },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    setDocCalls.length = 0;

    await act(async () => {
      await result.current.refreshRunSchedule({
        weekSchedule: generateSchedule(0, 4),
        weeklyRunDaysTarget: 4,
      });
    });

    const lastWrite = setDocCalls[setDocCalls.length - 1].data as ProgramState;
    expect(lastWrite.runDays).toBeDefined();
    expect(lastWrite.runDays!.length).toBeGreaterThan(0);
    for (const rd of lastWrite.runDays!) {
      expect(rd.templateId).toBe("easy_30");
      expect(rd.type).toBe("easy");
    }
    // Phase preserved (we're still in recovery).
    expect(lastWrite.runPlan?.phase).toBe("recovery");
  });

  it("recovery-exit effect clears phase after recoveryEndDate + 7d grace", async () => {
    // recoveryEndDate is 8 days in the past — past the 7-day grace.
    const eightDaysAgo = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 8);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();
    mockProfile = raceProfile("2099-09-15"); // raceGoal future to avoid auto-transition
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
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate: "2099-09-15" },
        phase: "recovery",
        recoveryEndDate: eightDaysAgo,
      },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });

    // The exit effect should fire and clear phase + recoveryEndDate.
    await waitFor(
      () => {
        const lastWrite = setDocCalls[setDocCalls.length - 1]?.data as
          | ProgramState
          | undefined;
        expect(lastWrite?.runPlan?.phase).toBeUndefined();
        expect(lastWrite?.runPlan?.recoveryEndDate).toBeUndefined();
      },
      { timeout: 2000 }
    );
  });

  it("recovery-exit effect does NOT fire within the 7-day grace window", async () => {
    // recoveryEndDate is 3 days in the past — inside the 7-day grace.
    const threeDaysAgo = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 3);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();
    mockProfile = raceProfile("2099-09-15");
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
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate: "2099-09-15" },
        phase: "recovery",
        recoveryEndDate: threeDaysAgo,
      },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    setDocCalls.length = 0;
    await new Promise((r) => setTimeout(r, 100));
    // No writes during grace — phase preserved.
    expect(setDocCalls.length).toBe(0);
  });
});

// ─── PR-G — auto week rollover ──────────────────────────────────────

describe("PR-G — auto-rollover on calendar-week change", () => {
  // Effect detects stale runDays (last week's weekKey) and runs
  // advanceWeek + runDays regen in a loop up to 12 iterations.
  // Batches writes into one saveProgram at the end.

  it("rolls forward when runDays weekKey is older than today's week", async () => {
    const twoWeeksAgoSunday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay() - 14); // Sunday two weeks ago
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();
    mockProfile = structuredProfile({ weeklyRunDaysTarget: 2 });
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
      runDays: [
        {
          id: "stale_runday",
          dayIndex: 1,
          date: twoWeeksAgoSunday,
          weekKey: twoWeeksAgoSunday,
          templateId: "easy_30",
          type: "easy",
          status: "planned",
          completed: false,
        } as ScheduledRunDay,
      ],
      runPlan: { mode: "structured" },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });

    // Wait for the rollover effect to fire + save.
    await waitFor(
      () => {
        const lastWrite = setDocCalls[setDocCalls.length - 1]?.data as
          | ProgramState
          | undefined;
        // After rollover, runDays[0].weekKey should match current week
        expect(lastWrite?.runDays?.[0]?.weekKey).not.toBe(twoWeeksAgoSunday);
        // weekHistory should have entries from the archived weeks
        expect(lastWrite?.weekHistory?.length ?? 0).toBeGreaterThan(0);
      },
      { timeout: 2000 }
    );
  });

  it("does not roll forward when runDays weekKey matches today's week", async () => {
    const thisSunday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay()); // Sunday of this week
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();
    mockProfile = structuredProfile({ weeklyRunDaysTarget: 2 });
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
      runDays: [
        {
          id: "current_runday",
          dayIndex: 1,
          date: thisSunday,
          weekKey: thisSunday,
          templateId: "easy_30",
          type: "easy",
          status: "planned",
          completed: false,
        } as ScheduledRunDay,
      ],
      runPlan: { mode: "structured" },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    setDocCalls.length = 0;
    await new Promise((r) => setTimeout(r, 100));
    // No rollover write — current week, nothing to advance.
    expect(setDocCalls.length).toBe(0);
  });

  it("skips freeform users (no runDays to rotate)", async () => {
    mockProfile = structuredProfile({ runMode: "freeform" });
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
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    setDocCalls.length = 0;
    await new Promise((r) => setTimeout(r, 100));
    expect(setDocCalls.length).toBe(0);
  });
});
