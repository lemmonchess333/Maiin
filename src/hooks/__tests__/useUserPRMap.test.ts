/**
 * useUserPRMap — the compare sheet's PR lookup.
 *
 * The hook's whole design is about NOT re-reading: a module-level cache
 * keyed by uid, plus an in-flight map so two simultaneous mounts share one
 * fetch. The feed renders many ActivityCards, each of which can open
 * compare, so a per-card read would be the thing this exists to avoid.
 *
 * Neither property is expressible against a stub that returns a canned
 * array — "did it read twice?" is a question about the store, not about the
 * returned value. Both are asserted here by arming a failure on the read
 * and checking whether it fired: a cache hit leaves it UNFIRED.
 *
 * There is no cache-reset hook, so each test uses its own uid rather than
 * reaching into module state. That keeps the test honest about the cache
 * rather than pretending it away.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));

import { useUserPRMap } from "../useUserPRMap";
import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

function session(date: string, weightKg: number, reps: number) {
  return {
    date,
    exercises: [{ exerciseName: "Bench Press", sets: [{ weightKg, reps }] }],
  };
}

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
});

describe("useUserPRMap", () => {
  it("builds a PR map from the user's workouts", async () => {
    seedFirestore({
      "users/pr-basic/workouts/w1": session("2026-07-01", 100, 5),
      "users/pr-basic/workouts/w2": session("2026-07-08", 110, 5),
    });
    const { result } = renderHook(() => useUserPRMap("pr-basic"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(false);
    expect(result.current.prMap?.["Bench Press"]?.["5rm"]).toMatchObject({
      weight: 110,
    });
  });

  it("does NOT re-read for a second consumer of the same uid", async () => {
    // The reason the cache exists: the feed renders many cards, each able
    // to open compare. A second mount must be free.
    seedFirestore({
      "users/pr-cache/workouts/w1": session("2026-07-01", 100, 5),
    });
    const first = renderHook(() => useUserPRMap("pr-cache"));
    await waitFor(() => expect(first.result.current.loading).toBe(false));

    // Arm a failure AFTER the first fetch. If the second mount read, it
    // would consume this and error.
    failNextFirestore("getDocs", { path: "users/pr-cache/workouts" });
    const second = renderHook(() => useUserPRMap("pr-cache"));
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    expect(second.result.current.error).toBe(false);
    expect(second.result.current.prMap).not.toBeNull();
    expect(unfiredFailures()).toHaveLength(1); // never read again
  });

  it("shares ONE fetch between two simultaneous mounts", async () => {
    // In-flight dedup: mounting both before either resolves must not cost
    // two reads.
    seedFirestore({
      "users/pr-inflight/workouts/w1": session("2026-07-01", 100, 5),
    });
    const a = renderHook(() => useUserPRMap("pr-inflight"));
    const b = renderHook(() => useUserPRMap("pr-inflight"));

    await waitFor(() => expect(a.result.current.loading).toBe(false));
    await waitFor(() => expect(b.result.current.loading).toBe(false));

    expect(a.result.current.prMap).toBe(b.result.current.prMap); // same object
  });

  it("skips entirely for a falsy uid", async () => {
    // Signed out, or the sheet rendered before auth resolves.
    failNextFirestore("getDocs");
    const { result } = renderHook(() => useUserPRMap(null));

    expect(result.current).toMatchObject({ prMap: null, loading: false });
    expect(unfiredFailures()).toHaveLength(1); // no read attempted
  });

  it("surfaces an error rather than an empty map", async () => {
    // An empty PR map and a failed read look identical downstream unless
    // the flag distinguishes them — compare would show "no PRs" for what is
    // actually a permission blip.
    seedFirestore({
      "users/pr-err/workouts/w1": session("2026-07-01", 100, 5),
    });
    failNextFirestore("getDocs", { path: "users/pr-err/workouts" });

    const { result } = renderHook(() => useUserPRMap("pr-err"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.prMap).toBeNull();
  });

  it("drops malformed workout documents", async () => {
    seedFirestore({
      "users/pr-malformed/workouts/ok": session("2026-07-01", 100, 5),
      "users/pr-malformed/workouts/bad": { note: "no date, no exercises" },
    });
    const { result } = renderHook(() => useUserPRMap("pr-malformed"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.prMap?.["Bench Press"]).toBeDefined();
  });
});
