/**
 * useSavedRuns' two readiness signals, which mean different things.
 *
 * `loading` is for display: a run saved on this phone shows at once, so a
 * queued run is enough to stop loading. `answered` is for readers that save
 * what they derive (the streak): only the run list itself answers. A streak
 * counted from the one queued run would overwrite the saved streak.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "runner" }));

import { useSavedRuns } from "../useSavedRuns";
import { queueDurableWrite } from "@/lib/offlineQueue";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { savedRunDoc } from "@/test/sessionFixtures";

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
