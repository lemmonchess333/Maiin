/**
 * useLeagueRise (Run30 call 2): the group read before the save, the
 * server's recompute listened for after it, for a bounded time, and a
 * place only when the session raised it.
 *
 * Firestore runs on the one fake (ADR-0009), seeded with the fields the
 * server writes (functions/lib/leagues.js).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import {
  LEAGUE_LINE_WAIT_MS,
  useLeagueRise,
  type FinishStage,
} from "../useLeagueRise";
import {
  deferReads,
  failNextFirestore,
  flushSnapshots,
  readLog,
  releaseAllReads,
  resetFirestore,
  resumeReads,
  seedFirestore,
  setSnapshotMetadata,
  unfiredFailures,
} from "@/test/firestoreHarness";
import { restoreRealTimers } from "@/test/fakeTimers";

const ME = "me";
const GROUP = "g1";
const T0 = Date.UTC(2026, 10, 23, 9);
const STANDINGS = `leagueGroups/${GROUP}/standings`;

/** A group of ten, six scored; you 5th on 25 points. */
function seedGroup() {
  const rows: Record<string, number> = {
    a: 100,
    b: 75,
    c: 50,
    d: 40,
    [ME]: 25,
    e: 20,
    f: 0,
    g: 0,
    h: 0,
    i: 0,
  };
  const tree: Record<string, Record<string, unknown>> = {
    [`leagueMembers/${ME}`]: {
      uid: ME,
      tier: "silver",
      groupId: GROUP,
      weekKey: "2026-11-23",
    },
    [`leagueGroups/${GROUP}`]: {
      weekKey: "2026-11-23",
      memberUids: Object.keys(rows),
      size: 10,
    },
  };
  Object.entries(rows).forEach(([uid, points], i) => {
    tree[`${STANDINGS}/${uid}`] = {
      uid,
      points,
      done: points ? 1 : 0,
      planned: 4,
      reachedAt: new Date(T0 - 100 + i),
    };
  });
  seedFirestore(tree);
}

/** The server's recompute of your standing after the session. */
function recompute(points: number) {
  seedFirestore({
    [`${STANDINGS}/${ME}`]: {
      uid: ME,
      points,
      done: 3,
      planned: 4,
      reachedAt: new Date(T0 + 1),
    },
  });
}

type Props = { stage: FinishStage; isOnline: boolean; enabled?: boolean };
function render(initial: Props) {
  return renderHook(
    ({ stage, isOnline, enabled = true }: Props) =>
      useLeagueRise({ uid: ME, enabled, stage, isOnline }),
    { initialProps: initial }
  );
}

const standingsReads = () =>
  readLog().filter((r) => r.path === STANDINGS && r.op === "getDocs").length;

beforeEach(() => {
  resetFirestore();
  seedGroup();
});

describe("useLeagueRise", () => {
  it("says the place a saved session raised you to", async () => {
    const hook = render({ stage: "before", isOnline: true });
    await waitFor(() => expect(standingsReads()).toBe(1));
    await flushSnapshots();
    hook.rerender({ stage: "saving", isOnline: true });
    hook.rerender({ stage: "onServer", isOnline: true });
    await flushSnapshots();
    expect(hook.result.current).toBeNull();
    recompute(60);
    await waitFor(() =>
      expect(hook.result.current).toEqual({ tier: "silver", rank: 3, of: 10 })
    );
  });

  it("shows nothing when the session kept your place", async () => {
    const hook = render({ stage: "before", isOnline: true });
    await waitFor(() => expect(standingsReads()).toBe(1));
    await flushSnapshots();
    hook.rerender({ stage: "onServer", isOnline: true });
    await flushSnapshots();
    recompute(40); // ties d, who reached 40 first
    await flushSnapshots();
    await flushSnapshots();
    expect(hook.result.current).toBeNull();
    // Settled: a later write does not bring a line.
    recompute(90);
    await flushSnapshots();
    expect(hook.result.current).toBeNull();
  });

  it("does not listen before the session is on the server", async () => {
    const hook = render({ stage: "before", isOnline: true });
    await waitFor(() => expect(standingsReads()).toBe(1));
    await flushSnapshots();
    hook.rerender({ stage: "saving", isOnline: true });
    recompute(60);
    await flushSnapshots();
    expect(hook.result.current).toBeNull();
    expect(readLog().some((r) => r.op === "onSnapshot")).toBe(false);
  });

  it("keeps no before that landed after the save started", async () => {
    deferReads();
    const hook = render({ stage: "before", isOnline: true });
    await flushSnapshots();
    hook.rerender({ stage: "saving", isOnline: true });
    resumeReads();
    releaseAllReads();
    await flushSnapshots();
    releaseAllReads();
    await flushSnapshots();
    hook.rerender({ stage: "onServer", isOnline: true });
    recompute(60);
    await flushSnapshots();
    expect(hook.result.current).toBeNull();
    expect(readLog().some((r) => r.op === "onSnapshot")).toBe(false);
  });

  it("reads nothing for a finish opened after its save", async () => {
    const hook = render({ stage: "onServer", isOnline: true });
    await flushSnapshots();
    recompute(60);
    await flushSnapshots();
    expect(hook.result.current).toBeNull();
    expect(readLog()).toEqual([]);
  });

  it("reads nothing for someone who has not joined", async () => {
    const hook = render({ stage: "before", isOnline: true, enabled: false });
    await flushSnapshots();
    hook.rerender({ stage: "onServer", isOnline: true, enabled: false });
    recompute(60);
    await flushSnapshots();
    expect(hook.result.current).toBeNull();
    expect(readLog()).toEqual([]);
  });

  it("offline: a before that cannot be read shows nothing", async () => {
    failNextFirestore("getDoc", {
      path: `leagueMembers/${ME}`,
      code: "unavailable",
    });
    const hook = render({ stage: "before", isOnline: false });
    await flushSnapshots();
    expect(unfiredFailures()).toEqual([]);
    hook.rerender({ stage: "onServer", isOnline: true });
    recompute(60);
    await flushSnapshots();
    expect(hook.result.current).toBeNull();
    expect(standingsReads()).toBe(0);
  });

  it("offline after the save: no listen until the phone is online", async () => {
    const hook = render({ stage: "before", isOnline: true });
    await waitFor(() => expect(standingsReads()).toBe(1));
    await flushSnapshots();
    hook.rerender({ stage: "onServer", isOnline: false });
    await flushSnapshots();
    expect(readLog().some((r) => r.op === "onSnapshot")).toBe(false);
    recompute(60);
    hook.rerender({ stage: "onServer", isOnline: true });
    await waitFor(() => expect(hook.result.current?.rank).toBe(3));
  });

  it("judges only the server's snapshots, not the phone's cache", async () => {
    const hook = render({ stage: "before", isOnline: true });
    await waitFor(() => expect(standingsReads()).toBe(1));
    await flushSnapshots();
    setSnapshotMetadata(STANDINGS, { fromCache: true });
    hook.rerender({ stage: "onServer", isOnline: true });
    recompute(60);
    await flushSnapshots();
    expect(hook.result.current).toBeNull();
    setSnapshotMetadata(STANDINGS, { fromCache: false });
    recompute(61);
    await waitFor(() => expect(hook.result.current?.rank).toBe(3));
  });

  describe("the window", () => {
    afterEach(async () => {
      await restoreRealTimers();
    });

    it("closes after LEAGUE_LINE_WAIT_MS: a recompute after it shows nothing", async () => {
      const hook = render({ stage: "before", isOnline: true });
      await waitFor(() => expect(standingsReads()).toBe(1));
      await flushSnapshots();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      hook.rerender({ stage: "onServer", isOnline: true });
      await flushSnapshots();
      act(() => {
        vi.advanceTimersByTime(LEAGUE_LINE_WAIT_MS - 1);
      });
      expect(hook.result.current).toBeNull();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      recompute(60);
      await flushSnapshots();
      expect(hook.result.current).toBeNull();
    });

    it("a recompute inside the window shows the line", async () => {
      const hook = render({ stage: "before", isOnline: true });
      await waitFor(() => expect(standingsReads()).toBe(1));
      await flushSnapshots();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      hook.rerender({ stage: "onServer", isOnline: true });
      await flushSnapshots();
      act(() => {
        vi.advanceTimersByTime(LEAGUE_LINE_WAIT_MS - 1);
      });
      recompute(60);
      await flushSnapshots();
      expect(hook.result.current).toEqual({ tier: "silver", rank: 3, of: 10 });
    });
  });
});
