/**
 * useCommunitiesFeed — Feed → "Spaces" (SOC-P3a): the posts of
 * the spaces you joined, in one stream, newest first.
 *
 * On the one Firestore fake (ADR-0009). Posts are seeded as
 * SpacePostComposer writes them, with a Timestamp `createdAt` (the field
 * the query orders by); the coach post is shaped as the retired Monday
 * job wrote it, under its "tropos-coach" author id.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
const authState = vi.hoisted(() => ({ uid: "me" }));
vi.mock("@/lib/auth", () => ({ useUid: () => authState.uid }));

import { Timestamp } from "firebase/firestore";
import { useCommunitiesFeed } from "../useCommunitiesFeed";
import {
  deferReads,
  releaseAllReads,
  resetFirestore,
  resumeReads,
  seedFirestore,
} from "@/test/firestoreHarness";
import { __resetFeedSnapshotsForTests } from "@/lib/feedSnapshots";

/** Hours before now: derived from the clock, so every CI run sees the
 *  same order. */
const hoursAgo = (h: number) => Timestamp.fromMillis(Date.now() - h * 3.6e6);

function memberPost(authorName: string, body: string, h: number) {
  return {
    authorId: `${authorName.toLowerCase()}-uid`,
    authorName,
    body,
    likeCount: 0,
    commentCount: 0,
    createdAt: hoursAgo(h),
  };
}

const COACH_POST = {
  authorId: "tropos-coach",
  authorName: "Tropos Coach",
  title: "What's your week one win?",
  body: "New week, clean slate.",
  official: true,
  likeCount: 0,
  commentCount: 0,
  createdAt: hoursAgo(1),
};

beforeEach(() => {
  resetFirestore();
  // The kept reads are the session's; each test is a session.
  __resetFeedSnapshotsForTests();
  authState.uid = "me";
});
afterEach(cleanup);

/** What the stream shows, as `space/post` keys in order. */
const keys = (items: { spaceId: string; postId: string }[]) =>
  items.map((i) => `${i.spaceId}/${i.postId}`);

describe("useCommunitiesFeed", () => {
  it("leaves out the old coach posts and keeps the members' posts", async () => {
    seedFirestore({
      "spaces/runners/posts/coach-2026-09-21": COACH_POST,
      "spaces/runners/posts/p1": memberPost("Priya", "First 10K done.", 2),
    });
    const { result } = renderHook(() => useCommunitiesFeed(true, ["runners"]));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(keys(result.current.items)).toEqual(["runners/p1"]);
    expect(result.current.items[0].post.authorName).toBe("Priya");
  });

  it("puts two spaces' posts in one stream, newest first", async () => {
    seedFirestore({
      "spaces/runners/posts/old": memberPost("Priya", "Long run.", 30),
      "spaces/runners/posts/new": memberPost("Sam", "Track night.", 1),
      "spaces/lifters/posts/mid": memberPost("Jo", "Deadlift PR.", 5),
    });
    const { result } = renderHook(() =>
      useCommunitiesFeed(true, ["runners", "lifters"])
    );
    await waitFor(() => expect(result.current.items).toHaveLength(3));
    expect(keys(result.current.items)).toEqual([
      "runners/new",
      "lifters/mid",
      "runners/old",
    ]);
  });

  it("with spaces joined and nothing posted, settles on an empty stream", async () => {
    seedFirestore({ "spaces/runners/members/me": { uid: "me" } });
    const { result } = renderHook(() =>
      useCommunitiesFeed(true, ["runners", "lifters"])
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
  });

  it("refresh reads the stream again and shows what was posted since", async () => {
    seedFirestore({
      "spaces/runners/posts/p1": memberPost("Priya", "First 10K done.", 2),
    });
    const { result } = renderHook(() => useCommunitiesFeed(true, ["runners"]));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    seedFirestore({
      "spaces/runners/posts/p2": memberPost("Sam", "Easy 5K.", 0),
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(keys(result.current.items)).toEqual(["runners/p2", "runners/p1"]);
  });

  it("clears the visible cache and rereads when the account changes", async () => {
    seedFirestore({
      "spaces/runners/posts/p1": memberPost("Priya", "First 10K done.", 2),
    });
    const { result, rerender } = renderHook(() =>
      useCommunitiesFeed(true, ["runners"])
    );
    await waitFor(() =>
      expect(keys(result.current.items)).toEqual(["runners/p1"])
    );
    const staleRemove = result.current.remove;

    seedFirestore({
      "spaces/runners/posts/p2": memberPost("Sam", "Easy 5K.", 0),
    });
    authState.uid = "other";
    rerender();
    expect(result.current.items).toEqual([]);
    await waitFor(() =>
      expect(keys(result.current.items)).toEqual(["runners/p2", "runners/p1"])
    );
    act(() => staleRemove("runners", "p1"));
    expect(keys(result.current.items)).toEqual(["runners/p2", "runners/p1"]);
  });

  it("removes only the selected Space's post when IDs happen to match", async () => {
    seedFirestore({
      "spaces/runners/posts/shared-id": memberPost("Priya", "Long run.", 2),
      "spaces/lifters/posts/shared-id": memberPost("Jo", "Deadlift PR.", 1),
    });
    const { result } = renderHook(() =>
      useCommunitiesFeed(true, ["runners", "lifters"])
    );
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    act(() => result.current.remove("runners", "shared-id"));
    expect(keys(result.current.items)).toEqual(["lifters/shared-id"]);
  });
});

describe("useCommunitiesFeed — the read kept for the session", () => {
  afterEach(() => {
    resumeReads();
    releaseAllReads();
  });

  /** The stream read once for `ids`, then left (Social unmounted). */
  async function readOnceThenLeave(ids: string[]) {
    seedFirestore({
      "spaces/runners/posts/p1": memberPost("Priya", "First 10K done.", 2),
    });
    const first = renderHook(() => useCommunitiesFeed(true, ids));
    await waitFor(() =>
      expect(keys(first.result.current.items)).toEqual(["runners/p1"])
    );
    first.unmount();
  }

  it("coming back to the same Spaces, it starts from that read and reads again behind it", async () => {
    await readOnceThenLeave(["runners"]);
    seedFirestore({
      "spaces/runners/posts/p2": memberPost("Sam", "Easy 5K.", 0),
    });
    deferReads();
    const { result } = renderHook(() => useCommunitiesFeed(true, ["runners"]));
    expect(keys(result.current.items)).toEqual(["runners/p1"]);
    expect(result.current.loaded).toBe(true);
    expect(result.current.loading).toBe(true);

    resumeReads();
    releaseAllReads();
    await waitFor(() =>
      expect(keys(result.current.items)).toEqual(["runners/p2", "runners/p1"])
    );
  });

  it("for other Spaces, or another account, it starts from nothing", async () => {
    await readOnceThenLeave(["runners"]);
    deferReads();
    const other = renderHook(() =>
      useCommunitiesFeed(true, ["runners", "lifters"])
    );
    expect(other.result.current.items).toEqual([]);
    expect(other.result.current.loaded).toBe(false);
    other.unmount();

    authState.uid = "someone-else";
    const { result } = renderHook(() => useCommunitiesFeed(true, ["runners"]));
    expect(result.current.items).toEqual([]);
    expect(result.current.loaded).toBe(false);
  });
});
