import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";

/**
 * SOCIAL-PRIVACY-01 — uid + generation ownership. A feed fetch captured
 * under account A must not commit its items after a switch to account B
 * (shared browser / account switch mid-fetch).
 */

const authUser = vi.hoisted(() => ({
  current: { uid: "A" } as { uid: string } | null,
}));
vi.mock("../../lib/auth", () => ({
  useAuth: () => ({ user: authUser.current }),
  useUid: () => ({ user: authUser.current }).user?.uid ?? null,
}));

// getFeed returns a promise we resolve by hand so we can switch accounts
// while a fetch is in flight.
const getFeedDeferred = vi.hoisted(
  () =>
    ({ resolve: null }) as {
      resolve: ((v: { items: unknown[]; lastDoc: undefined }) => void) | null;
    }
);
vi.mock("../../lib/socialApi", () => ({
  getFeed: vi.fn(
    () =>
      new Promise((res) => {
        getFeedDeferred.resolve = res;
      })
  ),
  fetchActivitiesByIds: vi.fn(async () => ({})),
  batchGetKudos: vi.fn(async () => ({})),
}));
vi.mock("../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { useSocialFeed } from "../useSocialFeed";

function feedItem(id: string, authorId: string) {
  return {
    id,
    activityId: id,
    authorId,
    authorName: "x",
    type: "workout",
    summary: "",
    createdAt: null,
  };
}

describe("useSocialFeed — uid/generation ownership", () => {
  beforeEach(() => {
    authUser.current = { uid: "A" };
    getFeedDeferred.resolve = null;
  });

  it("drops a fetch resolved under account A after a switch to account B", async () => {
    const { result, rerender } = renderHook(() =>
      useSocialFeed(false, new Set(), true)
    );

    // A's fetch is in flight.
    await waitFor(() => expect(getFeedDeferred.resolve).not.toBeNull());
    const resolveA = getFeedDeferred.resolve!;

    // Switch to account B before A's fetch resolves — bumps the generation.
    getFeedDeferred.resolve = null;
    authUser.current = { uid: "B" };
    rerender();

    // Now resolve A's stale fetch. Its items must NOT commit under B.
    await act(async () => {
      resolveA({ items: [feedItem("a1", "A")], lastDoc: undefined });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.items).toEqual([]);
  });

  /* The case above resolves A's fetch after `rerender()` has returned, and
     `act` flushes a commit AND its passive effects before it returns — so
     it cannot open the window a browser has: B commits, the frame paints,
     and only then do passive effects run. A response from A landing in
     that gap must already be refused, which is why the generation moves
     in a LAYOUT effect. This renders without `act`, so React schedules the
     passive effects as their own task, and resolves A's fetch from B's own
     commit; A's continuation then runs before B's passive effects. */
  it("drops A's fetch landing between B's commit and B's passive effects", async () => {
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const wasActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = false;
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    async function until(check: () => boolean) {
      for (let i = 0; i < 50 && !check(); i++) await tick();
      expect(check()).toBe(true);
    }

    const blocked = new Set<string>();
    const renders: { uid: string | undefined; ids: string[] }[] = [];
    let resolveA:
      | ((v: { items: unknown[]; lastDoc: undefined }) => void)
      | null = null;
    function Harness({ step }: { step: number }) {
      const { items } = useSocialFeed(false, blocked, true);
      renders.push({
        uid: authUser.current?.uid,
        ids: items.map((i) => i.id),
      });
      useLayoutEffect(() => {
        // Runs in B's commit, after the hook's own layout effect.
        if (step === 1 && resolveA) {
          resolveA({ items: [feedItem("a1", "A")], lastDoc: undefined });
          resolveA = null;
        }
      }, [step]);
      return null;
    }

    const root = createRoot(document.createElement("div"));
    try {
      root.render(<Harness step={0} />);
      await until(() => getFeedDeferred.resolve !== null);
      resolveA = getFeedDeferred.resolve;
      getFeedDeferred.resolve = null;

      authUser.current = { uid: "B" };
      root.render(<Harness step={1} />);
      // B's own fetch starts in its passive effect; wait for it, then let
      // anything A's continuation scheduled land.
      await until(() => getFeedDeferred.resolve !== null);
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
