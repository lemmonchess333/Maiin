// @vitest-environment jsdom — renders the hook; the rest of this directory
// runs in the fast node environment.
/**
 * Lift18: the engine rounds to `settings.loadUnit`, a copy of the profile's
 * `liftingWeightUnit`. useProgram puts the copy right whenever the two
 * differ, through the same command Settings would send, and never writes a
 * plan whose copy already agrees (missing reads kg on both sides).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- firebase mock surface */

import { createRequire } from "node:module";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { generateSchedule } from "@/lib/scheduleUtils";

import type { ProgramState } from "../programTypes";
import { CURRENT_PROGRAM_SCHEMA_VERSION } from "../programTypes";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  functions: {},
  auth: { currentUser: { uid: "test-user-1" } },
}));

import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";

// BOTH of these must be stable references. The sibling writer suite hoists
// `user` with the reason spelled out — "returning a new object literal every
// call would churn useProgram's useEffect deps and produce an infinite
// re-render loop in tests" — and `profile` is a dep of exactly the same
// callbacks, so an inline literal there hangs the suite identically. It did.
const stableUser = { uid: "test-user-1" };
const stableProfile: Record<string, unknown> = {
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
const stableRefreshProfile = vi.fn(async () => undefined);
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: stableUser,
    profile: stableProfile,
    updateProfile: stableUpdateProfile,
    // Added when skipRecoveryEarly migrated: the profile half of that
    // command lands server-side, so the hook re-reads it. A mock missing an
    // export the hook transitively needs is the same failure shape as the
    // useUid gap that only showed up in CI.
    refreshProfile: stableRefreshProfile,
  }),
  // Added by #1833, which split the uid onto its own context. `useProgram`
  // reaches it through `usePerformanceWeeks`, so a mock without it renders
  // nothing — and because that landed on main AFTER this branch forked, it
  // failed only in CI (which tests the merge) while passing locally.
  useUid: () => stableUser.uid,
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
vi.mock("date-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("date-fns")>()),
  format: vi.fn(() => "2026-05-12"),
}));

/** The command client is the seam — mocking it keeps the callable out and
 *  lets each failure mode be produced exactly. */
const sendProgramCommand = vi.fn(
  async (_command: Record<string, unknown>) => undefined
);
vi.mock("../programCommandClient", () => ({
  sendProgramCommand: (...args: unknown[]) =>
    (sendProgramCommand as any)(...args),
}));

/**
 * Every command this suite sends must be one the REAL server validator
 * accepts. Asserted in an afterEach rather than inside the mock because half
 * these tests replace the implementation with `mockRejectedValue` to exercise
 * the rejection paths — an implementation-side check would vanish exactly
 * where the interesting cases are.
 *
 * The gap this closes: the file already asserted the exact KEY SET of two
 * commands, with a comment noting the validator rejects unknown keys. It only
 * ever caught keys that were extra. Every one of these commands was missing
 * two REQUIRED precondition fields and would have been rejected in
 * production, and this suite — the one named for the boundary — read green.
 */
afterEach(() => {
  const cfRequire = createRequire(import.meta.url);
  const { assertClientProgramCommand } = cfRequire(
    "../../../../functions/lib/programCommands"
  ) as { assertClientProgramCommand: (c: unknown) => unknown };
  for (const [command] of sendProgramCommand.mock.calls) {
    try {
      assertClientProgramCommand(command);
    } catch (err) {
      throw new Error(
        `the server would REJECT this ${(command as { kind?: string })?.kind} ` +
          `command: ${(err as Error).message}\n` +
          JSON.stringify(command, null, 2)
      );
    }
  }
});

import { useProgram } from "../useProgram";
import { __resetCommandOutboxForTests } from "../commandOutbox";

const PROGRAM = "users/test-user-1/programState/current";

function seed(loadUnit?: "kg" | "lbs"): void {
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
          {
            name: "Bench Press",
            exerciseId: "bench-press",
            instanceId: "i-a",
            movementCategory: "horizontal_push",
            sets: 3,
            reps: 8,
            weight: 60,
            progressionType: "double",
          },
        ],
      },
    ],
    runDays: [],
    settings: {
      autoProgression: true,
      smallPlates: true,
      ...(loadUnit ? { loadUnit } : {}),
    },
  } as unknown as ProgramState;
  seedFirestore({ [PROGRAM]: state as unknown as Record<string, unknown> });
}

const settingsSent = () =>
  sendProgramCommand.mock.calls
    .map(([command]) => command as Record<string, unknown>)
    .filter((command) => command.kind === "setProgramSettings");

async function mounted(loadUnit?: "kg" | "lbs") {
  seed(loadUnit);
  const hook = renderHook(() => useProgram());
  await waitFor(() =>
    expect(
      (hook.result.current.programState as ProgramState | null)
        ?.programSchemaVersion
    ).toBe(CURRENT_PROGRAM_SCHEMA_VERSION)
  );
  return hook;
}

beforeEach(() => {
  resetFirestore();
  __resetCommandOutboxForTests();
  sendProgramCommand.mockReset();
  sendProgramCommand.mockResolvedValue(undefined);
  delete stableProfile.liftingWeightUnit;
});

describe("the plan's copy of the lifting unit", () => {
  it("follows a profile switched to lb, keeping the other settings", async () => {
    stableProfile.liftingWeightUnit = "lbs";
    await mounted();
    await waitFor(() => expect(settingsSent()).toHaveLength(1));
    // The command is the write; the mocked server applies nothing, so the
    // plan re-read after it is the seeded one.
    expect(settingsSent()[0].settings).toEqual({
      autoProgression: true,
      smallPlates: true,
      loadUnit: "lbs",
    });
  });

  it("follows a profile switched back to kg", async () => {
    stableProfile.liftingWeightUnit = "kg";
    await mounted("lbs");
    await waitFor(() => expect(settingsSent()).toHaveLength(1));
    expect((settingsSent()[0].settings as { loadUnit?: string }).loadUnit).toBe(
      "kg"
    );
  });

  it("writes nothing when neither side has the setting", async () => {
    await mounted();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(settingsSent()).toHaveLength(0);
  });

  it("writes nothing when the copy already agrees", async () => {
    stableProfile.liftingWeightUnit = "lbs";
    await mounted("lbs");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(settingsSent()).toHaveLength(0);
  });

  it("does not send again after a refusal, and says nothing", async () => {
    const { toast } = await import("sonner");
    stableProfile.liftingWeightUnit = "lbs";
    sendProgramCommand.mockRejectedValue(
      Object.assign(new Error("failed-precondition"), {
        code: "failed-precondition",
      })
    );
    await mounted();
    await waitFor(() => expect(settingsSent()).toHaveLength(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(settingsSent()).toHaveLength(1);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
