/**
 * The three ways a saved session fails to appear are three states.
 *
 * Pre-fix, RunDetail had no `.catch()` and used `!run` as its loading
 * state, so every failure was an endless "Loading run"; WorkoutDetail
 * caught the error, discarded it, and reported the read failure as a
 * possibly-deleted workout. The distinction pinned here is the one those
 * pages could not make.
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
import { useSessionDoc } from "../useSessionDoc";
import {
  resetFirestore,
  seedFirestore,
  failNextFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

interface Run {
  id: string;
  distance?: number;
}

beforeEach(() => resetFirestore());
afterEach(() => vi.clearAllMocks());

describe("useSessionDoc", () => {
  it("reaches ready with the document and its id", async () => {
    seedFirestore({ "users/u1/runs/r1": { distance: 5000 } });
    const { result } = renderHook(() => useSessionDoc<Run>("u1", "runs", "r1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toEqual({ id: "r1", distance: 5000 });
  });

  it("calls an absent document MISSING, not failed", async () => {
    const { result } = renderHook(() => useSessionDoc<Run>("u1", "runs", "r1"));
    await waitFor(() => expect(result.current.status).toBe("missing"));
    expect(result.current.data).toBeNull();
  });

  it("calls a read error FAILED, not missing", async () => {
    // The whole point. A dropped connection must not be reported to the
    // user as a deleted session.
    seedFirestore({ "users/u1/runs/r1": { distance: 5000 } });
    failNextFirestore("getDoc", { code: "unavailable" });
    const { result } = renderHook(() => useSessionDoc<Run>("u1", "runs", "r1"));
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(unfiredFailures()).toEqual([]);
  });

  it("retry recovers once the read succeeds", async () => {
    seedFirestore({ "users/u1/runs/r1": { distance: 5000 } });
    failNextFirestore("getDoc", { code: "unavailable" });
    const { result } = renderHook(() => useSessionDoc<Run>("u1", "runs", "r1"));
    await waitFor(() => expect(result.current.status).toBe("failed"));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toEqual({ id: "r1", distance: 5000 });
  });

  it("retries a SECOND time after the first retry also fails", async () => {
    /* The counter exists for this. A boolean "retrying" flag would
       already be true after the first retry, so the effect would not
       re-run and the second tap would be a dead button — on exactly the
       flaky connection where a user taps more than once. */
    seedFirestore({ "users/u1/runs/r1": { distance: 5000 } });
    failNextFirestore("getDoc", { code: "unavailable", times: 2 });
    const { result } = renderHook(() => useSessionDoc<Run>("u1", "runs", "r1"));
    await waitFor(() => expect(result.current.status).toBe("failed"));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("failed"));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("stays LOADING while auth is still resolving", async () => {
    /* A null uid is the sign-in window, not a verdict — the route guards
       keep signed-out users off these pages. Reporting `missing` here
       would flash "not found" on every cold open. */
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string | null }) =>
        useSessionDoc<Run>(uid, "runs", "r1"),
      { initialProps: { uid: null as string | null } }
    );
    expect(result.current.status).toBe("loading");

    seedFirestore({ "users/u1/runs/r1": { distance: 5000 } });
    rerender({ uid: "u1" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("never shows one session's data under another's id", async () => {
    /* Navigating between two saved sessions reuses the hook. Without the
       key guard the previous document stays `ready` while the new read is
       in flight, so the page paints the OLD run's distance and splits
       under the new URL — and it looks like data, not like loading. */
    seedFirestore({
      "users/u1/runs/r1": { distance: 5000 },
      "users/u1/runs/r2": { distance: 10000 },
    });
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useSessionDoc<Run>("u1", "runs", id),
      { initialProps: { id: "r1" } }
    );
    await waitFor(() => expect(result.current.data?.distance).toBe(5000));

    rerender({ id: "r2" });
    // The instant after the switch: loading, and NOT still holding r1.
    expect(result.current.status).toBe("loading");
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.data?.distance).toBe(10000));
  });

  it("calls a malformed URL MISSING without reading", async () => {
    const { result } = renderHook(() =>
      useSessionDoc<Run>("u1", "runs", undefined)
    );
    await waitFor(() => expect(result.current.status).toBe("missing"));
  });
});
