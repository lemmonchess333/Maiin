// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
import { createRequire } from "node:module";
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
import { toCompletionSetLogs } from "../warmupRamp";
import {
  localWeekKey,
  localDateString,
  addLocalDays,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { CURRENT_PROGRAM_SCHEMA_VERSION } from "../programTypes";
import type { ProgramState, ScheduledRunDay } from "../programTypes";

// ─── Firebase mocks ──────────────────────────────────────────────────

/**
 * MIGRATED off the inline SDK factory 2026-07-26 (ADR-0009: one fake).
 * The last of the legacy inline mocks.
 *
 * The factory was a second Firestore: a `mockDocData` store, a bespoke
 * `writeBatch` whose commit hand-applied each set, and a separate cache
 * pair. Three consequences the fake fixes rather than reproduces:
 *
 *   - its batch commit mutated the store and THEN threw on
 *     `mockBatchReject`, so the rollback test asserted against a store
 *     that had already been written to. A real batch is atomic; the
 *     fake fails before applying anything.
 *   - `doc()` returned `{ __ref, __id }`, so every ref assertion saw the
 *     LAST path segment only — `programState/current` and
 *     `workouts/current` were indistinguishable.
 *   - the cache could not be seeded independently of the server store
 *     without the bespoke `mockCacheData` pair.
 *
 * The shims keep this suite's vocabulary (`setDocCalls()`, `batchCommits()`)
 * so ~100 assertion sites did not have to be rewritten. A 2069-line
 * mechanical rewrite is precisely where coverage gets deleted while
 * staying green, which this file's own queue entry warns about.
 */
const PROGRAM = "users/test-user-1/programState/current";

/** Seed the IndexedDB cache copy only — invisible to server reads.
 *  `null` means "nothing cached", i.e. leave the cache cold. */
function seedCacheDoc(data: unknown): void {
  if (data == null) return;
  seedCache({ [PROGRAM]: data as Record<string, unknown> });
}

/** Seed the server-side program doc. `null` means "no doc exists" —
 *  NOT a document whose contents are null, which is what a naive
 *  translation of the old `mockDocData = null` would produce. */
function seedProgram(data: unknown): void {
  if (data == null) return;
  seedFirestore({ [PROGRAM]: data as Record<string, unknown> });
}

/**
 * Baseline for the "ignore everything written before now" idiom.
 *
 * The old suite did `setDocCalls.length = 0` mid-test to isolate the
 * write under test from the load-time ones. Against a DERIVED view that
 * is a silent no-op, so every such assertion counts the load writes too
 * — which is exactly how 22 of these tests failed on the first run after
 * migrating. `markWrites()` makes the intent explicit instead.
 */
let writeMark = 0;
let batchMark = 0;
function markWrites(): void {
  writeMark = writeLog().length;
  batchMark = batchLog().length;
}

/** Program-doc writes, in order — the old `setDocCalls()`. `ref.__id` is
 *  preserved for the existing assertions, but now derived from the REAL
 *  path, and `ref.path` is available for anything that wants to be
 *  unambiguous about which collection was written. */
const setDocCalls = () => {
  // Exclude writes that arrived inside a batch. The old stub kept batch
  // sets in their own array, so `setDocCalls` meant "direct setDoc only";
  // the fake logs both, and counting them together silently doubles
  // every assertion on a path that is written both ways.
  const batched = new Set(batchLog().flat());
  return writeLog()
    .slice(writeMark)
    .filter((w) => !batched.has(w))
    .filter((w) => w.op.startsWith("set") && w.path === PROGRAM)
    .map((w) => ({
      ref: { path: w.path, __id: w.path.split("/").pop() },
      data: w.data as any,
      opts: undefined as any,
    }));
};

/** Committed batches, grouped — the old `batchCommits()`. */
const batchCommits = () =>
  batchLog()
    .slice(batchMark)
    .map((b) =>
      b.map((w) => ({
        ref: { path: w.path, __id: w.path.split("/").pop() },
        data: w.data as any,
      }))
    );

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));

import {
  seedFirestore,
  resetFirestore,
  seedCache,
  writeLog,
  batchLog,
  failNextFirestore,
  deferReads,
} from "@/test/firestoreHarness";

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
    eventName?: string;
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
const mockRefreshProfile = vi.fn(async () => undefined);
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: stableUser,
    profile: mockProfile,
    updateProfile: mockUpdateProfile,
    // Added when skipRecoveryEarly migrated: that command's profile half
    // lands server-side, so the hook re-reads the profile afterwards.
    refreshProfile: mockRefreshProfile,
  }),
  useUid: () =>
    ({
      user: stableUser,
      profile: mockProfile,
      updateProfile: mockUpdateProfile,
    }).user?.uid ?? null,
}));

// Stub everything else useProgram imports but doesn't matter for
// PR-0b-ii's writer assertions.
/* P6: `setNextWorkout` (and the other migrated writers) no longer `setDoc` —
   they send a command. Mocked here so this suite can assert the command
   instead of a write it will never see.

   THE MOCK VALIDATES. It runs the REAL server validator
   (functions/lib/programCommands.js) before recording, so every test that
   exercises a migrated writer also proves the command it builds is one the
   server would accept.

   This is not belt-and-braces — it closes a gap that had already shipped a
   regression. The client suite mocked the sender, so it proved only what was
   SENT; the functions suite hand-builds commands, so it proved only what was
   ACCEPTED. Nothing joined the two, and `skipWorkoutDay` / `setNextWorkout`
   went out sending a bare `dayIndex` against a validator that requires all
   three precondition fields. Every such command was rejected, the client
   rolled back and refetched, and the user's skip silently did nothing — with
   both suites green. ADR-0008, reachability over prose: the pin has to sit on
   the path that actually runs. */
const require_ = createRequire(import.meta.url);
const { assertClientProgramCommand } = require_(
  "../../../../functions/lib/programCommands"
) as { assertClientProgramCommand: (c: unknown) => unknown };

const sentCommands: Record<string, unknown>[] = [];
vi.mock("../programCommandClient", () => ({
  sendProgramCommand: async (command: Record<string, unknown>) => {
    try {
      assertClientProgramCommand(command);
    } catch (err) {
      throw new Error(
        `the server would REJECT this ${command.kind} command: ` +
          `${(err as Error).message}\n${JSON.stringify(command, null, 2)}`
      );
    }
    sentCommands.push(command);
  },
}));

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
  // One reset clears documents, the cache, the write log and the batch
  // log together — the four things this suite used to zero by hand.
  resetFirestore();
  writeMark = 0;
  batchMark = 0;
  mockProfile = null;
  mockUpdateProfile.mockClear();
  // Migrated writers assert with `sentCommands.find(...)`, which would
  // happily match a command left behind by the PREVIOUS test. Reset it with
  // the write log rather than by hand in each test.
  sentCommands.length = 0;
});

describe("PR-0b-ii — useProgram writers swap V1 → V2", () => {
  it("Run9: initial creation for a legacy structured user migrates to freeform with NO runDays", async () => {
    // Run9 (3a) retired `structured`: a legacy structured user is migrated to
    // freeform on load, and freeform generates no auto-assigned runDays. Only
    // a race plan (race_prep + raceGoal) produces a week.
    mockProfile = structuredProfile();
    resetFirestore(); // no existing programState doc

    const { result } = renderHook(() => useProgram());

    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });

    // The initial doc still pins the schema version.
    expect(setDocCalls().length).toBeGreaterThan(0);
    const lastWrite = setDocCalls()[setDocCalls().length - 1]
      .data as ProgramState;
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
    resetFirestore();

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });

    const lastWrite = setDocCalls()[setDocCalls().length - 1]
      .data as ProgramState;
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
    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites(); // reset to capture only the refresh write

    await act(async () => {
      await result.current.refreshRunSchedule();
    });

    expect(setDocCalls().length).toBeGreaterThan(0);
    const lastWrite = setDocCalls()[setDocCalls().length - 1]
      .data as ProgramState;
    expect(lastWrite.runDays).toBeDefined();
    expect(lastWrite.runDays!.length).toBeGreaterThan(0);
    lastWrite.runDays!.forEach(expectV2Shape);
    // `compressed` describes the BLOCK, not the days left in it.
    //
    // This assertion used to read `.toBe(true)` with the comment "a 3-weeks-out
    // 10K stays compressed" — which encoded the defect: compression was derived
    // from weeks REMAINING, so every plan became "compressed" as its race
    // approached. The fixture carries `totalWeeks: 6` and 10K's `minWeeks` is
    // 6, so this runner declared a full-length block and is three weeks into
    // it. That is not a compressed plan.
    //
    // The distinction is not cosmetic: the taper branch is gated on
    // `!compressed`, so under the old reading a real 10K taper lost its quality
    // session — the one thing Bosquet et al. (2007) say a taper must keep.
    expect(lastWrite.runPlan!.compressed).toBe(false);
  });

  it("race-prep refresh keeps compressed TRUE for a genuinely short block", async () => {
    // The paired negative for the assertion above: flipping that expectation
    // without this one would pass for the wrong reason — `false` is also what
    // you get if the flag stopped being written at all.
    const threeWeeksOut = new Date();
    threeWeeksOut.setDate(threeWeeksOut.getDate() + 21);
    const targetDate = threeWeeksOut.toISOString().split("T")[0];
    mockProfile = raceProfile(targetDate);
    seedProgram({
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
        raceGoal: mockProfile.raceGoal,
        // Declared 3 weeks out and never longer — 10K minWeeks is 6, so the
        // BLOCK itself is short. This one really is compressed.
        totalWeeks: 3,
        currentWeek: 0,
      },
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.refreshRunSchedule();
    });

    const lastWrite = setDocCalls()[setDocCalls().length - 1]
      .data as ProgramState;
    expect(lastWrite.runPlan!.compressed).toBe(true);
  });

  it("race-prep refresh preserves raceGoal.eventName (RACE-EVENT-IDENTITY-01)", async () => {
    // The regen path embeds profile.raceGoal whole (makeRunPlanRecord takes
    // the object by reference), so an optional eventName must survive a
    // schedule refresh — a regen that reconstructed the goal field-by-field
    // would silently wipe the name.
    const threeWeeksOut = new Date();
    threeWeeksOut.setDate(threeWeeksOut.getDate() + 21);
    const targetDate = threeWeeksOut.toISOString().split("T")[0];
    mockProfile = raceProfile(targetDate, {
      raceGoal: {
        distance: "10k",
        targetDate,
        eventName: "Manchester 10K 2026",
      },
    });
    seedProgram({
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
        raceGoal: mockProfile.raceGoal!,
        totalWeeks: 6,
        currentWeek: 2,
      },
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites(); // reset to capture only the refresh write

    await act(async () => {
      await result.current.refreshRunSchedule();
    });

    expect(setDocCalls().length).toBeGreaterThan(0);
    const lastWrite = setDocCalls()[setDocCalls().length - 1]
      .data as ProgramState;
    expect(lastWrite.runPlan!.raceGoal).toMatchObject({
      distance: "10k",
      targetDate,
      eventName: "Manchester 10K 2026",
    });
  });

  it("Run9: loading a legacy structured user WIPES the orphaned runDays + runPlan", async () => {
    // Run9 (3a): structured is retired. On load, a structured user's
    // auto-assigned runDays + runPlan are wiped (they're meaningless under
    // freeform) and runMode is migrated.
    mockProfile = structuredProfile();
    seedProgram({
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
    } as ProgramState);

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
      setDocCalls().some((c) => {
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
    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    const overrideSchedule = generateSchedule(6, 2);
    await act(async () => {
      await result.current.refreshRunSchedule({
        weekSchedule: overrideSchedule,
        weeklyRunDaysTarget: 2,
      });
    });

    const lastWrite = setDocCalls()[setDocCalls().length - 1]
      .data as ProgramState;
    // Override (hybrid 6+2) won → runs generated. Stale profile.weekSchedule
    // (all rest) would have produced 0.
    expect(lastWrite.runDays!.length).toBeGreaterThan(0);
  });

  it("regenerateProgram writes programSchemaVersion + V2-shape runDays", async () => {
    // RACE-prep, not structured. Run9 retired structured and WIPES its
    // runDays + runPlan on load, so a structured user legitimately
    // regenerates with no runDays — there is nothing V2-shaped to check.
    //
    // This read as a structured user until 2026-07-26 and passed, because
    // the old stub merged on EVERY setDoc regardless of `{ merge }`. The
    // load-time wipe therefore never actually removed `runPlan`, and
    // regenerate still saw `mode: "structured"`. Under a fake that honours
    // replace-vs-merge the wipe lands, and the assertion had no subject.
    mockProfile = raceProfile("2027-01-01");
    seedProgram({
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
      runPlan: { mode: "race_prep" },
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.regenerateProgram();
    });

    const lastWrite = setDocCalls()[setDocCalls().length - 1]
      .data as ProgramState;
    expect(lastWrite.programSchemaVersion).toBe(CURRENT_PROGRAM_SCHEMA_VERSION);
    expect(lastWrite.runDays).toBeDefined();
    lastWrite.runDays!.forEach(expectV2Shape);
  });

  // Blk2 / H1. `saveProgram` is a no-merge full replace and regenerate's
  // newState literal spreads nothing from programState, so any field it
  // does not name is DELETED. The block was not named.
  //
  // This is not a rare path: `useProgrammeScheduleEditor`'s restructure
  // confirm calls regenerateProgram on any lift-day-count change, so an
  // ordinary two-tap edit destroyed an 8-week block — while leaving its
  // rep prescription and focus in force, with no goalBefore left to
  // release to. planBuilder carries the block through the identical
  // hazard; the fix was never carried to this sibling.
  it("regenerateProgram does not destroy an active training block", async () => {
    const block = {
      id: "2026-08-01-1",
      owned: true as const,
      focus: "strength" as const,
      pace: "full" as const,
      durationWeeks: 8 as const,
      startDate: "2026-08-01",
      goalBefore: "hypertrophy" as const,
      amnestyWeeksLeft: 3,
      weeklyLiftTarget: 4,
      anchorExerciseIds: [],
      why: "",
      createdAt: 1,
      schemaVersion: 1 as const,
    };
    mockProfile = raceProfile("2027-01-01");
    seedProgram({
      goal: "recomp",
      currentPhase: "base",
      weekNumber: 5,
      splitType: "ppl",
      workouts: [],
      fatigueScore: 0,
      updatedAt: Date.now(),
      settings: { autoProgression: true, microloading: true },
      weekHistory: [],
      runDays: [],
      runPlan: { mode: "race_prep" },
      trainingBlock: block,
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.regenerateProgram();
    });

    const lastWrite = setDocCalls()[setDocCalls().length - 1]
      .data as ProgramState;
    expect(lastWrite.trainingBlock).toEqual(block);
  });

  // The other direction, so the carry can't be "always write something".
  it("regenerateProgram writes no block when there was none", async () => {
    mockProfile = raceProfile("2027-01-01");
    seedProgram({
      goal: "recomp",
      currentPhase: "base",
      weekNumber: 5,
      splitType: "ppl",
      workouts: [],
      fatigueScore: 0,
      updatedAt: Date.now(),
      settings: { autoProgression: true, microloading: true },
      weekHistory: [],
      runDays: [],
      runPlan: { mode: "race_prep" },
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.regenerateProgram();
    });

    const lastWrite = setDocCalls()[setDocCalls().length - 1]
      .data as ProgramState;
    expect(lastWrite.trainingBlock).toBeUndefined();
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
    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.skipRunDay(2);
    });

    // transitionStatus(completed_exact, skipped) is illegal —
    // completed_* is terminal. Zero writes.
    expect(setDocCalls().length).toBe(0);
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
    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.realignRacePlan();
    });

    const lastSave = setDocCalls()[setDocCalls().length - 1]
      ?.data as ProgramState;
    // The block's length is carried with the position. Without it the regen
    // re-derived totalWeeks from the weeks REMAINING (~10 here), and a
    // carried currentWeek against that shorter block put the generated week
    // in a different phase from the one the cockpit showed. (currentWeek
    // itself is advanced by the load-time rollover from the fixture's fixed
    // 2026-05 weekKey, then clamped into the block — so only its bound is
    // asserted here.)
    expect(lastSave.runPlan?.totalWeeks).toBe(12);
    expect(lastSave.runPlan?.currentWeek).toBeLessThan(12);
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
    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.overrideRunDay("runday_target_id", "tempo_20");
    });

    // Through the boundary: the command names the ONE slot to change, so
    // "did not splash across dayIndex matches" is now a property of the
    // address rather than of the written array.
    expect(setDocCalls().length).toBe(0);
    const cmd = sentCommands.find((c) => c.kind === "overrideRunDay");
    expect(cmd?.runDayId).toBe("runday_target_id");
    expect(cmd?.templateId).toBe("tempo_20");
  });

  it("called with a number dayIndex updates the matching runDay (legacy fallback)", async () => {
    mockProfile = raceProfile("2027-01-01");
    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.overrideRunDay(3, "tempo_20");
    });

    // The dayIndex overload survives the migration as a LOOKUP: the caller
    // still passes a dow, and the writer resolves it to the stable id the
    // command addresses. dayIndex never reaches the wire.
    expect(setDocCalls().length).toBe(0);
    const cmd = sentCommands.find((c) => c.kind === "overrideRunDay");
    expect(cmd?.runDayId).toBe("runday_b");
    expect(cmd?.templateId).toBe("tempo_20");
    expect(cmd).not.toHaveProperty("dayIndex");
  });

  it("refuses to override a non-editable runDay (terminal status)", async () => {
    mockProfile = raceProfile("2027-01-01");
    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.overrideRunDay("runday_skipped", "tempo_20");
    });

    // Editable gate refuses. Zero writes.
    expect(setDocCalls().length).toBe(0);
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

    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.refreshRunSchedule({
        weekSchedule: generateSchedule(6, 3),
        weeklyRunDaysTarget: 3,
      });
    });

    expect(setDocCalls().length).toBeGreaterThan(0);
    const lastWrite = setDocCalls()[setDocCalls().length - 1]
      .data as ProgramState;
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

    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.refreshRunSchedule({
        weekSchedule: generateSchedule(6, 3),
        weeklyRunDaysTarget: 3,
      });
    });

    const lastWrite = setDocCalls()[setDocCalls().length - 1]
      .data as ProgramState;
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
    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();
    // Wait long enough for any post-load effect to have fired.
    await new Promise((r) => setTimeout(r, 200));
    // Scan all writes — none should carry race_no_show for the
    // race-day runDay. PR-G's auto-rollover may still fire if the
    // weekKey is stale, but it won't change the race-day status.
    const wroteRaceNoShow = setDocCalls().some((c) => {
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
    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.refreshRunSchedule({
        weekSchedule: generateSchedule(0, 4),
        weeklyRunDaysTarget: 4,
      });
    });

    const lastWrite = setDocCalls()[setDocCalls().length - 1]
      .data as ProgramState;
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
    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.advanceToNextWeek();
    });

    const lastWrite = setDocCalls()[setDocCalls().length - 1]
      .data as ProgramState;
    // A manual advance anchors to NEXT week, so it BUYS a week rather than
    // borrowing the rest of this one. The rollover fires on
    // `anchor < localWeekKey()`, so the old current-week stamp was already
    // stale by the next Sunday: advancing on a Wednesday triggered the
    // automatic rollover four days later, on top of the advance the user
    // just asked for. For anyone who habitually finishes early that
    // compressed periodization — deloads every ~2 calendar weeks instead of
    // every 4th programme week.
    expect(lastWrite.liftWeekKey! > localWeekKey()).toBe(true);

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
    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();
    await new Promise((r) => setTimeout(r, 200));
    // No writes from the deleted recovery-exit effect. Scan all
    // captured writes — none should clear the phase. (PR-G's
    // auto-rollover may still fire and rewrite runDays, but it
    // doesn't touch runPlan.phase.)
    const clearedPhase = setDocCalls().some((c) => {
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
    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    mockUpdateProfile.mockClear();
    markWrites();

    await act(async () => {
      await result.current.skipRecoveryEarly();
    });

    // P6: the materialization invariant is no longer this client's to keep.
    // It used to issue `Promise.all([updateProfile(patch), saveProgram(next)])`
    // — two documents, two independent writes, either able to land alone. Now
    // ONE command carries no payload at all and the reducer resolves the exit
    // from transaction-current state, writing both halves together. That
    // atomicity is asserted where it can actually be observed: against a real
    // emulator in functions/__tests__/integration/programCommands.test.js.
    //
    // What this test still owns is that the client stopped writing directly.
    expect(setDocCalls().length).toBe(0);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    const cmd = sentCommands.find((c) => c.kind === "skipRecoveryEarly");
    expect(cmd).toBeDefined();
    // No payload — the exit decision is server-derived, so anything else here
    // would be the client asserting a race outcome it does not own.
    expect(Object.keys(cmd!).sort()).toEqual(["commandId", "kind"]);
    // And that it re-reads the profile, since that half landed server-side.
    expect(mockRefreshProfile).toHaveBeenCalled();
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
    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });

    // Wait for the rollover effect to fire + save.
    await waitFor(
      () => {
        const lastWrite = setDocCalls()[setDocCalls().length - 1]?.data as
          | ProgramState
          | undefined;
        // After rollover, runDays[0].weekKey should match current week
        expect(lastWrite?.runDays?.[0]?.weekKey).not.toBe(twoWeeksAgoSunday);
        // The run week is what this test is about. It deliberately does NOT
        // assert a lift-side archive: this fixture has `workouts: []`, so
        // there are no lift weeks to archive, and `advanceWeek` only archives
        // weeks that were trained. The old unconditional archive made an
        // empty-plan user look like they had lift history.
        expect(lastWrite?.runDays?.[0]?.weekKey).toBe(localWeekKey());
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
    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();
    await new Promise((r) => setTimeout(r, 100));
    // No rollover write — current week, nothing to advance.
    expect(setDocCalls().length).toBe(0);
  });

  it("skips freeform users (no runDays to rotate)", async () => {
    mockProfile = structuredProfile({ runMode: "freeform" });
    seedProgram({
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
    } as ProgramState);

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();
    await new Promise((r) => setTimeout(r, 100));
    expect(setDocCalls().length).toBe(0);
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
    seedCacheDoc(cached);
    // Server read never resolves — proves the cache paint alone flips loading.
    // Server read never answers. `deferReads` holds it open for real,
    // rather than swapping getDoc for a never-resolving stub — so the
    // cache paint is racing an actual in-flight read, which is the
    // situation being tested.
    deferReads();
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
    resetFirestore(); // no server doc either → initial-creation path
    mockProfile = structuredProfile({ runMode: "freeform" });

    const { result } = renderHook(() => useProgram());

    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    // The server path ran (initial-creation write) and produced state.
    expect(setDocCalls().length).toBeGreaterThan(0);
    expect(result.current.programState).toBeTruthy();
  });
});

// Packet 15 — completeWorkoutDay writes programme + workout atomically.
describe("packet 15 — completeWorkoutDay atomic batch", () => {
  function seedProgramWithDay(includeUnperformed = false) {
    mockProfile = { uid: "test-user-1", runMode: "freeform" };
    seedProgram({
      goal: "recomp",
      weekNumber: 1,
      currentPhase: "base",
      splitType: "ppl",
      fatigueScore: 0,
      updatedAt: Date.now(),
      settings: { autoProgression: true, microloading: true },
      weekHistory: [],
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      workouts: [
        {
          dayName: "Push",
          completed: false,
          skipped: false,
          exercises: [
            {
              exerciseId: "bench",
              name: "Bench",
              movementCategory: "chest",
              sets: 3,
              reps: 5,
              weight: 100,
            },
            ...(includeUnperformed
              ? [
                  {
                    exerciseId: "curl",
                    name: "Curl",
                    movementCategory: "arms",
                    sets: 3,
                    reps: 10,
                    weight: 20,
                  },
                ]
              : []),
          ],
        },
      ],
    } as unknown as ProgramState);
  }
  const session = (completionId: string) => ({
    completionId,
    completionCommandId: completionId,
    durationMinutes: 30,
    setLogs: [[{ weight: 100, reps: 5, completed: true }]],
  });

  it("shares only performed exercises, not untouched programme slots", async () => {
    const { compose } = await import("@/lib/shareComposer");
    const { postActivity } = await import("@/lib/socialApi");
    vi.mocked(compose).mockResolvedValueOnce({
      visibility: "followers",
      caption: "",
    });
    seedProgramWithDay(true);
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.completeWorkoutDay(0, {
        ...session("partial-count"),
        setLogs: [[{ weight: 100, reps: 5, completed: true }], []],
      });
    });
    expect(compose).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        meta: expect.arrayContaining(["1 exercise"]),
      }),
      expect.anything()
    );
    expect(postActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        exerciseCount: 1,
        totalVolume: 500,
        exercises: [expect.objectContaining({ name: "Bench" })],
        muscleGroups: ["chest"],
      })
    );
  });

  it("commits ONE batch writing the programme doc + a deterministic workout id", async () => {
    seedProgramWithDay();
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });

    await act(async () => {
      await result.current.completeWorkoutDay(0, session("cid-1"));
    });

    expect(batchCommits()).toHaveLength(1);
    const ids = batchCommits()[0].map((s) => s.ref.__id);
    // Programme doc (PROGRAM_DOC = "current") + deterministic workout id.
    expect(ids).toContain("current");
    expect(ids).toContain("programme-cid-1");
    // Local programme state flipped the day to completed only after commit.
    expect(result.current.programState?.workouts[0].completed).toBe(true);
  });

  it("Lift3: the workout doc is dated by when the session STARTED, not by Finish", async () => {
    seedProgramWithDay();
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });

    // Started 36 hours ago — a session that crossed midnight (or a resumed
    // draft) belongs to the day it began.
    const startedAt = Date.now() - 36 * 3600 * 1000;
    await act(async () => {
      await result.current.completeWorkoutDay(0, {
        ...session("cid-start"),
        startedAt,
      });
    });
    const workout = batchCommits()[0].find(
      (w) => w.ref.__id === "programme-cid-start"
    )!;
    expect(workout.data.date).toBe(localDateString(new Date(startedAt)));
    expect(workout.data.date).not.toBe(localDateString());
  });

  it("a rejected commit throws and does NOT mark the day completed locally", async () => {
    seedProgramWithDay();
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });

    failNextFirestore("commit");
    await expect(
      result.current.completeWorkoutDay(0, session("cid-2"))
      // The fake generates the message from the injected code, so match
      // that rather than the old stub's bespoke string. What the test
      // pins is unchanged: the rejection propagates to the caller.
    ).rejects.toThrow(/permission-denied/);
    // No split state: the day is still not completed in local state.
    expect(result.current.programState?.workouts[0].completed).toBe(false);
  });

  it("persists sessionVariant on the PRIVATE workout doc — easier_today saves truthfully (PROGRAM-ADAPT-01)", async () => {
    seedProgramWithDay();
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });

    await act(async () => {
      await result.current.completeWorkoutDay(0, {
        ...session("cid-easier"),
        sessionVariant: "easier_today",
        // Reduced execution: only 2 of the 3 prescribed sets performed.
        setLogs: [
          [
            { weight: 85, reps: 5, completed: true },
            { weight: 85, reps: 5, completed: true },
          ],
        ],
      });
    });

    const workoutWrite = batchCommits()
      .flat()
      .find((s) => s.ref.__id === "programme-cid-easier");
    expect(workoutWrite).toBeTruthy();
    const doc = workoutWrite!.data as {
      sessionVariant?: string;
      exercises: { sets: { weightKg: number }[] }[];
    };
    // The variant lands on the private record…
    expect(doc.sessionVariant).toBe("easier_today");
    // …and only the sets ACTUALLY performed are saved (2, at the
    // reduced load), never the planned prescription.
    expect(doc.exercises[0].sets).toHaveLength(2);
    expect(doc.exercises[0].sets.every((s) => s.weightKg === 85)).toBe(true);
    // The STORED prescription is untouched by completion (sets/weight
    // unchanged — an easier session never rewrites the plan).
    const ex = result.current.programState?.workouts[0].exercises[0];
    expect(ex?.sets).toBe(3);
    expect(ex?.weight).toBe(100);
  });

  it("a retry with the same completionId targets the same workout doc (idempotent)", async () => {
    seedProgramWithDay();
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });

    await act(async () => {
      await result.current.completeWorkoutDay(0, session("cid-3"));
      await result.current.completeWorkoutDay(0, session("cid-3"));
    });
    const workoutIds = batchCommits()
      .flat()
      .map((s) => s.ref.__id)
      .filter((id) => typeof id === "string" && id.startsWith("programme-"));
    // Both retries used the SAME deterministic id — no Date.now() duplicate.
    expect(new Set(workoutIds)).toEqual(new Set(["programme-cid-3"]));
  });
});

// ─── PROGRAM-SESSION-ORDER-01 — setNextWorkout cursor override ───────

describe("PROGRAM-SESSION-ORDER-01 — setNextWorkout writer contract", () => {
  const day = (
    name: string,
    flags: Partial<{ completed: boolean; skipped: boolean }> = {}
  ) =>
    ({
      dayName: name,
      exercises: [],
      completed: false,
      skipped: false,
      ...flags,
    }) as unknown as ProgramState["workouts"][number];

  function seedLiftState(extra: Partial<ProgramState> = {}) {
    mockProfile = structuredProfile();
    seedProgram({
      goal: "recomp",
      currentPhase: "base",
      weekNumber: 1,
      splitType: "ppl",
      workouts: [day("Push", { completed: true }), day("Pull"), day("Legs")],
      fatigueScore: 0,
      updatedAt: Date.now(),
      settings: { autoProgression: true, microloading: true },
      weekHistory: [],
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      runDays: [],
      runPlan: { mode: "freeform" },
      ...extra,
    } as ProgramState);
  }

  async function mount() {
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();
    return result;
  }

  it("sets the override via a setNextWorkout COMMAND (P6)", async () => {
    seedLiftState();
    sentCommands.length = 0;
    const result = await mount();
    await act(async () => {
      await result.current.setNextWorkout(2);
    });
    const sent = sentCommands.find((c) => c.kind === "setNextWorkout");
    expect(sent).toBeDefined();
    expect(sent?.dayIndex).toBe(2);
    // Asserting the COMMAND, not the resulting state: on success the hook
    // refetches the authoritative document, and the mocked sender never
    // applied anything to it — so the post-command state is the seed, which is
    // correct here and says nothing. The optimistic-then-refetch behaviour is
    // covered in `useProgramCommandBoundary.test.ts`, which can hold the send
    // open and observe it.
  });

  it("ignores terminal and out-of-range selections (no write)", async () => {
    seedLiftState();
    const result = await mount();
    await act(async () => {
      await result.current.setNextWorkout(0); // completed day
      await result.current.setNextWorkout(9); // out of range
      await result.current.setNextWorkout(1.5); // malformed
    });
    expect(setDocCalls().length).toBe(0);
  });

  it("null resets via a clearNextWorkout COMMAND, dropping the field", async () => {
    // P6: this used to assert the persisted document. The writer no longer
    // writes one — it sends a command, and the reset needed its own kind
    // because `setNextWorkout`'s dayIndex is part of the day precondition and
    // cannot express "no day". What must still hold is that the field is
    // REMOVED rather than left holding a stale value.
    seedLiftState({ nextWorkoutOverride: 2 });
    sentCommands.length = 0;
    const result = await mount();
    await act(async () => {
      await result.current.setNextWorkout(null);
    });
    expect(sentCommands.map((c) => c.kind)).toContain("clearNextWorkout");
    // The command carries no dayIndex — that is the whole reason it exists
    // rather than a nullable `setNextWorkout`.
    const clear = sentCommands.find((c) => c.kind === "clearNextWorkout");
    expect("dayIndex" in (clear ?? {})).toBe(false);
  });

  it("null with no active override is a no-op (no write)", async () => {
    seedLiftState();
    const result = await mount();
    await act(async () => {
      await result.current.setNextWorkout(null);
    });
    expect(setDocCalls().length).toBe(0);
  });
});

describe("RUN-RACE-GUARD-01 — race identity is immutable in the writers", () => {
  function seedRaceDay() {
    const targetDate = "2027-01-01";
    mockProfile = raceProfile(targetDate);
    seedProgram({
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
      // A valid V2 race run day so the load preserves it (no regen).
      runDays: [
        {
          id: "race_day_1",
          dayIndex: 3,
          date: "2027-01-01",
          weekKey: "2026-12-27",
          templateId: "10k_race",
          type: "race",
          status: "planned",
        } as ScheduledRunDay,
      ],
      runPlan: { mode: "race_prep", raceGoal: { distance: "10k", targetDate } },
    } as ProgramState);
  }

  it("overrideRunDay refuses to swap a scheduled race (no write)", async () => {
    seedRaceDay();
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites(); // capture only writes after this point

    await act(async () => {
      await result.current.overrideRunDay("race_day_1", "easy_30");
    });

    expect(setDocCalls().length).toBe(0);
  });

  it("markManualComplete refuses a scheduled race (no write)", async () => {
    seedRaceDay();
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.markManualComplete("race_day_1");
    });

    expect(setDocCalls().length).toBe(0);
  });
});

// ─── SESSION-RESTORE-01 — a skip is a reversible decision ────────────

describe("SESSION-RESTORE-01 — restore writers reverse a skip", () => {
  function stateWith(
    runDays: ScheduledRunDay[],
    workouts: any[] = []
  ): ProgramState {
    return {
      goal: "recomp",
      currentPhase: "base",
      weekNumber: 1,
      splitType: "ppl",
      workouts,
      fatigueScore: 0,
      updatedAt: Date.now(),
      settings: { autoProgression: true, microloading: true },
      weekHistory: [],
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      runDays,
      runPlan: { mode: "structured" },
    } as ProgramState;
  }

  // Anchor to today's week so the auto-rollover effect doesn't
  // regenerate runDays (which would wipe the hard-coded id).
  function skippedRunDay(status: "skipped" | "race_no_show"): ScheduledRunDay {
    return {
      id: "runday_restore_1",
      dayIndex: new Date().getDay(),
      date: localDateString(addLocalDays(new Date(), 0)),
      weekKey: localWeekKey(),
      templateId: "easy_30",
      type: "easy",
      completed: false,
      status,
    } as ScheduledRunDay;
  }

  it("restoreRunDay: skipped → planned, completed:false, no manual-completion key", async () => {
    mockProfile = raceProfile("2099-09-15");
    seedProgram(stateWith([skippedRunDay("skipped")]));
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.restoreRunDay("runday_restore_1");
    });

    // Through the command boundary: no direct write, one addressed command.
    expect(setDocCalls().length).toBe(0);
    const cmd = sentCommands.find((c) => c.kind === "transitionRunDay");
    expect(cmd).toBeDefined();
    expect(cmd?.runDayId).toBe("runday_restore_1");
    expect(cmd?.to).toBe("planned");
    // Restore is a pure status reversal — the command carries no
    // completion intent, and the reducer's own `completed: false` mirror is
    // pinned server-side in programCommands.test.js.
    expect(cmd).not.toHaveProperty("completed");
    // Nothing else was sent — a restore must not also mark the slot done.
    expect(sentCommands.map((c) => c.kind)).toEqual(["transitionRunDay"]);
  });

  it("restoreRunDay: race_no_show → planned", async () => {
    mockProfile = raceProfile("2099-09-15");
    seedProgram(stateWith([skippedRunDay("race_no_show")]));
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.restoreRunDay("runday_restore_1");
    });

    expect(setDocCalls().length).toBe(0);
    const cmd = sentCommands.find((c) => c.kind === "transitionRunDay");
    expect(cmd?.runDayId).toBe("runday_restore_1");
    expect(cmd?.to).toBe("planned");
  });

  it("restoreRunDay: refuses a completed slot (terminal → no write)", async () => {
    mockProfile = raceProfile("2099-09-15");
    seedProgram(
      stateWith([
        {
          id: "runday_restore_1",
          dayIndex: new Date().getDay(),
          date: localDateString(addLocalDays(new Date(), 0)),
          weekKey: localWeekKey(),
          templateId: "easy_30",
          type: "easy",
          completed: true,
          status: "completed_exact",
        } as ScheduledRunDay,
      ])
    );
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.restoreRunDay("runday_restore_1");
    });

    expect(setDocCalls().length).toBe(0);
  });

  it("restoreWorkoutDay: clears `skipped` on a non-completed lift day", async () => {
    mockProfile = structuredProfile();
    seedProgram(
      stateWith(
        [],
        [
          {
            dayName: "Push",
            dayType: "lift",
            exercises: [],
            completed: false,
            skipped: true,
          },
        ]
      )
    );
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.restoreWorkoutDay(0);
    });

    // Through the boundary now (P6), paired with skipWorkoutDay so the set
    // and the reset share one write path. The command carries only the day
    // precondition — WHAT to restore is the day's own `skipped` flag, which
    // the reducer reads from its copy; the clearing itself is pinned
    // server-side in programCommands.test.js.
    expect(setDocCalls().length).toBe(0);
    const cmd = sentCommands.find((c) => c.kind === "restoreWorkoutDay");
    expect(cmd).toBeDefined();
    expect(cmd?.dayIndex).toBe(0);
    expect(cmd?.expectedWeekNumber).toBe(1);
    expect(typeof cmd?.expectedDaySignature).toBe("string");
  });

  it("restoreWorkoutDay: refuses a completed lift day (no write)", async () => {
    mockProfile = structuredProfile();
    seedProgram(
      stateWith(
        [],
        [
          {
            dayName: "Push",
            dayType: "lift",
            exercises: [],
            completed: true,
            skipped: false,
          },
        ]
      )
    );
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.restoreWorkoutDay(0);
    });

    expect(setDocCalls().length).toBe(0);
  });
});

// ─── RUN-RESCHEDULE-01 — move the plan, not the goalposts ────────────

describe("RUN-RESCHEDULE-01 — moveRunDay", () => {
  function stateWith(runDays: ScheduledRunDay[]): ProgramState {
    return {
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
      runDays,
      runPlan: { mode: "structured" },
    } as ProgramState;
  }

  const today = new Date().getDay();
  const target = (today + 3) % 7; // guaranteed different day, same week

  function plannedToday(
    overrides: Partial<ScheduledRunDay> = {}
  ): ScheduledRunDay {
    return {
      id: "runday_move_1",
      dayIndex: today,
      date: localDateString(addLocalDays(new Date(), 0)),
      weekKey: localWeekKey(),
      templateId: "easy_30",
      type: "easy",
      completed: false,
      status: "planned",
      ...overrides,
    } as ScheduledRunDay;
  }

  async function run(
    runDays: ScheduledRunDay[],
    call: (api: any) => Promise<void>
  ) {
    mockProfile = raceProfile("2099-09-15");
    seedProgram(stateWith(runDays));
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();
    await act(async () => {
      await call(result.current);
    });
  }

  it("moves date + dayIndex and stamps movedFromDate; preserves id/template/status", async () => {
    await run([plannedToday()], (api) =>
      api.moveRunDay("runday_move_1", target)
    );
    // P6: through the boundary. The command names the run and the day and
    // NOTHING else — the date, both move markers and the clash flag are
    // re-derived server-side from the run's own week anchor, so a client
    // cannot place a run outside its week. Where the run lands is pinned in
    // programCommands.test.js and the two copies agree by
    // runReschedule.cross.test.ts; what this owns is that the client stopped
    // writing the document and stopped asserting the destination.
    expect(setDocCalls().length).toBe(0);
    const cmd = sentCommands.find((c) => c.kind === "moveRunDay");
    expect(cmd).toBeDefined();
    expect(Object.keys(cmd!).sort()).toEqual([
      "commandId",
      "kind",
      "runDayId",
      "targetDayIndex",
    ]);
    expect(cmd?.runDayId).toBe("runday_move_1");
    expect(cmd?.targetDayIndex).toBe(target);
  });

  /* The three refusals now assert NO COMMAND as well as no write. Checking
     only `setDocCalls()` would pass trivially post-migration — this writer no
     longer writes documents at all — so each of these would have kept its
     green tick while sending the refused move to the server. The reducer
     refuses them too (programCommands.test.js), but a client that fires a
     doomed command has still lost its guard. */
  it("refuses to move a race slot (immovable identity)", async () => {
    await run([plannedToday({ type: "race", templateId: "10k_race" })], (api) =>
      api.moveRunDay("runday_move_1", target)
    );
    expect(setDocCalls().length).toBe(0);
    expect(sentCommands.filter((c) => c.kind === "moveRunDay")).toEqual([]);
  });

  it("refuses to move a skipped (non-editable) slot", async () => {
    await run([plannedToday({ status: "skipped" })], (api) =>
      api.moveRunDay("runday_move_1", target)
    );
    expect(setDocCalls().length).toBe(0);
    expect(sentCommands.filter((c) => c.kind === "moveRunDay")).toEqual([]);
  });

  it("refuses to double-book an occupied day", async () => {
    await run(
      [plannedToday(), plannedToday({ id: "other", dayIndex: target })],
      (api) => api.moveRunDay("runday_move_1", target)
    );
    expect(setDocCalls().length).toBe(0);
    expect(sentCommands.filter((c) => c.kind === "moveRunDay")).toEqual([]);
  });
});

/* ─── D1 · the lift week rolls over on the calendar ─────────────────────
   The defect these pin: the auto-rollover keyed on `runDays[0].weekKey` and
   returned early for freeform users, so a pure lifter had no automatic
   rollover at all. Their only other path was a manual button gated on EVERY
   day being completed-or-skipped — so missing one Friday and never tapping
   "skip" froze the programme on week N permanently. No deload, no adjustment
   rule, no mesocycle rotation, forever.

   Deliberately driven through the real hook rather than `advanceWeek`
   directly: `advanceWeek` was never broken. The bug was that nothing called
   it, which is exactly the class of failure ADR-0008 exists for
   ("reachability over prose"). A unit test of the engine passes on the
   broken build. ── */
describe("auto week-rollover for a freeform lifter (D1)", () => {
  /** A lifter: no run mode, no runDays, one incomplete day — the state that
   *  used to freeze forever. */
  function frozenLifter(liftWeekKey: string | undefined): ProgramState {
    return {
      goal: "recomp",
      currentPhase: "progression",
      weekNumber: 3,
      splitType: "upper_lower",
      fatigueScore: 0,
      updatedAt: 0,
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      ...(liftWeekKey ? { liftWeekKey } : {}),
      workouts: [
        {
          dayName: "Upper",
          dayType: "push",
          completed: true,
          exercises: [],
        },
        // Never completed, never skipped — the whole point.
        {
          dayName: "Lower",
          dayType: "legs",
          completed: false,
          exercises: [],
        },
      ],
    } as unknown as ProgramState;
  }

  const lifterProfile = (): MockProfile => ({
    uid: "test-user-1",
    weekSchedule: generateSchedule(4, 0),
    weekScheduleVersion: 1,
    weeklyWorkoutsTarget: 4,
    weeklyRunDaysTarget: 0,
    primaryGoal: "hypertrophy",
    // No runMode at all — the modal pure lifter.
  });

  /** Three calendar weeks behind. */
  const staleKey = () =>
    localWeekKey(addLocalDays(parseLocalDate(localWeekKey()), -21));

  it("advances a stale lifter even with a day left incomplete", async () => {
    mockProfile = lifterProfile();
    resetFirestore();
    seedProgram(frozenLifter(staleKey()));

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });

    await waitFor(
      () => {
        const writes = setDocCalls();
        const last = writes[writes.length - 1]?.data as ProgramState;
        expect(last?.liftWeekKey).toBe(localWeekKey());
      },
      { timeout: 2000 }
    );

    const last = setDocCalls()[setDocCalls().length - 1].data as ProgramState;
    // Three weeks stale → three CALENDAR rollovers, and the anchor above
    // confirms all three ran. The BLOCK moves once: only the first of those
    // weeks had a completed session (`advanceWeek` clears the flags for each
    // new week), so 3 → 4 and then it holds.
    //
    // That is the point of the test as named — an incomplete day does not
    // BLOCK the rollover — and it is the fix for a returning lifter landing
    // on the top of the volume ramp. See ADR-0002: lifts are split-ordered,
    // not calendar-pinned.
    expect(last.weekNumber).toBe(4);
    // …and the week that WAS trained is archived rather than silently dropped.
    expect(last.weekHistory?.length).toBe(1);
  });

  it("does nothing when the anchor is already the current week", async () => {
    mockProfile = lifterProfile();
    resetFirestore();
    seedProgram(frozenLifter(localWeekKey()));

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();
    await new Promise((r) => setTimeout(r, 50));

    // Anchored on a positive first (loading flipped above), then asserting no
    // FURTHER writes — a bare "expect nothing" would be satisfied at t=0.
    expect(setDocCalls().filter((_, i) => i >= writeMark).length).toBe(0);
  });

  it("does nothing for a pre-D1 doc with no anchor (migration seeds it first)", async () => {
    // Absent must never read as "stale since the epoch" — that would roll a
    // returning user forward by the whole iteration cap on first open.
    mockProfile = lifterProfile();
    resetFirestore();
    seedProgram(frozenLifter(undefined));

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });

    const writes = setDocCalls();
    const last = writes[writes.length - 1]?.data as ProgramState | undefined;
    // The migration seeds today; the rollover then finds nothing to do.
    expect(last?.weekNumber ?? 3).toBe(3);
  });
});

/* ─── D2 · the per-set evidence reaches Firestore ───────────────────────
   The unit tests above prove the projection is correct in isolation. This
   proves the whole write path carries it, which is the thing that was broken:
   every hop existed and worked, and the data still died at
   `toCompletionSetLogs` one function before the batch commit.

   None of this is backfillable — every workout document ever written has
   three fields per set, and `applyProgression` overwrites the prescription
   immediately after each session — so the value of this change is entirely in
   the clock it starts. Nothing reads these fields yet, by design. ── */
describe("per-set evidence survives the save (D2)", () => {
  it("writes set type, RPE and the planned pair onto the workout doc", async () => {
    mockProfile = structuredProfile({ runMode: "freeform" });
    resetFirestore();

    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 2000,
    });
    markWrites();

    await act(async () => {
      await result.current.completeWorkoutDay(0, {
        completionId: "abcdefgh",
        completionCommandId: "abcdefghabcdefgh",
        durationMinutes: 45,
        // Fed through the REAL capture boundary rather than hand-built.
        // A hand-built payload skips `toCompletionSetLogs` — which is where
        // the evidence was being destroyed — so the assertions below would
        // pass against the broken build. (They did, on the first attempt;
        // the mutation check is what caught it.) The warm-up row is here to
        // prove the filter that must NOT change still fires.
        setLogs: toCompletionSetLogs([
          [
            { weight: 40, reps: 5, completed: true, type: "warmup", rpe: 4 },
            { weight: 100, reps: 8, completed: true, type: "working", rpe: 8 },
            { weight: 60, reps: 12, completed: true, type: "dropset" },
          ],
        ]),
      });
    });

    const workoutWrite = batchCommits()
      .flat()
      .find((w) => w.ref.path.includes("/workouts/"));

    expect(workoutWrite).toBeDefined();
    const ex = (
      workoutWrite!.data!.exercises as Array<{
        sets: Array<Record<string, unknown>>;
        plannedSetCount?: number;
      }>
    )[0];

    expect(ex.sets[0]).toMatchObject({
      reps: 8,
      weightKg: 100,
      type: "working",
      rpe: 8,
    });
    // The prescription the set was executed against — destroyed by
    // applyProgression a moment later, so unrecoverable from any later read.
    expect(ex.sets[0].plannedReps).toBeTypeOf("number");
    expect(ex.sets[0].plannedWeightKg).toBeTypeOf("number");
    // A drop set is PERSISTED (it is real work) even though D3 bars it from
    // driving progression.
    expect(ex.sets[1]).toMatchObject({ type: "dropset", weightKg: 60 });
    // Planned-vs-completed set count, recorded additively.
    expect(ex.plannedSetCount).toBeTypeOf("number");

    // Session-level provenance, so a consumer can tell whose RPE this is.
    expect(workoutWrite!.data!.rpeProvenance).toMatchObject({
      shownByDefault: expect.any(Boolean),
    });
  });
});
