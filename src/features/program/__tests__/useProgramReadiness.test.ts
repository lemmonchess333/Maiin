// @vitest-environment jsdom — renders the hook.
/**
 * `readiness`: when the plan the engine holds can be acted on.
 *
 * The engine paints the cached copy first, so `loading` turns false before
 * the server has answered. That copy is right to show and can be behind the
 * server (a rollover on another device, a run that started recovery), and a
 * write built on it is refused. The week rollovers have waited on the
 * server's copy since the Monday conflict (#2555); `readiness` hands the
 * same signal to callers, and Home's actions wait on it
 * (useHomeProgram.test.tsx).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { generateSchedule } from "@/lib/scheduleUtils";

const h = vi.hoisted(() => ({
  user: { uid: "userA" },
  profile: null as Record<string, unknown> | null,
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  functions: {},
  auth: {
    get currentUser() {
      return h.user;
    },
  },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: h.user,
    profile: h.profile,
    updateProfile: vi.fn(async () => ({ ok: true })),
    refreshProfile: vi.fn(async () => undefined),
  }),
  useUid: () => h.user.uid,
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

import {
  resetFirestore,
  resumeReads,
  deferReads,
  releaseAllReads,
  pendingReads,
  seedCache,
  seedFirestore,
  readDoc,
  writeLog,
  failNextFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";
import { useProgram } from "../useProgram";

const PROGRAM = "users/userA/programState/current";

beforeEach(() => {
  resetFirestore();
  resumeReads();
  // One object for the whole test: the load effect keys on its identity.
  h.profile = {
    uid: "userA",
    weekSchedule: generateSchedule(3, 0),
    weekScheduleVersion: 1,
    weeklyWorkoutsTarget: 3,
    runMode: "freeform",
    primaryGoal: "hypertrophy",
    program: { goal: "recomp" },
  };
});

describe("readiness", () => {
  it("is pending on the cached copy and ready once the server's is read", async () => {
    // A stored plan, built by a first visit.
    const first = renderHook(() => useProgram());
    await waitFor(() => expect(first.result.current.readiness).toBe("ready"));
    first.unmount();

    // The next visit paints from the cache while the server is slow.
    seedCache({ [PROGRAM]: readDoc(PROGRAM)! });
    deferReads();
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.programState).not.toBeNull());
    expect(result.current.loading).toBe(false);
    expect(result.current.readiness).toBe("pending");

    releaseAllReads();
    resumeReads();
    await waitFor(() => expect(result.current.readiness).toBe("ready"));
  });

  it("is failed when the server read fails", async () => {
    // Twice: the cache-first read takes the first (and is allowed to miss),
    // the server read the second.
    failNextFirestore("getDoc", {
      path: PROGRAM,
      code: "permission-denied",
      times: 2,
    });
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(result.current.readiness).toBe("failed"));
    expect(unfiredFailures()).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

describe("a rebuild waits for the server's copy", () => {
  /* `regenerateProgram` rebuilds from `programState`, and from scratch
     when it is null. While the programme loads it IS null, so a rebuild
     then was committed against no document while one exists, and refused
     as a conflict. The weekly-layout sheet's restructure confirm reached
     it from Settings, whose pages open before the programme has loaded. */
  it("refuses while the programme loads, then rebuilds on it", async () => {
    // The stored profile, which the rebuild's profile patch merges onto.
    seedFirestore({ "users/userA": h.profile! });
    // A stored plan, built by a first visit.
    const first = renderHook(() => useProgram());
    await waitFor(() => expect(first.result.current.readiness).toBe("ready"));
    first.unmount();
    const stored = readDoc(PROGRAM);
    const before = writeLog().length;

    // The next visit: nothing cached, and the server's answer held. The
    // rebuild's own reads answer; the loader's stays held.
    deferReads();
    const { result } = renderHook(() => useProgram());
    await waitFor(() => expect(pendingReads()).toContain(PROGRAM));
    resumeReads();
    expect(result.current.programState).toBeNull();
    expect(result.current.readiness).toBe("pending");

    let refused: unknown;
    await act(async () => {
      await result.current.regenerateProgram().catch((error: unknown) => {
        refused = error;
      });
    });
    // Refused for the right reason, before anything was built or sent.
    expect((refused as Error | undefined)?.message).toBe(
      "Wait for your programme to load, then try again."
    );
    expect(writeLog()).toHaveLength(before);
    expect(readDoc(PROGRAM)).toEqual(stored);

    releaseAllReads();
    await waitFor(() => expect(result.current.readiness).toBe("ready"));
    await act(async () => {
      await result.current.regenerateProgram();
    });
    expect(
      writeLog()
        .slice(before)
        .map((write) => write.path)
    ).toContain(PROGRAM);
  });
});
