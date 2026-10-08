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
  /** The runs the engine was handed last. */
  engineRuns: [] as { id?: string }[],
}));
const authState = H.authState;
const fbAuth = H.fbAuth;

vi.mock("@/lib/auth", () => ({
  useAuth: () => H.authState,
  useUid: () => H.authState.user?.uid ?? null,
}));
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({ isPro: H.isPro }),
}));
vi.mock("@/lib/firebase", () => ({ auth: H.fbAuth }));
vi.mock("@/lib/runStatsEligibility", () => ({ isPaceEligible: () => true }));
vi.mock("@/lib/runPaces", () => ({
  resolvePaceInsight: (_fitness: unknown, runs: { id?: string }[]) => {
    H.engineRuns = runs;
    return runs.length ? H.engineInsight : null;
  },
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

/* Run20 (5): a run-walk's time includes its walks, so its pace is no one's
   running. Three of them suggested a benchmark from a new runner's walking
   pace (review of #2655). */
describe("usePaceInsightFromRuns — a run-walk", () => {
  const walked = (id: string): PaceInsightRun => ({
    ...run(),
    id,
    duration: 1740,
    templateId: "run_walk_3",
  });

  it("sets no benchmark, and the runs around it do", () => {
    renderHook(() =>
      usePaceInsightFromRuns([walked("rw1"), run(), walked("rw2")])
    );
    expect(H.engineRuns.map((r) => r.id)).toEqual(["r1"]);
  });

  it("alone suggests nothing", () => {
    const { result } = renderHook(() =>
      usePaceInsightFromRuns([walked("rw1"), walked("rw2"), walked("rw3")])
    );
    expect(result.current.insight).toBeNull();
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

  /* The case above switches accounts on a FRESH mount, so nothing A did in
     memory could reach B. These switch on the SAME mount — a surface that
     stays up across a sign-in — where a dismissal held in state, or a
     stored one read once, would otherwise carry over. */
  const switchToB = () => {
    authState.user = { uid: "B" };
    authState.profile = { uid: "B", runFitness: { vdot: 42 } };
    fbAuth.currentUser = { uid: "B" };
  };

  it("a dismissal made on this mount does not follow an account switch", () => {
    const { result, rerender } = renderHook(() =>
      usePaceInsightFromRuns([run()])
    );
    expect(result.current.insight).toEqual(INSIGHT);
    act(() => result.current.dismiss());
    expect(result.current.insight).toBeNull();

    switchToB();
    rerender();
    expect(result.current.insight).toEqual(INSIGHT);
  });

  it("the stored dismissal is read for the account now signed in", () => {
    window.localStorage.setItem("tropos.dismiss.paceInsight:A", "45");
    const { result, rerender } = renderHook(() =>
      usePaceInsightFromRuns([run()])
    );
    // A dismissed this suggestion on an earlier visit.
    expect(result.current.insight).toBeNull();

    // B never did: A's stored dismissal must not answer for B.
    switchToB();
    rerender();
    expect(result.current.insight).toEqual(INSIGHT);
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
