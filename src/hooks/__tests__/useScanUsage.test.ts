/**
 * F1b — client-side per-action scan usage hook.
 *
 * Pinned behaviours:
 *   1. Free user + default action (image_ai) → limit=0, remaining=0.
 *      The "free user image-AI is Pro-only" gate surfaces at the
 *      hook layer so callers can render an upgrade CTA instead of
 *      a normal counter.
 *   2. Free user + text_ai → limit=10, used reflects today's count.
 *   3. Pro user + image_ai → limit=100; used decremented from
 *      remaining correctly.
 *   4. Pro user + text_ai → limit=100.
 *   5. Trial user (isInTrial=true) → treated as Pro for limits.
 *   6. Stale day in the doc → used=0 (server-side reset model;
 *      client-side display matches).
 *   7. Legacy {count, month} doc shape → used=0 (no migration
 *      required; matches server-side helper).
 *
 * MIGRATED to the ADR-0009 fake (was a hand-rolled onSnapshot stub that
 * captured the listener so tests could push synthetic snapshots). The
 * assertions here were always substantive — derived limits, not call
 * shapes — so the migration is mostly mechanical. It does buy one thing
 * the stub could not: `doc` was `vi.fn()` returning UNDEFINED, so nothing
 * checked the hook reads `scanUsage/{uid}`. Seeding by path means a wrong
 * collection now fails instead of silently reading the same synthetic
 * snapshot.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Module-level mock refs so individual tests can override the
// fixture per-call without the vi.mock factory hoisting issue.
const authMock = vi.fn<() => { user: { uid: string } | null }>(() => ({
  user: { uid: "uid_test" },
}));
const subscriptionMock = vi.fn<() => { isPro: boolean; isInTrial: boolean }>(
  () => ({ isPro: false, isInTrial: false })
);

vi.mock("@/lib/auth", () => ({
  useAuth: () => authMock(),
  useUid: () => authMock().user?.uid ?? null,
}));
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/subscription", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/subscription")>(
      "@/lib/subscription"
    );
  return {
    ...actual,
    useSubscription: () => subscriptionMock(),
  };
});

vi.mock("firebase/firestore");

import { useScanUsage } from "../useScanUsage";
import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";

/** The hook reads `scanUsage/{uid}` — seeding by path pins that. */
function seedUsage(data: Record<string, unknown> | null) {
  if (data) seedFirestore({ "scanUsage/uid_test": data });
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

beforeEach(() => {
  resetFirestore();
  authMock.mockReset();
  subscriptionMock.mockReset();
  authMock.mockReturnValue({ user: { uid: "uid_test" } });
  subscriptionMock.mockReturnValue({ isPro: false, isInTrial: false });
});

describe("useScanUsage", () => {
  it("Cycle 1: free user + default action (image_ai) reports limit=0 (Pro-only gate)", async () => {
    seedUsage(null);
    const { result } = renderHook(() => useScanUsage());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.limit).toBe(0);
    expect(result.current.remaining).toBe(0);
    expect(result.current.isUnlimited).toBe(false);
    expect(result.current.action).toBe("image_ai");
  });

  it("Cycle 2: free user + text_ai reports limit=10; used reflects today's count", async () => {
    seedUsage({ text_ai: { day: todayKey(), count: 4 } });
    const { result } = renderHook(() => useScanUsage("text_ai"));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.limit).toBe(10);
    expect(result.current.used).toBe(4);
    expect(result.current.remaining).toBe(6);
    expect(result.current.action).toBe("text_ai");
  });

  it("Cycle 3: pro user + image_ai reports limit=100; remaining decrements from used", async () => {
    subscriptionMock.mockReturnValue({ isPro: true, isInTrial: false });
    seedUsage({ image_ai: { day: todayKey(), count: 80 } });
    const { result } = renderHook(() => useScanUsage("image_ai"));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.limit).toBe(100);
    expect(result.current.used).toBe(80);
    expect(result.current.remaining).toBe(20);
    expect(result.current.isUnlimited).toBe(true);
  });

  it("Cycle 4: pro user + text_ai reports limit=100", async () => {
    subscriptionMock.mockReturnValue({ isPro: true, isInTrial: false });
    seedUsage({ text_ai: { day: todayKey(), count: 30 } });
    const { result } = renderHook(() => useScanUsage("text_ai"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.limit).toBe(100);
    expect(result.current.remaining).toBe(70);
  });

  it("Cycle 5: trial user (isInTrial=true) gets Pro limits", async () => {
    subscriptionMock.mockReturnValue({ isPro: false, isInTrial: true });
    seedUsage({ image_ai: { day: todayKey(), count: 0 } });
    const { result } = renderHook(() => useScanUsage("image_ai"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.limit).toBe(100);
    expect(result.current.remaining).toBe(100);
    expect(result.current.isUnlimited).toBe(true);
  });

  it("Cycle 6: stale day in doc → used=0 (counter resets at local midnight)", async () => {
    seedUsage({ text_ai: { day: "2020-01-01", count: 99 } });
    const { result } = renderHook(() => useScanUsage("text_ai"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.used).toBe(0);
    expect(result.current.remaining).toBe(10);
  });

  it("Cycle 7: legacy {count, month} doc shape → used=0 (no migration script needed)", async () => {
    seedUsage({ count: 7, month: "2026-05" });
    const { result } = renderHook(() => useScanUsage("text_ai"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.used).toBe(0);
    expect(result.current.remaining).toBe(10);
  });
});
