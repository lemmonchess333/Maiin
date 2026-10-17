import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { deleteDoc, doc, onSnapshot } from "firebase/firestore";
import {
  failNextFirestore,
  flushSnapshots,
  readLog,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
  writeLog,
} from "@/test/firestoreHarness";
import { db } from "@/lib/firebase";
import { useLiveParticipationProgress } from "../useLiveParticipationProgress";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

const ID = "featured-monthly-2026-10-01";
const PREVIOUS = "featured-monthly-2026-09-01";
const tracked = [
  { id: ID, metric: "training_minutes" },
  { id: PREVIOUS, metric: "active_days" },
  { id: "monthly-2026-10-01", metric: "total_km" },
  { id: "strength-monthly-2026-10-01", metric: "total_volume" },
];
const path = (uid: string, id = ID) => `challenges/${id}/participants/${uid}`;
type Progress = { currentValue: number };

beforeEach(() => resetFirestore());
afterEach(() => {
  cleanup();
  expect(unfiredFailures()).toEqual([]);
});

describe("live participation progress", () => {
  it("receives asynchronous backfill and edit results without changing definitions", async () => {
    const { result } = renderHook(() =>
      useLiveParticipationProgress<Progress>("athlete", tracked)
    );
    await flushSnapshots();
    expect(result.current[ID]).toBeNull();
    await act(async () => {
      seedFirestore({ [path("athlete")]: { currentValue: 0 } });
      await flushSnapshots();
    });
    expect(result.current[ID]?.currentValue).toBe(0);
    await act(async () => {
      seedFirestore({ [path("athlete")]: { currentValue: 123.5 } });
      await flushSnapshots();
    });
    expect(result.current[ID]?.currentValue).toBe(123.5);
    await act(async () => {
      seedFirestore({ [path("athlete")]: { currentValue: 90 } });
      await flushSnapshots();
    });
    expect(result.current[ID]?.currentValue).toBe(90);
    expect(writeLog()).toEqual([]);
  });

  it("subscribes only to the supplied participation editions and keeps stable listeners", async () => {
    const { rerender } = renderHook(
      ({ definitions }) =>
        useLiveParticipationProgress<Progress>("athlete", definitions),
      { initialProps: { definitions: tracked } }
    );
    await flushSnapshots();
    rerender({ definitions: [...tracked].reverse() });
    await flushSnapshots();
    expect(
      readLog()
        .filter((r) => r.op === "onSnapshot")
        .map((r) => r.path)
        .sort()
    ).toEqual([path("athlete"), path("athlete", PREVIOUS)].sort());
  });

  it("keeps deletion distinct from an unread value and receives a fresh rejoin", async () => {
    seedFirestore({ [path("athlete")]: { currentValue: 90 } });
    const { result } = renderHook(() =>
      useLiveParticipationProgress<Progress>("athlete", tracked)
    );
    await flushSnapshots();
    await act(async () => {
      await deleteDoc(doc(db, "challenges", ID, "participants", "athlete"));
      await flushSnapshots();
    });
    expect(result.current[ID]).toBeNull();
    await act(async () => {
      seedFirestore({ [path("athlete")]: { currentValue: 0 } });
      await flushSnapshots();
    });
    expect(result.current[ID]).toEqual({ currentValue: 0 });
  });

  it("keeps a missing current membership authoritative when an old finale leaves the tracked set", async () => {
    const { result, rerender } = renderHook(
      ({ definitions }) =>
        useLiveParticipationProgress<Progress>("athlete", definitions),
      { initialProps: { definitions: tracked } }
    );
    await flushSnapshots();
    expect(result.current[ID]).toBeNull();
    rerender({ definitions: [tracked[0]] });
    expect(result.current[ID]).toBeNull();
    expect(result.current[PREVIOUS]).toBeUndefined();
  });

  it("drops a terminally failed listener's override and ignores later callbacks", async () => {
    seedFirestore({ [path("athlete")]: { currentValue: 90 } });
    const { result } = renderHook(() =>
      useLiveParticipationProgress<Progress>("athlete", tracked)
    );
    await flushSnapshots();
    expect(result.current[ID]?.currentValue).toBe(90);
    failNextFirestore("onSnapshot", { path: path("athlete") });
    await act(async () => {
      seedFirestore({ [path("athlete")]: { currentValue: 120 } });
      await flushSnapshots();
    });
    expect(result.current[ID]).toBeUndefined();
    await act(async () => {
      seedFirestore({ [path("athlete")]: { currentValue: 140 } });
      await flushSnapshots();
    });
    expect(result.current[ID]).toBeUndefined();
  });

  it("isolates accounts and unsubscribes old and unmounted listeners", async () => {
    seedFirestore({
      [path("account-a")]: { currentValue: 200 },
      [path("account-b")]: { currentValue: 15 },
    });
    const { result, rerender, unmount } = renderHook(
      ({ uid }) => useLiveParticipationProgress<Progress>(uid, tracked),
      { initialProps: { uid: "account-a" } }
    );
    await flushSnapshots();
    expect(result.current[ID]?.currentValue).toBe(200);
    rerender({ uid: "account-b" });
    await flushSnapshots();
    expect(result.current[ID]?.currentValue).toBe(15);

    // Any leaked listener would consume this failure when the store changes.
    failNextFirestore("onSnapshot", { path: path("account-a") });
    await act(async () => {
      seedFirestore({ [path("account-a")]: { currentValue: 900 } });
      await flushSnapshots();
    });
    expect(result.current[ID]?.currentValue).toBe(15);
    expect(unfiredFailures()).toHaveLength(1);
    // Consume the sentinel explicitly so the harness also verifies its path.
    const stopProbe = onSnapshot(
      doc(db, "challenges", ID, "participants", "account-a"),
      () => {},
      () => {}
    );
    stopProbe();

    unmount();
    failNextFirestore("onSnapshot", { path: path("account-b") });
    seedFirestore({ [path("account-b")]: { currentValue: 60 } });
    await flushSnapshots();
    expect(unfiredFailures()).toHaveLength(1);
    const stopUnmountProbe = onSnapshot(
      doc(db, "challenges", ID, "participants", "account-b"),
      () => {},
      () => {}
    );
    stopUnmountProbe();
  });
});
