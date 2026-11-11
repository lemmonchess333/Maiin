// @vitest-environment jsdom — renders the hook; the rest of this directory runs in the node environment.
/**
 * An easier week counts what the server committed, even when the callable
 * answers before the plan's live copy has the eased week.
 *
 * The count is read from the committed document's `easeSnapshot`. It was
 * read with `getDocFromServer`, which the SDK answers from the mirror's
 * listener when one is open on the same document: straight after the
 * callable, that could still be the week before the ease, so a saved
 * easier week said "Couldn't adjust the week. Try again." and kept its
 * sheet open (the run-coaching capture spec, 2026-11-01). The fake's
 * server read is always current, so the race is staged here the way it
 * happens: the callable answers first, the committed week lands after.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { generateSchedule } from "@/lib/scheduleUtils";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";
import { restoreRealTimers } from "@/test/fakeTimers";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  functions: {},
  auth: {
    get currentUser() {
      return USER;
    },
  },
}));

import {
  seedFirestore,
  resetFirestore,
  readDoc,
  resumeReads,
} from "@/test/firestoreHarness";

const USER = { uid: "userA" };

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: USER,
    profile: PROFILE,
    updateProfile: vi.fn(async () => ({ ok: true })),
    refreshProfile: vi.fn(async () => undefined),
  }),
  useUid: () => USER.uid,
}));

vi.mock("../programCommandClient", () => ({
  sendProgramCommand: vi.fn(async () => undefined),
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

import { useProgram } from "../useProgram";
import { sendProgramCommand } from "../programCommandClient";
import type { ProgramState } from "../programTypes";

const PATH = `users/${USER.uid}/programState/current`;
const PROFILE = {
  uid: USER.uid,
  weekSchedule: generateSchedule(3, 4),
  weekScheduleVersion: 1,
  weeklyWorkoutsTarget: 3,
  weeklyRunDaysTarget: 4,
  experience: "intermediate",
  runMode: "race_prep" as const,
  raceGoal: {
    distance: "half" as const,
    targetDate: localDateString(addLocalDays(new Date(), 10 * 7)),
  },
  primaryGoal: "running",
  program: { goal: "recomp" },
};

/** The hook's plan, loaded, and an ease of its first run. */
async function planWithRun() {
  const hook = renderHook(() => useProgram());
  await waitFor(() =>
    expect(hook.result.current.programState?.runDays?.length).toBeGreaterThan(0)
  );
  const before = readDoc(PATH) as unknown as ProgramState;
  const day = before.runDays![0];
  const toTemplateId = day.templateId === "easy_30" ? "easy_20" : "easy_30";
  const key = day.id != null ? String(day.id) : String(day.dayIndex);
  const eased: ProgramState = {
    ...before,
    runDays: before.runDays!.map((rd, i) =>
      i === 0
        ? { ...rd, templateId: toTemplateId, userOverride: toTemplateId }
        : rd
    ),
    easeSnapshot: {
      weekNumber: before.weekNumber,
      runDays: before.runDays!,
      appliedAt: Date.now(),
    },
  };
  return { hook, swaps: [{ key, toTemplateId }], eased };
}

/** The callable's answer, held until the test gives it. */
function holdCallable() {
  let answer!: () => void;
  vi.mocked(sendProgramCommand).mockImplementationOnce(
    () => new Promise<void>((resolve) => (answer = resolve))
  );
  return () => answer();
}

beforeEach(() => {
  resetFirestore();
  resumeReads();
  vi.mocked(sendProgramCommand).mockReset();
  vi.mocked(sendProgramCommand).mockResolvedValue(undefined);
});
afterEach(() => restoreRealTimers());

describe("an easier week, counted from the committed document", () => {
  it("waits for the eased week when the callable answers first", async () => {
    const { hook, swaps, eased } = await planWithRun();
    const answer = holdCallable();
    const landed = hook.result.current.applyEaseWeek(swaps);
    answer();
    // Long enough for an immediate read to have read the week before.
    await new Promise((resolve) => setTimeout(resolve, 20));
    seedFirestore({ [PATH]: eased as unknown as Record<string, unknown> });
    expect(await landed).toBe(1);
    await waitFor(() =>
      expect(hook.result.current.programState?.easeSnapshot).toBeDefined()
    );
  });

  it("gives up, and says so, when the eased week never arrives", async () => {
    const { hook, swaps } = await planWithRun();
    vi.useFakeTimers();
    const landed = hook.result.current.applyEaseWeek(swaps);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await landed).toBeNull();
  });
});
