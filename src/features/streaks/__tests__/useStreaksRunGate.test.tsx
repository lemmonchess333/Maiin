/**
 * The streak waits for the run list itself before it computes or saves.
 *
 * A run saved on this phone and waiting to sync shows everywhere at once
 * (`useSavedRuns().loading` goes false for it), but it is not the run
 * list: the streak is saved as soon as every stream has loaded, and a
 * streak counted from that one run would be saved over the real one. So
 * the provider gates on `answered`, which only the list itself sets.
 *
 * The run reader is scripted here; the reader's own two signals are pinned
 * in `useSavedRuns.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { savedRunDoc } from "@/test/sessionFixtures";
import type { SavedRunsResult } from "@/hooks/useSavedRuns";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "runner" }));
vi.mock("@/hooks/useNutritionBadgeData", () => ({
  useNutritionBadgeData: () => ({
    macroTargetsByDay: new Map(),
    waterByDay: new Map(),
    loaded: true,
  }),
}));

const h = vi.hoisted(() => ({ runs: null as unknown }));
vi.mock("@/hooks/useSavedRuns", () => ({
  useSavedRuns: () => h.runs,
}));

import { StreaksProvider, useStreaks } from "../useStreaks";
import { parseSavedRun } from "@/lib/savedRuns";
import { localDateString } from "@/lib/dateHelpers";

function reader(over: Partial<SavedRunsResult>): SavedRunsResult {
  return {
    runs: [],
    loading: false,
    answered: false,
    failed: false,
    evidenceReady: false,
    refresh: () => {},
    ...over,
  };
}

const today = localDateString(new Date());
const queuedRun = parseSavedRun("queued", savedRunDoc(today))!;

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  seedFirestore({
    "users/runner/streaks/data": {
      currentStreak: 0,
      longestStreak: 9,
      lastActiveDate: "",
      totalActiveDays: 0,
      badges: [],
    },
  });
});
afterEach(() => cleanup());

describe("useStreaks — the run gate", () => {
  it("stays loading while only a queued run is known, then settles on the list", async () => {
    // A run waiting to sync: on screen, but the list has not answered.
    h.runs = reader({ runs: [queuedRun], loading: false, answered: false });
    const view = renderHook(() => useStreaks(), { wrapper: StreaksProvider });

    // POSITIVE anchor: the saved streak document has loaded, so the
    // provider is past its own reads and waiting only on runs.
    await waitFor(() => expect(view.result.current.longestStreak).toBe(9));
    expect(view.result.current.loading).toBe(true);

    h.runs = reader({ runs: [queuedRun], loading: false, answered: true });
    view.rerender();
    await waitFor(() => expect(view.result.current.loading).toBe(false));
  });
});
