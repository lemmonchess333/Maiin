/**
 * useFollowState — whether the viewer follows someone, shared by every
 * control that shows it (a profile's Follow button, a post's Follow link,
 * the People to follow row).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const H = vi.hoisted(() => ({
  uid: "me" as string | null,
  reads: [] as {
    viewer: string;
    target: string;
    resolve: (v: boolean) => void;
    reject: (e: unknown) => void;
  }[],
  follow: vi.fn(async (_viewer: string, _target: string) => {}),
  unfollow: vi.fn(async (_viewer: string, _target: string) => {}),
}));

vi.mock("@/lib/auth", () => ({ useUid: () => H.uid }));
vi.mock("@/lib/socialApi", () => ({
  isFollowing: (viewer: string, target: string) =>
    new Promise<boolean>((resolve, reject) => {
      H.reads.push({ viewer, target, resolve, reject });
    }),
  followUser: (viewer: string, target: string) => H.follow(viewer, target),
  unfollowUser: (viewer: string, target: string) => H.unfollow(viewer, target),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import {
  __resetFollowStatesForTests,
  noteFollowState,
  useFollowState,
} from "../useFollowState";

beforeEach(() => {
  H.uid = "me";
  H.reads = [];
  H.follow = vi.fn(async (_viewer: string, _target: string) => {});
  H.unfollow = vi.fn(async (_viewer: string, _target: string) => {});
  __resetFollowStatesForTests();
});

async function answer(index: number, following: boolean) {
  await act(async () => H.reads[index].resolve(following));
}

describe("useFollowState", () => {
  it("two controls showing one person ask once, and agree", async () => {
    const a = renderHook(() => useFollowState("maya"));
    const b = renderHook(() => useFollowState("maya"));
    expect(H.reads).toHaveLength(1);
    expect(a.result.current.settled).toBe(false);
    await answer(0, false);
    expect(a.result.current.following).toBe(false);
    expect(b.result.current.following).toBe(false);
  });

  it("a follow from one control shows on the other at once", async () => {
    const a = renderHook(() => useFollowState("maya"));
    const b = renderHook(() => useFollowState("maya"));
    await answer(0, false);
    let release!: () => void;
    H.follow = vi.fn(
      (_viewer: string, _target: string) =>
        new Promise<void>((r) => (release = r))
    );
    let done!: Promise<boolean>;
    act(() => {
      done = a.result.current.toggle(true);
    });
    // Before the write lands.
    expect(b.result.current.following).toBe(true);
    expect(a.result.current.busy).toBe(true);
    await act(async () => {
      release();
      expect(await done).toBe(true);
    });
    expect(H.follow).toHaveBeenCalledWith("me", "maya");
    expect(a.result.current.busy).toBe(false);
  });

  it("a failed follow is put back", async () => {
    const a = renderHook(() => useFollowState("maya"));
    await answer(0, false);
    H.follow = vi.fn(async (_viewer: string, _target: string) => {
      throw new Error("offline");
    });
    let ok = true;
    await act(async () => {
      ok = await a.result.current.toggle(true);
    });
    expect(ok).toBe(false);
    expect(a.result.current.following).toBe(false);
  });

  it("someone already known not to be followed needs no read", () => {
    noteFollowState("me", "priya", false);
    const a = renderHook(() => useFollowState("priya"));
    expect(H.reads).toHaveLength(0);
    expect(a.result.current.following).toBe(false);
    expect(a.result.current.settled).toBe(true);
  });

  it("belongs to the account that read it", async () => {
    const a = renderHook(() => useFollowState("maya"));
    await answer(0, true);
    expect(a.result.current.following).toBe(true);
    H.uid = "other";
    a.rerender();
    expect(a.result.current.following).toBeNull();
    expect(H.reads.map((r) => r.viewer)).toEqual(["me", "other"]);
  });

  it("a failed check settles without a verdict", async () => {
    const a = renderHook(() => useFollowState("maya"));
    await act(async () => H.reads[0].reject(new Error("offline")));
    await waitFor(() => expect(a.result.current.settled).toBe(true));
    expect(a.result.current.following).toBeNull();
  });

  it("asks nothing about yourself", () => {
    renderHook(() => useFollowState("me"));
    expect(H.reads).toHaveLength(0);
  });
});
