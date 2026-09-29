import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";

/**
 * SOCIAL-PRIVACY-01 — uid + generation ownership, the Explore twin of
 * `useSocialFeed.ownership.test.tsx`. The discover feed is public, but each
 * page's kudos enrichment ("liked") is per-user, so a fetch captured under
 * account A must not commit after a switch to account B. The pagination
 * cursor is per-account too: after a switch, "load more" must start from the
 * top, never from where account A's scroll had reached.
 *
 * `getDiscoverFeed` returns promises the test settles by hand, in issue
 * order, so a switch can happen while a fetch is in flight.
 */

const authUser = vi.hoisted(() => ({
  current: { uid: "A" } as { uid: string } | null,
}));
vi.mock("../../lib/auth", () => ({
  useAuth: () => ({ user: authUser.current }),
  useUid: () => ({ user: authUser.current }).user?.uid ?? null,
}));

const feed = vi.hoisted(() => ({
  calls: [] as {
    cursor: unknown;
    resolve: (v: { items: unknown[]; lastDoc: unknown }) => void;
    reject: (e: unknown) => void;
  }[],
}));
vi.mock("../../lib/socialApi", () => ({
  getDiscoverFeed: vi.fn(
    (_limit: number, cursor: unknown) =>
      new Promise((resolve, reject) => {
        feed.calls.push({ cursor, resolve, reject });
      })
  ),
  batchGetKudos: vi.fn(async () => ({})),
}));
vi.mock("@/lib/errorReporting", () => ({ captureError: vi.fn() }));

import { useDiscoverFeed } from "../useDiscoverFeed";

function activity(id: string, authorId: string) {
  return { id, authorId, authorName: "x", type: "run", summary: "" };
}

/** A full page (20 items), so the hook reports there is more to load. */
function fullPage(prefix: string, authorId: string) {
  return Array.from({ length: 20 }, (_, i) =>
    activity(`${prefix}${i}`, authorId)
  );
}

const BLOCKED = new Set<string>();

describe("useDiscoverFeed — uid/generation ownership", () => {
  beforeEach(() => {
    authUser.current = { uid: "A" };
    feed.calls = [];
  });

  it("drops a fetch resolved under account A after a switch to account B", async () => {
    const { result, rerender } = renderHook(() =>
      useDiscoverFeed(true, BLOCKED)
    );
    expect(feed.calls).toHaveLength(1);

    // Switch to B while A's fetch is in flight; B's own fetch starts.
    authUser.current = { uid: "B" };
    rerender();
    expect(feed.calls).toHaveLength(2);

    // A's stale fetch resolves: its items must NOT commit under B.
    await act(async () => {
      feed.calls[0].resolve({ items: [activity("a1", "A")], lastDoc: "A-end" });
    });
    expect(result.current.items).toEqual([]);

    // B's own page lands, and is what B sees.
    await act(async () => {
      feed.calls[1].resolve({ items: [activity("b1", "B")], lastDoc: "B-end" });
    });
    expect(result.current.items.map((i) => i.id)).toEqual(["b1"]);
  });

  it("after a switch, load more starts from the top, not from A's cursor", async () => {
    const { result, rerender } = renderHook(() =>
      useDiscoverFeed(true, BLOCKED)
    );
    await act(async () => {
      feed.calls[0].resolve({ items: fullPage("a", "A"), lastDoc: "A-cursor" });
    });
    expect(result.current.items).toHaveLength(20);
    expect(result.current.hasMore).toBe(true);

    authUser.current = { uid: "B" };
    rerender();
    // B's first page fails, so nothing of B's has moved the cursor yet.
    await act(async () => {
      feed.calls[1].reject(new Error("offline"));
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("offline");

    act(() => result.current.loadMore());
    expect(feed.calls).toHaveLength(3);
    expect(feed.calls[2].cursor).toBeUndefined();
  });

  /* `act` flushes a commit and its passive effects together, so the cases
     above cannot open the gap a browser has between B's commit (and paint)
     and B's passive effects. This renders without `act` and resolves A's
     fetch from B's own commit — see the same case in
     `useSocialFeed.ownership.test.tsx` for why the generation moves in a
     layout effect. */
  it("drops A's fetch landing between B's commit and B's passive effects", async () => {
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const wasActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = false;
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    async function until(check: () => boolean) {
      for (let i = 0; i < 50 && !check(); i++) await tick();
      expect(check()).toBe(true);
    }

    const renders: { uid: string | undefined; ids: string[] }[] = [];
    function Harness({ step }: { step: number }) {
      const { items } = useDiscoverFeed(true, BLOCKED);
      renders.push({
        uid: authUser.current?.uid,
        ids: items.map((i) => i.id),
      });
      useLayoutEffect(() => {
        // Runs in B's commit, after the hook's own layout effect.
        if (step === 1) {
          feed.calls[0].resolve({
            items: [activity("a1", "A")],
            lastDoc: "A-end",
          });
        }
      }, [step]);
      return null;
    }

    const root = createRoot(document.createElement("div"));
    try {
      root.render(<Harness step={0} />);
      await until(() => feed.calls.length === 1);

      authUser.current = { uid: "B" };
      root.render(<Harness step={1} />);
      // B's own fetch starts in its passive effect; wait for it, then let
      // anything A's continuation scheduled land.
      await until(() => feed.calls.length === 2);
      for (let i = 0; i < 5; i++) await tick();

      const underB = renders.filter((r) => r.uid === "B");
      expect(underB.length).toBeGreaterThan(0);
      expect(underB.flatMap((r) => r.ids)).not.toContain("a1");
    } finally {
      root.unmount();
      env.IS_REACT_ACT_ENVIRONMENT = wasActEnvironment;
    }
  });
});
