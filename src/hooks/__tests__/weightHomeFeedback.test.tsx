import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "a" } },
}));
import { useHomeData } from "../useHomeData";
import { queueWeightEntry, flushQueuedWeights } from "@/lib/weightQueue";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { localDateString } from "@/lib/dateHelpers";
import type { UserProfile } from "@/lib/auth";
const today = localDateString();
const profile = { weightKg: 75 } as UserProfile;
beforeEach(() => {
  resetFirestore();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("shows the latest locally saved weight immediately, after reopening, and after sync", async () => {
  seedFirestore({
    [`users/a/bodyweightLogs/${today}`]: {
      date: today,
      weight: 75,
      source: "manual",
    },
  });
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const home = renderHook(() => useHomeData({ uid: "a" }, profile, [], "kg"));
  await waitFor(() => expect(home.result.current.loading).toBe(false));
  act(() => {
    queueWeightEntry("a", today, 81);
    queueWeightEntry("a", today, 82);
  });
  expect(home.result.current.lastWeightInfo?.kg).toBe(82);
  expect(home.result.current.weightSyncStatus).toMatch(/Offline/);
  home.unmount();
  const reopened = renderHook(() =>
    useHomeData({ uid: "a" }, profile, [], "kg")
  );
  expect(reopened.result.current.lastWeightInfo?.kg).toBe(82);
  await waitFor(() => expect(reopened.result.current.loading).toBe(false));
  online.mockReturnValue(true);
  await act(() => flushQueuedWeights("a"));
  await waitFor(() =>
    expect(reopened.result.current.weightSyncStatus).toBeNull()
  );
  expect(reopened.result.current.lastWeightInfo?.kg).toBe(82);
});
it("keeps another account and today's reading separate from a queued past-day correction", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  queueWeightEntry("a", localDateString(yesterday), 81);
  seedFirestore({
    [`users/a/bodyweightLogs/${today}`]: {
      date: today,
      weight: 75,
      source: "manual",
    },
  });
  const home = renderHook(() => useHomeData({ uid: "a" }, profile, [], "kg"));
  await waitFor(() => expect(home.result.current.loading).toBe(false));
  expect(home.result.current.lastWeightInfo?.kg).toBe(75);
  const other = renderHook(() => useHomeData({ uid: "b" }, profile, [], "kg"));
  await waitFor(() => expect(other.result.current.loading).toBe(false));
  expect(other.result.current.lastWeightInfo?.kg).toBe(75);
  expect(other.result.current.weightSyncStatus).toBeNull();
});
