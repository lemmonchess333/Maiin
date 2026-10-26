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
  follow: vi.fn(
    async (_viewer: string, _target: string): Promise<string> => "following"
  ),
  unfollow: vi.fn(async (_viewer: string, _target: string) => {}),
  cancel: vi.fn(async (_viewer: string, _target: string) => {}),
  requested: vi.fn(async (_viewer: string, _target: string) => false),
}));

vi.mock("@/lib/auth", () => ({ useUid: () => H.uid }));
vi.mock("@/lib/socialApi", () => ({
  isFollowing: (viewer: string, target: string) =>
    new Promise<boolean>((resolve, reject) => {
      H.reads.push({ viewer, target, resolve, reject });
    }),
  hasRequestedFollow: (viewer: string, target: string) =>
    H.requested(viewer, target),
  followOrRequest: (viewer: string, target: string) => H.follow(viewer, target),
  unfollowUser: (viewer: string, target: string) => H.unfollow(viewer, target),
  cancelFollowRequest: (viewer: string, target: string) =>
    H.cancel(viewer, target),
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
  H.follow = vi.fn(
    async (_viewer: string, _target: string): Promise<string> => "following"
  );
  H.unfollow = vi.fn(async (_viewer: string, _target: string) => {});
  H.cancel = vi.fn(async (_viewer: string, _target: string) => {});
  H.requested = vi.fn(async (_viewer: string, _target: string) => false);
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

  it("a follow from one control shows on the other once it lands", async () => {
    const a = renderHook(() => useFollowState("maya"));
    const b = renderHook(() => useFollowState("maya"));
    await answer(0, false);
    let release!: (outcome: string) => void;
    H.follow = vi.fn(
      (_viewer: string, _target: string) =>
        new Promise<string>((r) => (release = r))
    );
    let done!: Promise<string | null>;
    act(() => {
      done = a.result.current.toggle(true);
    });
    // It waits to hear whether it became a follow or a request.
    expect(b.result.current.following).toBe(false);
    expect(a.result.current.busy).toBe(true);
    await act(async () => {
      release("following");
      expect(await done).toBe("following");
    });
    expect(b.result.current.following).toBe(true);
    expect(H.follow).toHaveBeenCalledWith("me", "maya");
    expect(a.result.current.busy).toBe(false);
  });

  it("a follow to someone who approves followers is a request, on every control", async () => {
    const a = renderHook(() => useFollowState("maya"));
    const b = renderHook(() => useFollowState("maya"));
    await answer(0, false);
    H.follow = vi.fn(
      async (_viewer: string, _target: string): Promise<string> => "requested"
    );
    let now: string | null = null;
    await act(async () => {
      now = await a.result.current.toggle(true);
    });
    expect(now).toBe("requested");
    expect(b.result.current.requested).toBe(true);
    // Not a follower until accepted.
    expect(b.result.current.following).toBe(false);
  });

  it("reads a request already waiting as requested", async () => {
    H.requested = vi.fn(async () => true);
    const a = renderHook(() => useFollowState("maya"));
    await answer(0, false);
    await waitFor(() => expect(a.result.current.requested).toBe(true));
    expect(H.requested).toHaveBeenCalledWith("me", "maya");
  });

  it("undoing a request cancels it, at once, rather than unfollowing", async () => {
    H.requested = vi.fn(async () => true);
    const a = renderHook(() => useFollowState("maya"));
    await answer(0, false);
    await waitFor(() => expect(a.result.current.requested).toBe(true));
    let now: string | null = null;
    await act(async () => {
      now = await a.result.current.toggle(false);
    });
    expect(now).toBe("not-following");
    expect(H.cancel).toHaveBeenCalledWith("me", "maya");
    expect(H.unfollow).not.toHaveBeenCalled();
    expect(a.result.current.requested).toBe(false);
  });

  it("a failed follow is put back", async () => {
    const a = renderHook(() => useFollowState("maya"));
    await answer(0, false);
    H.follow = vi.fn(
      async (_viewer: string, _target: string): Promise<string> => {
        throw new Error("offline");
      }
    );
    let now: string | null = "following";
    await act(async () => {
      now = await a.result.current.toggle(true);
    });
    expect(now).toBeNull();
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
