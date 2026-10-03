/**
 * The shared saved-session engine (`useSavedSessions`), through both of its
 * sources: runs (`useSavedRuns`) and workouts.
 *
 * Its two readiness signals mean different things. `loading` is for
 * display: a session saved on this phone shows at once, so a queued one is
 * enough to stop loading. `answered` is for readers that save what they
 * derive (the streak): only the list itself answers. A streak counted from
 * the one queued session would overwrite the saved streak.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "runner" }));

import { useSavedRuns } from "../useSavedRuns";
import { useSavedSessions } from "../useSavedSessions";
import { SAVED_WORKOUTS } from "@/lib/savedWorkouts";
import { queueDurableWrite } from "@/lib/offlineQueue";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { savedRunDoc, savedWorkoutDoc } from "@/test/sessionFixtures";

const WINDOW = { latest: 10 } as const;

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  seedFirestore({
    "users/runner/runs/old": savedRunDoc("2026-09-01", { distance: 8000 }),
  });
});
afterEach(() => cleanup());

describe("useSavedRuns readiness", () => {
  it("shows a queued run before the list answers, without calling it an answer", async () => {
    queueDurableWrite(
      "runner",
      "users/runner/runs",
      "queued",
      savedRunDoc("2026-09-02", { distance: 5000 })
    );
    const seen: { ids: string[]; loading: boolean; answered: boolean }[] = [];
    const { result } = renderHook(() => {
      const value = useSavedRuns(WINDOW);
      seen.push({
        ids: value.runs.map((run) => run.id),
        loading: value.loading,
        answered: value.answered,
      });
      return value;
    });

    // The first render, before the live query has answered.
    expect(seen[0]).toEqual({
      ids: ["queued"],
      loading: false,
      answered: false,
    });
    await waitFor(() => expect(result.current.answered).toBe(true));
    expect(result.current.runs.map((run) => run.id)).toEqual(["queued", "old"]);
  });

  it("is loading and unanswered until the list answers when nothing is queued", async () => {
    const seen: { loading: boolean; answered: boolean }[] = [];
    const { result } = renderHook(() => {
      const value = useSavedRuns(WINDOW);
      seen.push({ loading: value.loading, answered: value.answered });
      return value;
    });
    expect(seen[0]).toEqual({ loading: true, answered: false });
    await waitFor(() => expect(result.current.answered).toBe(true));
    expect(result.current.loading).toBe(false);
  });
});

describe("the same engine for workouts", () => {
  it("shows a workout finished on this phone, and answers with the list", async () => {
    seedFirestore({
      "users/runner/workouts/synced": savedWorkoutDoc("2026-09-01"),
    });
    queueDurableWrite(
      "runner",
      "users/runner/workouts",
      "offline",
      savedWorkoutDoc("2026-09-02")
    );
    const seen: { ids: string[]; loading: boolean; answered: boolean }[] = [];
    const { result } = renderHook(() => {
      const value = useSavedSessions(SAVED_WORKOUTS, "runner", {
        latest: 10,
      });
      seen.push({
        ids: value.items.map((w) => w.id),
        loading: value.loading,
        answered: value.answered,
      });
      return value;
    });

    expect(seen[0]).toEqual({
      ids: ["offline"],
      loading: false,
      answered: false,
    });
    await waitFor(() => expect(result.current.answered).toBe(true));
    expect(result.current.items.map((w) => w.id)).toEqual([
      "offline",
      "synced",
    ]);
  });

  it("never shows one account's workouts under another", async () => {
    seedFirestore({
      "users/a/workouts/mine": savedWorkoutDoc("2026-09-01"),
    });
    const seen: { uid: string; ids: string[] }[] = [];
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string }) => {
        const value = useSavedSessions(SAVED_WORKOUTS, uid, { all: true });
        seen.push({ uid, ids: value.items.map((w) => w.id) });
        return value;
      },
      { initialProps: { uid: "a" } }
    );
    // POSITIVE anchor: account A's workout is showing before the switch.
    await waitFor(() =>
      expect(result.current.items.map((w) => w.id)).toEqual(["mine"])
    );
    rerender({ uid: "b" });
    await waitFor(() => expect(result.current.answered).toBe(true));
    const underB = seen.filter((render) => render.uid === "b");
    expect(underB.length).toBeGreaterThan(0);
    for (const render of underB) expect(render.ids).toEqual([]);
  });
});
