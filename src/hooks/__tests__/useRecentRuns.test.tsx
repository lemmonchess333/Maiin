import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
let uid: string | null = "u1";
vi.mock("@/lib/auth", () => ({ useUid: () => uid }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
import { Timestamp } from "firebase/firestore";
import { useRecentRuns } from "../useRecentRuns";
import {
  seedFirestore,
  resetFirestore,
  flushSnapshots,
} from "@/test/firestoreHarness";
import { queueDurableWrite } from "@/lib/offlineQueue";

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  uid = "u1";
});
afterEach(cleanup);

it("reads the five most recent runs even when the runner has been away for a year", async () => {
  seedFirestore(
    Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [
        `users/u1/runs/r${i}`,
        {
          completedAt: Timestamp.fromDate(new Date(2024, 0, i + 1)),
          distance: 5000,
          duration: 1800,
        },
      ])
    )
  );
  const { result } = renderHook(useRecentRuns);
  await waitFor(() => expect(result.current.runs).toHaveLength(5));
  expect(result.current.runs.map((run) => run.id)).toEqual([
    "r7",
    "r6",
    "r5",
    "r4",
    "r3",
  ]);
});

it("includes a run saved on the phone and hides it immediately from another account", async () => {
  const { result, rerender } = renderHook(useRecentRuns);
  await flushSnapshots();
  act(() =>
    queueDurableWrite("u1", "users/u1/runs", "local-run", {
      completedAt: Timestamp.now(),
      distance: 5000,
      duration: 1800,
    })
  );
  expect(result.current.runs.map((run) => run.id)).toEqual(["local-run"]);
  uid = "u2";
  rerender();
  expect(result.current.runs).toEqual([]);
  await flushSnapshots();
  expect(result.current.runs).toEqual([]);
});
