// @vitest-environment jsdom — renders the hook; the rest of this directory
// runs in the fast node environment.
/**
 * The command boundary's client seam (P6).
 *
 * `reorderDayExercises` is the first writer migrated off `saveProgram`, and it
 * is the shape every later one copies. What has to be true:
 *
 *   - the UI does not wait for the server (optimistic first);
 *   - a TRANSPORT failure keeps the change and queues it, because the command
 *     is durable and the server dedupes on `commandId`;
 *   - a server REJECTION rolls back, because that is the only case where the
 *     user's change is genuinely not happening;
 *   - a document with no persisted `instanceId`s falls back to a direct write
 *     rather than sending a command the reducer must reject.
 *
 * The last one is the non-obvious hazard. `instanceId` is assigned lazily by
 * `normalizeExercise` on READ, so the client sees ids the server's copy may not
 * have — and `reorderExercises` refuses anything but an exact permutation of
 * the ids it holds. Without the fallback, drag-and-drop would break for every
 * user whose document predates the field.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- firebase mock surface */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { generateSchedule } from "@/lib/scheduleUtils";

import type { ProgramState } from "../programTypes";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));

import {
  seedFirestore,
  resetFirestore,
  writeLog,
} from "@/test/firestoreHarness";

// BOTH of these must be stable references. The sibling writer suite hoists
// `user` with the reason spelled out — "returning a new object literal every
// call would churn useProgram's useEffect deps and produce an infinite
// re-render loop in tests" — and `profile` is a dep of exactly the same
// callbacks, so an inline literal there hangs the suite identically. It did.
const stableUser = { uid: "test-user-1" };
const stableProfile = {
  uid: "test-user-1",
  primaryGoal: "hypertrophy",
  weekSchedule: generateSchedule(3, 0),
  weekScheduleVersion: 1,
  weeklyWorkoutsTarget: 3,
  weeklyRunDaysTarget: 0,
  weeklyRunsTarget: 0,
  runMode: "freeform",
};
const stableUpdateProfile = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: stableUser,
    profile: stableProfile,
    updateProfile: stableUpdateProfile,
  }),
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

/** The command client is the seam — mocking it keeps the callable out and
 *  lets each failure mode be produced exactly. */
const sendProgramCommand = vi.fn(
  async (_command: Record<string, unknown>) => undefined
);
vi.mock("../programCommandClient", () => ({
  sendProgramCommand: (...args: unknown[]) =>
    (sendProgramCommand as any)(...args),
}));

import { useProgram } from "../useProgram";
import { __resetCommandOutboxForTests, outboxLength } from "../commandOutbox";

const PROGRAM = "users/test-user-1/programState/current";

const ex = (instanceId: string | undefined, name: string) => ({
  name,
  exerciseId: name.toLowerCase(),
  instanceId,
  movementCategory: "horizontal_push",
  sets: 3,
  reps: 8,
  weight: 60,
  progressionType: "double",
  lastSuccessfulWeight: 60,
  lastAttemptedWeight: 60,
  consecutiveFailures: 0,
  plateauCount: 0,
  performanceHistory: [],
  lastPerformance: null,
});

function seed(withIds: boolean): void {
  const state = {
    weekNumber: 1,
    splitType: "upper_lower",
    goal: "recomp",
    workouts: [
      {
        dayName: "Push",
        dayType: "upper",
        completed: false,
        exercises: [
          ex(withIds ? "i-a" : undefined, "Alpha"),
          ex(withIds ? "i-b" : undefined, "Bravo"),
          ex(withIds ? "i-c" : undefined, "Charlie"),
        ],
      },
    ],
    runDays: [],
    settings: { autoProgression: true, microloading: true },
  } as unknown as ProgramState;
  seedFirestore({ [PROGRAM]: state as unknown as Record<string, unknown> });
}

async function mounted(withIds = true) {
  seed(withIds);
  const hook = renderHook(() => useProgram());
  await waitFor(() => expect(hook.result.current.programState).toBeTruthy());
  return hook;
}

const names = (hook: { result: { current: { programState: unknown } } }) =>
  (hook.result.current.programState as ProgramState).workouts[0].exercises.map(
    (e) => e.name
  );

const callableError = (code: string) =>
  Object.assign(new Error(code), { code });

beforeEach(() => {
  resetFirestore();
  __resetCommandOutboxForTests();
  sendProgramCommand.mockReset();
  sendProgramCommand.mockResolvedValue(undefined);
});

describe("reorderDayExercises — the migrated writer", () => {
  it("sends a reorderExercises command instead of writing the document", async () => {
    const hook = await mounted();
    const before = writeLog().length;

    await act(async () => {
      await hook.result.current.reorderDayExercises(0, ["i-c", "i-a", "i-b"]);
    });

    expect(sendProgramCommand).toHaveBeenCalledTimes(1);
    const sent = sendProgramCommand.mock.calls[0][0] as any;
    expect(sent.kind).toBe("reorderExercises");
    expect(sent.dayIndex).toBe(0);
    expect(sent.orderedInstanceIds).toEqual(["i-c", "i-a", "i-b"]);
    expect(typeof sent.commandId).toBe("string");
    // The whole point: the client no longer writes the document itself.
    expect(writeLog().length).toBe(before);
  });

  it("applies the new order locally before the server answers", async () => {
    // The UX property that justified the optimistic path at all — a drag that
    // waits on a round trip is a worse app than one that does not.
    const hook = await mounted();
    let release: (() => void) | undefined;
    sendProgramCommand.mockImplementation(
      () => new Promise<undefined>((r) => (release = () => r(undefined)))
    );

    let pending: Promise<boolean> | undefined;
    await act(async () => {
      pending = hook.result.current.reorderDayExercises(0, [
        "i-c",
        "i-a",
        "i-b",
      ]);
    });
    expect(names(hook)).toEqual(["Charlie", "Alpha", "Bravo"]);

    await act(async () => {
      release?.();
      await pending;
    });
  });

  it("QUEUES on a transport failure and keeps the change", async () => {
    sendProgramCommand.mockRejectedValue(
      callableError("functions/unavailable")
    );
    const hook = await mounted();

    await act(async () => {
      await hook.result.current.reorderDayExercises(0, ["i-c", "i-a", "i-b"]);
    });

    expect(outboxLength("test-user-1")).toBe(1);
    // The intent stands — it replays on reconnect, and the server dedupes on
    // commandId — so rolling back here would discard a change that is going
    // to happen.
    expect(names(hook)).toEqual(["Charlie", "Alpha", "Bravo"]);
  });

  it("does NOT queue a rejected command", async () => {
    // The rollback itself is exercised by the fallback test below (reorder
    // repairs itself rather than leaving the state reverted). What must hold
    // regardless of the caller's recovery: a command the server refused never
    // enters the outbox, because it would fail identically on every flush.
    sendProgramCommand.mockRejectedValue(
      callableError("functions/failed-precondition")
    );
    const hook = await mounted();

    await act(async () => {
      await hook.result.current.reorderDayExercises(0, ["i-c", "i-a", "i-b"]);
    });

    expect(outboxLength("test-user-1")).toBe(0);
  });

  it("falls back to a direct write when the reducer refuses the permutation", async () => {
    // The legacy-document case. It CANNOT be pre-detected: `normalizeExercise`
    // assigns instanceIds on read, so the client always sees them and only the
    // server knows its copy lacks them. A first version of this guarded on
    // "do the exercises have ids?" and that guard never fired once — this test
    // is what found it.
    //
    // So the fallback is on the rejection, and the direct write also persists
    // the ids, which is what makes it self-heal in a single use.
    sendProgramCommand.mockRejectedValue(
      callableError("functions/failed-precondition")
    );
    const hook = await mounted();
    const before = writeLog().length;

    await act(async () => {
      await hook.result.current.reorderDayExercises(0, ["i-c", "i-a", "i-b"]);
    });

    expect(sendProgramCommand).toHaveBeenCalledTimes(1);
    expect(writeLog().length).toBeGreaterThan(before);
    // …and the reorder is what got written, not the rolled-back order.
    const written = writeLog()[writeLog().length - 1].data as any;
    expect(written.workouts[0].exercises.map((e: any) => e.name)).toEqual([
      "Charlie",
      "Alpha",
      "Bravo",
    ]);
  });
});
