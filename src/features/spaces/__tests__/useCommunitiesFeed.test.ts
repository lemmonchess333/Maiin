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

import { Timestamp } from "firebase/firestore";
import { useCommunitiesFeed } from "../useCommunitiesFeed";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";

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

beforeEach(() => resetFirestore());
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
});
