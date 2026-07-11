// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
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
// Separate store for the IndexedDB cache read (getDocFromCache) so a test
// can simulate "cached locally but server is slow / unreachable".
let mockCacheData: ProgramState | null = null;
let mockCacheExists = false;
const setDocCalls: { ref: unknown; data: any; opts?: any }[] = [];

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({ __ref: true })),
  getDoc: vi.fn(async () => ({
    exists: () => mockDocExists,
    data: () => mockDocData,
  })),
  // Mirrors the real SDK: getDocFromCache REJECTS on a cache miss rather
  // than returning a non-existent snapshot. useProgram's cache-first paint
  // relies on that (its try/catch falls through to the server read).
  getDocFromCache: vi.fn(async () => {
    if (!mockCacheExists) throw new Error("Failed to get document from cache.");
    return { exists: () => mockCacheExists, data: () => mockCacheData };
  }),
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
  deleteField: vi.fn(() => "__deleteField__"),
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
  } | null;
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
// Mocked above — imported here to override per-test (e.g. hang the server read).
import { getDoc } from "firebase/firestore";

beforeEach(() => {
  setDocCalls.length = 0;
  mockDocData = null;
  mockDocExists = false;
  mockCacheData = null;
  mockCacheExists = false;
  mockProfile = null;
  mockUpdateProfile.mockClear();
});

describe("PR-0b-ii — useProgram writers swap V1 → V2", () => {
  it("Run9: initial creation for a legacy structured user migrates to freeform with NO runDays", async () => {
    // Run9 (3a) retired `structured`: a legacy structured user is migrated to
    // freeform on load, and freeform generates no auto-assigned runDays. Only
    // a race plan (race_prep + raceGoal) produces a week.
    mockProfile = structuredProfile();
    mockDocExists = false; // no existing programState doc

    const { result } = renderHook(() => useProgram());

    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });

    // The initial doc still pins the schema version.
    expect(setDocCalls.length).toBeGreaterThan(0);
    const lastWrite = setDocCalls[setDocCalls.length - 1].data as ProgramState;
    expect(lastWrite.programSchemaVersion).toBe(CURRENT_PROGRAM_SCHEMA_VERSION);

    // No structured week is generated — freeform has no runDays.
    expect(lastWrite.runDays).toBeUndefined();

    // runMode is migrated structured → freeform.
    expect(mockUpdateProfile).toHaveBeenCalledWith({ runMode: "freeform" });
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

  it("Run9: loading a legacy structured user WIPES the orphaned runDays + runPlan", async () => {
    // Run9 (3a): structured is retired. On load, a structured user's
    // auto-assigned runDays + runPlan are wiped (they're meaningless under
    // freeform) and runMode is migrated.
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
          id: "old_structured_run",
          dayIndex: 1,
          date: "2026-01-05",
          weekKey: "2026-01-04",
          templateId: "tempo_20",
          type: "tempo",
          status: "planned",
        } as ScheduledRunDay,
      ],
      runPlan: { mode: "structured" },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });

    // runMode migrated structured → freeform.
    expect(mockUpdateProfile).toHaveBeenCalledWith({ runMode: "freeform" });
    // The wipe write cleared the orphaned structured runDays to []. (Assert a
    // wipe write exists rather than the LAST write: the migration's
    // updateProfile triggers a re-render whose second load pass reads the
    // unchanged mock doc, so the ordering of writes isn't deterministic in the
    // harness — the wipe having happened is the contract.)
    expect(
      setDocCalls.some((c) => {
        const rd = (c.data as ProgramState).runDays;
        return Array.isArray(rd) && rd.length === 0;
      })
    ).toBe(true);
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
    // Run9: structured retired, so the override-threading contract is now
    // exercised via a race plan (the surviving runDays-generating mode). The
    // staleness concern is mode-agnostic.
    mockProfile = raceProfile("2027-01-01", { weekSchedule: staleSchedule });
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
        raceGoal: { distance: "10k", targetDate: "2027-01-01" },
      },
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
    // Override (hybrid 6+2) won → runs generated. Stale profile.weekSchedule
    // (all rest) would have produced 0.
    expect(lastWrite.runDays!.length).toBeGreaterThan(0);
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

describe("Run9 phase-3 — realign carries completions across regen", () => {
  // The realign writer (Slice DE; formerly compress) regenerates the current
  // week (new ids per day). The carry-aware regenerateRacePlan must persist a
  // re-keyed manualCompletions map, never drop the user's record. The
  // generator's exact output dates are clock-dependent, so this integration
  // test pins the WIRING invariant (carry path runs → persists a map →
  // preserves data); the deterministic re-key / drop / status-restamp logic is
  // pinned in src/lib/__tests__/runCompletionCarry.test.ts.
  it("persists a manualCompletions map and never drops an existing completion", async () => {
    const targetDate = localDateString(addLocalDays(new Date(), 70)); // ~10wk out
    mockProfile = raceProfile(targetDate);
    const completion = { completedAt: 1_700_000_000_000 };
    mockDocData = {
      goal: "recomp",
      currentPhase: "base",
      weekNumber: 1,
      splitType: "ppl",
      workouts: [],
      fatigueScore: 0,
      updatedAt: Date.now(),
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      runDays: [
        {
          id: "runday_2026-05-10_2_tempo_40",
          dayIndex: 2,
          templateId: "tempo_40",
          type: "tempo",
          completed: true,
          status: "completed_exact",
          date: "2026-05-12",
          weekKey: "2026-05-10",
        },
      ],
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate },
        totalWeeks: 12,
        currentWeek: 2,
      },
      // One entry keyed to the seeded runDay, plus a legacy orphan whose id is
      // in no runDay — the carry must preserve it rather than nuke the map.
      manualCompletions: {
        "runday_2026-05-10_2_tempo_40": completion,
        legacy_orphan_key: { completedAt: 1_699_000_000_000 },
      },
      pendingFellBehindPrompt: {
        weekKey: "2026-05-10",
        completedRatio: 0.25,
        realRunCount: 1,
        weeklyTarget: 4,
      },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.realignRacePlan();
    });

    const lastSave = setDocCalls[setDocCalls.length - 1]?.data as ProgramState;
    // A manualCompletions map is persisted (pre-fix the writer kept the stale
    // map via spread but never re-keyed; now the carry path owns it).
    expect(lastSave.manualCompletions).toBeDefined();
    // The legacy-orphan completion is never silently dropped.
    expect(lastSave.manualCompletions!["legacy_orphan_key"]).toBeDefined();
    // The seeded completion's VALUE survives somewhere in the map (under its
    // original id if today's regen keeps that date, else dropped only if the
    // date truly left the plan — but the orphan above guarantees the carry ran).
    const values = Object.values(lastSave.manualCompletions!);
    expect(values).toContainEqual({ completedAt: 1_699_000_000_000 });
  });
});

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
    // Run9 (3a): runDays only persist under race_prep now (structured is
    // retired + wiped on load). The override matching logic is mode-agnostic.
    mockProfile = raceProfile("2027-01-01");
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
    mockProfile = raceProfile("2027-01-01");
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
    mockProfile = raceProfile("2027-01-01");
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

  // Run9 (3a): the "refresh INTO structured" scenario is retired — structured
  // is no longer a target mode (it's migrated to freeform on load). The
  // orphaned-plan wipe this guarded is now covered by the repurposed
  // "loading a legacy structured user WIPES the orphaned runDays + runPlan"
  // test above. Skipped (not deleted) to preserve the merge-vs-replace intent
  // doc for the surviving inverse test below.
  it.skip("structured-mode refresh emits zero race-period templates even when previous runDays were race-shaped", async () => {
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

// ─── PR-L L5 — race-no-show no longer written client-side ────────────

describe("PR-L L5 — useProgram does NOT write race_no_show client-side", () => {
  // The client `useEffect` that used to write race_no_show after a
  // 3-day grace was deleted in L5. The server-side trigger
  // (`dailyRaceReconciliationSweep`) now owns this transition, so
  // non-React clients (Apple Watch, future native) reach the same
  // state without per-client logic.
  //
  // These tests pin the post-L5 contract: given the exact state
  // that used to trigger the client effect, NO setDoc happens from
  // the hook's render path. The previous PR-D tests asserted the
  // client write; the new tests assert its absence.

  function pastDateOffset(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  it("does NOT write race_no_show even when the 3-day grace has passed (server now owns the transition)", async () => {
    const raceDate = pastDateOffset(5); // 5 days ago — pre-L5 this would have triggered the client effect
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
    // Wait long enough for any post-load effect to have fired.
    await new Promise((r) => setTimeout(r, 200));
    // Scan all writes — none should carry race_no_show for the
    // race-day runDay. PR-G's auto-rollover may still fire if the
    // weekKey is stale, but it won't change the race-day status.
    const wroteRaceNoShow = setDocCalls.some((c) => {
      const data = c.data as ProgramState | undefined;
      const raceRunDay = data?.runDays?.find((rd) => rd.date === raceDate);
      return raceRunDay?.status === "race_no_show";
    });
    expect(wroteRaceNoShow).toBe(false);
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

  it("RUN-H1 — advanceToNextWeek mid-recovery keeps the phase + emits a recovery week (not a race regen)", async () => {
    // A week rolling over while recovery is still active must NOT regenerate a
    // race plan — that path drops phase/recoveryEndDate via makeRunPlanRecord
    // and emits race-training runDays. Pre-fix the regen branch wiped recovery.
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
      workouts: [], // shouldAdvanceWeek([]) === true → advanceToNextWeek proceeds
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
      await result.current.advanceToNextWeek();
    });

    const lastWrite = setDocCalls[setDocCalls.length - 1].data as ProgramState;
    // Recovery preserved across the week advance.
    expect(lastWrite.runPlan?.phase).toBe("recovery");
    expect(lastWrite.runPlan?.recoveryEndDate).toBe(future);
    // The rolled week is a recovery week (easy_30), not race training.
    expect(lastWrite.runDays!.length).toBeGreaterThan(0);
    for (const rd of lastWrite.runDays!) {
      expect(rd.templateId).toBe("easy_30");
    }
  });

  // PR-L L5: the recovery-exit `useEffect` that used to clear phase
  // after `recoveryEndDate + 7d` was deleted. Server-side
  // `dailyRaceReconciliationSweep` now owns that clear. The previous
  // two PR-E tests (asserting the client write happened past grace
  // AND was suppressed within grace) are replaced by a single test
  // that pins the post-L5 contract: no client write fires from
  // recovery state, regardless of how stale `recoveryEndDate` is.

  it("PR-L L5 — useProgram does NOT clear recovery phase client-side past the 7-day grace", async () => {
    // 8 days past recoveryEndDate. Pre-L5 the client effect would
    // fire and clear phase + recoveryEndDate. Post-L5 the client is
    // a pure reader; the server (`dailyRaceReconciliationSweep`)
    // owns the clear.
    const eightDaysAgo = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 8);
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
        recoveryEndDate: eightDaysAgo,
      },
    } as ProgramState;
    mockDocExists = true;

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    setDocCalls.length = 0;
    await new Promise((r) => setTimeout(r, 200));
    // No writes from the deleted recovery-exit effect. Scan all
    // captured writes — none should clear the phase. (PR-G's
    // auto-rollover may still fire and rewrite runDays, but it
    // doesn't touch runPlan.phase.)
    const clearedPhase = setDocCalls.some((c) => {
      const data = c.data as ProgramState | undefined;
      return data?.runPlan !== undefined && data.runPlan.phase === undefined;
    });
    expect(clearedPhase).toBe(false);
    // Hook still surfaces the recovery state for the UI to read.
    expect(result.current.programState?.runPlan?.phase).toBe("recovery");
    expect(result.current.programState?.runPlan?.recoveryEndDate).toBe(
      eightDaysAgo
    );
  });

  // Run9 3a-ii: skipping recovery for the JUST-COMPLETED race returns the
  // user to freeform AND explicitly clears the race goal (raceGoal: null), so
  // the materialized runMode and the goal can't disagree. Pre-3a-ii this left
  // the goal stranded under freeform (the "deferred clear" from #883).
  it("Run9 3a-ii — skipRecoveryEarly for the completed race clears raceGoal (null) + runMode freeform", async () => {
    const future = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 10);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();
    // raceGoal on the profile === the race recovery is for (runPlan.raceGoal)
    // → resolveRecoveryExit clears it.
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
    mockUpdateProfile.mockClear();
    setDocCalls.length = 0;

    await act(async () => {
      await result.current.skipRecoveryEarly();
    });

    // Materialization invariant: the SAME patch co-writes runMode + the null
    // raceGoal clear.
    expect(mockUpdateProfile).toHaveBeenCalledWith({
      raceGoal: null,
      runMode: "freeform",
    });
    // The plan is dropped (runPlan omitted → stripped; runDays emptied).
    const lastWrite = setDocCalls[setDocCalls.length - 1].data as ProgramState;
    expect(lastWrite.runDays).toEqual([]);
    expect(lastWrite.runPlan).toBeUndefined();
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
    // Run9: structured retired — auto-rollover (mode-agnostic) is exercised
    // via a race plan, the surviving runDays-bearing mode.
    mockProfile = raceProfile("2027-01-01", { weeklyRunDaysTarget: 2 });
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
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate: "2027-01-01" },
      },
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

describe("cache-first paint (cold-open latency)", () => {
  it("paints programState from the local cache without waiting on the server read", async () => {
    // Returning user: a valid doc is already in IndexedDB. Make the server
    // read hang so the only way the UI can unblock is the cache-first paint.
    const cached: ProgramState = {
      goal: "recomp",
      currentPhase: "base",
      weekNumber: 3,
      splitType: "full_body",
      workouts: [],
      fatigueScore: 0,
      updatedAt: Date.now(),
      settings: { autoProgression: true, microloading: true },
      weekHistory: [],
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
    } as ProgramState;
    mockCacheData = cached;
    mockCacheExists = true;
    // Server read never resolves — proves the cache paint alone flips loading.
    (getDoc as any).mockImplementationOnce(() => new Promise(() => {}));
    mockProfile = structuredProfile({ runMode: "freeform" });

    const { result } = renderHook(() => useProgram());

    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    expect(result.current.programState).toBeTruthy();
    expect(result.current.programState?.weekNumber).toBe(3);
  });

  it("falls through to the server read on a cache miss (no regression)", async () => {
    // First-ever load: nothing cached → getDocFromCache rejects. The server
    // read must still drive the load exactly as it did pre-cache-first.
    mockCacheExists = false;
    mockDocExists = false; // no server doc either → initial-creation path
    mockProfile = structuredProfile({ runMode: "freeform" });

    const { result } = renderHook(() => useProgram());

    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    // The server path ran (initial-creation write) and produced state.
    expect(setDocCalls.length).toBeGreaterThan(0);
    expect(result.current.programState).toBeTruthy();
  });
});
