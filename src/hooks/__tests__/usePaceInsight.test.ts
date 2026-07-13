// @vitest-environment jsdom
/**
 * usePaceInsightFromRuns — Pro-gated controller with UID-scoped dismissal and
 * an honest 3-state accept. Pins the correctness fixes: dismissals can't leak
 * across accounts, and a failed persistence is a real "failure" (not a silent
 * success), while an account switch mid-write is "stale" (no A feedback under
 * B).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { PaceInsight } from "@/lib/runPaces";
import type { PaceInsightRun } from "../usePaceInsight";

// Hoisted mutable state (vi.mock factories are hoisted above module init).
const H = vi.hoisted(() => ({
  authState: {
    user: { uid: "A" } as { uid: string } | null,
    profile: { uid: "A", runFitness: { vdot: 42 } } as {
      uid: string;
      runFitness: unknown;
    } | null,
    updateProfile: undefined as unknown,
  },
  isPro: true,
  fbAuth: { currentUser: { uid: "A" } as { uid: string } | null },
  engineInsight: null as PaceInsight | null,
}));
const authState = H.authState;
const fbAuth = H.fbAuth;

vi.mock("@/lib/auth", () => ({ useAuth: () => H.authState }));
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({ isPro: H.isPro }),
}));
vi.mock("@/lib/firebase", () => ({ auth: H.fbAuth }));
vi.mock("@/lib/runStatsEligibility", () => ({ isPaceEligible: () => true }));
vi.mock("@/lib/runPaces", () => ({
  resolvePaceInsight: () => H.engineInsight,
  vdotFromRace: () => 45,
}));

import { usePaceInsightFromRuns } from "../usePaceInsight";

const INSIGHT: PaceInsight = {
  currentVdot: 42,
  suggestedVdot: 45,
  suggestedBenchmark: { distanceM: 5000, timeS: 1200 },
  direction: "faster",
};
const run = (): PaceInsightRun => ({
  id: "r1",
  distance: 5000,
  duration: 1200,
  avgPace: 240,
  completedAt: new Date(),
});

beforeEach(() => {
  authState.user = { uid: "A" };
  authState.profile = { uid: "A", runFitness: { vdot: 42 } };
  authState.updateProfile = vi.fn().mockResolvedValue({ ok: true });
  H.isPro = true;
  fbAuth.currentUser = { uid: "A" };
  H.engineInsight = INSIGHT;
  try {
    window.localStorage.clear();
  } catch {
    /* noop */
  }
});
afterEach(() => vi.clearAllMocks());

describe("usePaceInsightFromRuns — gating", () => {
  it("free users never get a suggestion", () => {
    H.isPro = false;
    const { result } = renderHook(() => usePaceInsightFromRuns([run()]));
    expect(result.current.insight).toBeNull();
  });

  it("loading or missing fitness returns null", () => {
    const a = renderHook(() =>
      usePaceInsightFromRuns([run()], { loading: true })
    );
    expect(a.result.current.insight).toBeNull();
    authState.profile = { uid: "A", runFitness: null };
    const b = renderHook(() => usePaceInsightFromRuns([run()]));
    expect(b.result.current.insight).toBeNull();
  });

  it("a profile whose uid != the auth user cannot suggest", () => {
    authState.profile = { uid: "B", runFitness: { vdot: 42 } };
    const { result } = renderHook(() => usePaceInsightFromRuns([run()]));
    expect(result.current.insight).toBeNull();
  });

  it("surfaces the engine's insight for a Pro user", () => {
    const { result } = renderHook(() => usePaceInsightFromRuns([run()]));
    expect(result.current.insight).toEqual(INSIGHT);
  });
});

describe("usePaceInsightFromRuns — dismissal is UID-scoped", () => {
  it("dismiss suppresses the rounded VDOT for the current uid only", () => {
    const { result, rerender } = renderHook(() =>
      usePaceInsightFromRuns([run()])
    );
    expect(result.current.insight).toEqual(INSIGHT);
    act(() => result.current.dismiss());
    rerender();
    expect(result.current.insight).toBeNull();
    // A's dismissal is stored under A's key.
    expect(window.localStorage.getItem("tropos.dismiss.paceInsight:A")).toBe(
      "45"
    );

    // Switch to B — B has no stored dismissal, so the suggestion re-surfaces.
    authState.user = { uid: "B" };
    authState.profile = { uid: "B", runFitness: { vdot: 42 } };
    fbAuth.currentUser = { uid: "B" };
    const b = renderHook(() => usePaceInsightFromRuns([run()]));
    expect(b.result.current.insight).toEqual(INSIGHT);
  });
});

describe("usePaceInsightFromRuns — accept is honest", () => {
  it("success writes source:'derived' and returns 'success'", async () => {
    const { result } = renderHook(() => usePaceInsightFromRuns([run()]));
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.accept();
    });
    expect(outcome).toBe("success");
    expect(authState.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        runFitness: expect.objectContaining({ source: "derived" }),
      }),
      { throwOnError: true }
    );
  });

  it("a failed persistence returns 'failure' (retryable)", async () => {
    authState.updateProfile = vi.fn().mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => usePaceInsightFromRuns([run()]));
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.accept();
    });
    expect(outcome).toBe("failure");
  });

  it("an account switch during persistence returns 'stale'", async () => {
    authState.updateProfile = vi.fn().mockImplementation(async () => {
      // Simulate B becoming current mid-write.
      fbAuth.currentUser = { uid: "B" };
      return { ok: true };
    });
    const { result } = renderHook(() => usePaceInsightFromRuns([run()]));
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.accept();
    });
    expect(outcome).toBe("stale");
  });
});
