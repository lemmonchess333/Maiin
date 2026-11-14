/**
 * useEnoughPeople (App1 Q6): whether the largest of the server's counts of
 * people training on Tropos lately reaches the league's GROUP_MIN, read
 * once for every mounted copy; null until read. Firestore runs on the one
 * fake (ADR-0009); the community goal's ids come from the clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ uid: "viewer" as string | null }));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => h.uid }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import { useEnoughPeople } from "../useEnoughPeople";
import { communityGoalIds } from "@/lib/enoughPeople";
import {
  deferReads,
  failNextFirestore,
  pendingReads,
  readsAt,
  releaseAllReads,
  releaseRead,
  resetFirestore,
  resumeReads,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

const [THIS_MONTH, LAST_MONTH] = communityGoalIds(new Date());

beforeEach(() => {
  resetFirestore();
  h.uid = "viewer";
});
afterEach(() => {
  cleanup();
  resumeReads();
  expect(unfiredFailures()).toEqual([]);
});

describe("useEnoughPeople", () => {
  it("is quiet below ten people training, from every count", async () => {
    seedFirestore({
      [`challenges/${THIS_MONTH}`]: { collectiveRunners: 4 },
      [`challenges/${LAST_MONTH}`]: { collectiveRunners: 9 },
      "leagueStatus/current": { joined: 2 },
    });
    const { result } = renderHook(() => useEnoughPeople());
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("opens with ten runners in this month's community goal", async () => {
    seedFirestore({
      [`challenges/${THIS_MONTH}`]: { collectiveRunners: 10 },
    });
    const { result } = renderHook(() => useEnoughPeople());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("stays open on the 1st on last month's runners while this month's fill", async () => {
    seedFirestore({
      [`challenges/${THIS_MONTH}`]: { collectiveRunners: 1 },
      [`challenges/${LAST_MONTH}`]: { collectiveRunners: 40 },
    });
    const { result } = renderHook(() => useEnoughPeople());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("counts the league's lifters too", async () => {
    seedFirestore({ "leagueStatus/current": { joined: 12 } });
    const { result } = renderHook(() => useEnoughPeople());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("counts a count it cannot read as none", async () => {
    seedFirestore({
      [`challenges/${THIS_MONTH}`]: { collectiveRunners: 30 },
      "leagueStatus/current": { joined: 4 },
    });
    failNextFirestore("getDoc", { path: `challenges/${THIS_MONTH}` });
    const { result } = renderHook(() => useEnoughPeople());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("and the counts it can read still count", async () => {
    seedFirestore({
      [`challenges/${THIS_MONTH}`]: { collectiveRunners: 30 },
      "leagueStatus/current": { joined: 11 },
    });
    failNextFirestore("getDoc", { path: `challenges/${THIS_MONTH}` });
    const { result } = renderHook(() => useEnoughPeople());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("stays quiet when nothing can be read", async () => {
    failNextFirestore("getDoc", { path: `challenges/${THIS_MONTH}` });
    failNextFirestore("getDoc", { path: `challenges/${LAST_MONTH}` });
    failNextFirestore("getDoc", { path: "leagueStatus/current" });
    const { result } = renderHook(() => useEnoughPeople());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("reads once for every copy mounted together", async () => {
    seedFirestore({ "leagueStatus/current": { joined: 15 } });
    const a = renderHook(() => useEnoughPeople());
    const b = renderHook(() => useEnoughPeople());
    await waitFor(() => expect(a.result.current).toBe(true));
    await waitFor(() => expect(b.result.current).toBe(true));
    expect(readsAt("leagueStatus/current")).toHaveLength(1);
    expect(readsAt(`challenges/${THIS_MONTH}`)).toHaveLength(1);
  });

  it("reads afresh once every copy has gone, and drops a read that lands after", async () => {
    seedFirestore({ "leagueStatus/current": { joined: 15 } });
    deferReads();
    const first = renderHook(() => useEnoughPeople());
    first.unmount();
    // Tropos has gone quiet by the time the page is opened again.
    seedFirestore({ "leagueStatus/current": { joined: 3 } });
    const second = renderHook(() => useEnoughPeople());
    expect(pendingReads()).toHaveLength(6);
    // The first copy's three reads land late, while the second's are out:
    // nothing takes them, so the page is not offered rooms it then loses.
    expect(releaseRead()).toBe(true);
    expect(releaseRead()).toBe(true);
    expect(releaseRead()).toBe(true);
    await act(async () => {});
    expect(second.result.current).toBeNull();
    releaseAllReads();
    await waitFor(() => expect(second.result.current).toBe(false));
    expect(readsAt("leagueStatus/current")).toHaveLength(2);
  });

  it("reads nothing signed out", async () => {
    h.uid = null;
    seedFirestore({ "leagueStatus/current": { joined: 15 } });
    const { result } = renderHook(() => useEnoughPeople());
    // Anchor: the same render signed in would have read by now.
    await Promise.resolve();
    expect(result.current).toBeNull();
    expect(readsAt("leagueStatus/current")).toHaveLength(0);
  });
});
