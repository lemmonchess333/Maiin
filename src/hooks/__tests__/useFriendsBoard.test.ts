/**
 * useFriendsBoard against the Firestore fake (ADR-0009): one read of this
 * week's tallies (Polish2 call 5), each named from the public profile,
 * stamped with the account it was read for, and a read that failed says so.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

const h = vi.hoisted(() => ({ user: { uid: "me" } as { uid: string } }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: h.user }),
  useUid: () => h.user.uid,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import { Timestamp } from "firebase/firestore";
import { rankNamedBoard, useFriendsBoard } from "../useFriendsBoard";
import {
  deferReads,
  failNextFirestore,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";

const tally = (sessions: number) => ({
  weekEndsAt: Timestamp.fromMillis(Date.now() + 3 * 86400000),
  sessions,
  lifts: sessions,
  runs: 0,
  distanceM: 0,
  volumeKg: 0,
});

beforeEach(() => {
  resetFirestore();
  h.user = { uid: "me" };
  seedFirestore({
    "following/me/users/maya": { followedAt: 1 },
    "following/me/users/sam": { followedAt: 1 },
    "users/maya/public/profile": { displayName: "Maya", photoURL: "m.jpg" },
    "friendsBoard/me": tally(2),
    "friendsBoard/maya": tally(3),
    // Sam shares a week but has no public profile to name them from.
    "friendsBoard/sam": tally(0),
  });
});
afterEach(() => cleanup());

describe("useFriendsBoard", () => {
  it("names each week from the public profile", async () => {
    const { result } = renderHook(() => useFriendsBoard());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(
      result.current.weeks.map((w) => [w.uid, w.name, w.photoURL])
    ).toEqual([
      ["me", "You", undefined],
      ["maya", "Maya", "m.jpg"],
      ["sam", "Athlete", undefined],
    ]);
    expect(result.current.failed).toBe(false);
  });

  it("another account reads as loading, never as the last person's board", async () => {
    const { result, rerender } = renderHook(() => useFriendsBoard());
    await waitFor(() => expect(result.current.weeks).toHaveLength(3));

    deferReads();
    h.user = { uid: "someone-else" };
    rerender();

    expect(result.current.loading).toBe(true);
    expect(result.current.weeks).toEqual([]);
  });

  it("a read that failed says so, and reload reads it again", async () => {
    failNextFirestore("getDocs", {
      path: "following/me/users",
      code: "unavailable",
    });
    const { result } = renderHook(() => useFriendsBoard());
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.weeks).toEqual([]);

    act(() => result.current.reload());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.weeks).toHaveLength(3));
    expect(result.current.failed).toBe(false);
  });
});

/* Polish3 call 1: nobody either side of a block is on your board. Blocking
   ends both follows, so this is the backstop for a follow left behind. */
describe("useFriendsBoard across a block", () => {
  it("leaves out whoever blocked you and whoever you blocked", async () => {
    // A viewer of its own: the block lists are cached per signed-in uid.
    h.user = { uid: "board-viewer" };
    seedFirestore({
      "following/board-viewer/users/maya": { followedAt: 1 },
      "following/board-viewer/users/sam": { followedAt: 1 },
      "following/board-viewer/users/ola": { followedAt: 1 },
      "friendsBoard/board-viewer": tally(1),
      "friendsBoard/ola": tally(4),
      "friendsBoard/maya": tally(3),
      "friendsBoard/sam": tally(2),
      // Maya blocked the viewer (the server's copy); the viewer blocked Sam.
      "blockedBy/board-viewer/users/maya": {},
      "blocks/board-viewer/users/sam": { blockedAt: 1 },
    });
    const { result } = renderHook(() => useFriendsBoard());
    // POSITIVE anchor: Ola, on neither side of a block, is there.
    await waitFor(() =>
      expect(result.current.weeks.map((w) => w.uid)).toContain("ola")
    );
    await waitFor(() =>
      expect(result.current.weeks.map((w) => w.uid)).toEqual([
        "board-viewer",
        "ola",
      ])
    );
  });
});

describe("rankNamedBoard", () => {
  it("ranks one board, named, leaving out anyone with nothing on it", async () => {
    const { result } = renderHook(() => useFriendsBoard());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(
      rankNamedBoard(result.current.weeks, "weekly_sessions").map((e) => [
        e.name,
        e.value,
        e.rank,
      ])
    ).toEqual([
      ["Maya", 3, 1],
      ["You", 2, 2],
    ]);
  });
});
