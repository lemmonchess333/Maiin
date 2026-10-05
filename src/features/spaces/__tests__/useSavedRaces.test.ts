import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deferWrites,
  failNextFirestore,
  flushSnapshots,
  readDoc,
  readLog,
  releaseAllWrites,
  resetFirestore,
  seedFirestore,
  setSnapshotMetadata,
  unfiredFailures,
  writeLog,
} from "@/test/firestoreHarness";
import { useSavedRaces } from "../useSavedRaces";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
const state = vi.hoisted(() => ({
  uid: "a" as string | undefined,
  online: true,
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useUid: () => state.uid }));
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({ isOnline: state.online }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: state.success, error: state.error },
}));
const path = "users/a/settings/savedRaces";

describe("private saved races", () => {
  beforeEach(() => {
    resetFirestore();
    state.uid = "a";
    state.online = true;
    vi.clearAllMocks();
  });
  it("loads valid race IDs from one private document, ignoring unknown IDs and interest spaces", async () => {
    seedFirestore({
      [path]: {
        raceIds: [
          "berlin-marathon",
          "runners",
          "unknown",
          12,
          "berlin-marathon",
        ],
      },
    });
    const { result } = renderHook(() => useSavedRaces());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect([...result.current.ids]).toEqual(["berlin-marathon"]);
    expect(readLog().every((read) => read.path === path)).toBe(true);
  });
  it("atomically adds/removes a race, preserving another device's saves and unrelated settings", async () => {
    seedFirestore({
      [path]: { raceIds: ["berlin-marathon"], retained: "yes" },
    });
    const { result } = renderHook(() => useSavedRaces());
    await flushSnapshots();
    const toggle = result.current.toggle;
    seedFirestore({
      [path]: {
        raceIds: ["berlin-marathon", "boston-marathon"],
        retained: "yes",
      },
    });
    await act(async () => {
      await toggle("chicago-marathon");
    });
    expect(readDoc(path)).toEqual({
      raceIds: ["berlin-marathon", "boston-marathon", "chicago-marathon"],
      retained: "yes",
    });
    await act(async () => {
      await result.current.toggle("berlin-marathon");
    });
    expect(readDoc(path)?.raceIds).toEqual([
      "boston-marathon",
      "chicago-marathon",
    ]);
    expect(writeLog().every((write) => write.path === path)).toBe(true);
  });
  it("does not treat a missing offline cache entry as an empty saved list", async () => {
    setSnapshotMetadata(path, { fromCache: true });
    const { result } = renderHook(() => useSavedRaces());
    await flushSnapshots();
    expect(result.current.ready).toBe(false);
    setSnapshotMetadata(path, { fromCache: false });
    await flushSnapshots();
    expect(result.current.ready).toBe(true);
    expect(result.current.ids.size).toBe(0);
  });
  it("distinguishes load failure from empty and retries", async () => {
    failNextFirestore("onSnapshot", { path });
    const { result } = renderHook(() => useSavedRaces());
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.ready).toBe(false);
    expect(unfiredFailures()).toEqual([]);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error).toBe(false);
  });
  it("surfaces write failure and leaves the existing saved list intact", async () => {
    seedFirestore({ [path]: { raceIds: ["berlin-marathon"] } });
    const { result } = renderHook(() => useSavedRaces());
    await flushSnapshots();
    failNextFirestore("setDoc", { path, code: "permission-denied" });
    await act(async () => {
      await result.current.toggle("berlin-marathon");
    });
    expect(result.current.ids.has("berlin-marathon")).toBe(true);
    expect(result.current.pendingIds.size).toBe(0);
    expect(state.error).toHaveBeenCalledTimes(1);
    expect(state.success).not.toHaveBeenCalled();
  });
  it("prevents duplicate in-flight writes and ignores late completion after switching accounts", async () => {
    const { result, rerender } = renderHook(() => useSavedRaces());
    await flushSnapshots();
    deferWrites();
    let save!: Promise<void>;
    const oldToggle = result.current.toggle;
    act(() => {
      save = oldToggle("berlin-marathon");
      void oldToggle("berlin-marathon");
    });
    expect(result.current.pendingIds.has("berlin-marathon")).toBe(true);
    state.uid = "b";
    rerender();
    expect(result.current.ids.size).toBe(0);
    expect(result.current.pendingIds.size).toBe(0);
    await flushSnapshots();
    await act(async () => {
      releaseAllWrites();
      await save;
      await oldToggle("chicago-marathon");
    });
    expect(result.current.ids.size).toBe(0);
    expect(writeLog()).toHaveLength(1);
    expect(readDoc("users/b/settings/savedRaces")).toBeUndefined();
    expect(state.success).not.toHaveBeenCalled();
  });
  it("blocks writes when offline or signed out and rejects non-race IDs", async () => {
    const { result, rerender } = renderHook(() => useSavedRaces());
    await flushSnapshots();
    await act(async () => {
      await result.current.toggle("runners");
    });
    state.online = false;
    rerender();
    await act(async () => {
      await result.current.toggle("berlin-marathon");
    });
    state.uid = undefined;
    rerender();
    expect(result.current.ids.size).toBe(0);
    await act(async () => {
      await result.current.toggle("berlin-marathon");
    });
    expect(writeLog()).toEqual([]);
  });
});
