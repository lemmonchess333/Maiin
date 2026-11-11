// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "runner" }));

import { useSavedRuns } from "@/hooks/useSavedRuns";
import { useSavedSessions } from "@/hooks/useSavedSessions";
import { SAVED_RUNS, fetchSavedRuns } from "../savedRuns";
import {
  failNextFirestore,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";
import { savedRunDoc } from "@/test/sessionFixtures";

beforeEach(resetFirestore);

const window = { since: "2026-06-01", until: "2026-06-04" } as const;

it("finds a run saved days later on its original day, once, alongside a legacy run", async () => {
  seedFirestore({
    "users/runner/runs/late": savedRunDoc(
      "2026-06-02",
      {},
      new Date("2026-06-20T12:00:00Z")
    ),
    "users/runner/runs/legacy": savedRunDoc("2026-06-03", {
      date: undefined,
    }),
    "users/runner/runs/outside": savedRunDoc(
      "2026-06-10",
      {},
      new Date("2026-06-20T13:00:00Z")
    ),
  });

  const fetched = await fetchSavedRuns("runner", window);
  expect(fetched.map((run) => [run.id, run.day]).sort()).toEqual([
    ["late", "2026-06-02"],
    ["legacy", "2026-06-03"],
  ]);

  const { result, unmount } = renderHook(() => useSavedRuns(window));
  await waitFor(() => expect(result.current.evidenceReady).toBe(true));
  expect(result.current.runs.map((run) => run.id).sort()).toEqual([
    "late",
    "legacy",
  ]);
  unmount();
});

it("does not expose either account's window while the other account answers", async () => {
  seedFirestore({
    "users/runner/runs/late": savedRunDoc(
      "2026-06-02",
      {},
      new Date("2026-06-20T12:00:00Z")
    ),
  });
  const { result, rerender, unmount } = renderHook(
    ({ uid }) => useSavedSessions(SAVED_RUNS, uid, window),
    { initialProps: { uid: "runner" } }
  );
  await waitFor(() => expect(result.current.evidenceReady).toBe(true));
  expect(result.current.items.map((run) => run.id)).toEqual(["late"]);

  rerender({ uid: "other" });
  expect(result.current.items).toEqual([]);
  await waitFor(() => expect(result.current.evidenceReady).toBe(true));
  expect(result.current.items).toEqual([]);
  unmount();
});

it("keeps completion evidence unavailable if either day-window read fails", async () => {
  failNextFirestore("onSnapshot", { path: "users/runner/runs" });
  const { result, unmount } = renderHook(() =>
    useSavedSessions(SAVED_RUNS, "runner", window)
  );
  await waitFor(() => expect(result.current.readFailed).toBe(true));
  expect(result.current.evidenceReady).toBe(false);
  expect(unfiredFailures()).toEqual([]);
  unmount();
});
