import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

// ── Module mocks (refs so each test overrides per-call) ──────────────────
const updateProfileMock = vi.fn(async () => ({ ok: true }));
const authMock = vi.fn<
  () => {
    user: { uid: string } | null;
    profile: Record<string, unknown> | null;
    updateProfile: typeof updateProfileMock;
  }
>(() => ({
  user: { uid: "u1" },
  profile: { targetCalories: 2200 },
  updateProfile: updateProfileMock,
}));
const subMock = vi.fn<() => { isPro: boolean }>(() => ({ isPro: true }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => authMock(),
  useUid: () => authMock().user?.uid ?? null,
}));
vi.mock("@/lib/subscription", () => ({ useSubscription: () => subMock() }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore");

import { useAdaptiveTdee } from "../useAdaptiveTdee";
import {
  seedFirestore,
  resetFirestore,
  readsAt,
  flushSnapshots,
} from "@/test/firestoreHarness";

const MEALS = "users/u1/meals";

/** Seed one meal doc per date, all at the same intake. */
function seedMeals(dates: string[], totalCalories: number) {
  seedFirestore(
    Object.fromEntries(
      dates.map((date, i) => [`${MEALS}/m${i}`, { date, totalCalories }])
    )
  );
}

/** Recent local "YYYY-MM-DD" keys (today back), safely inside the 21d window. */
function seedWeights(dates: string[], weight: number) {
  seedFirestore(
    Object.fromEntries(
      dates.map((date) => [`users/u1/bodyweightLogs/${date}`, { date, weight }])
    )
  );
}

function recentDays(n: number): string[] {
  const pad = (x: number) => String(x).padStart(2, "0");
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
}

beforeEach(() => {
  authMock.mockReturnValue({
    user: { uid: "u1" },
    profile: { targetCalories: 2200 },
    updateProfile: updateProfileMock,
  });
  subMock.mockReturnValue({ isPro: true });
  updateProfileMock.mockClear();
  resetFirestore();
});

describe("useAdaptiveTdee — gating (no Firestore reads)", () => {
  it("inactive for free users", () => {
    subMock.mockReturnValue({ isPro: false });
    const { result } = renderHook(() => useAdaptiveTdee());
    expect(result.current.active).toBe(false);
    expect(result.current.showWarmup).toBe(false);
    // Gated hooks must SKIP the read, not read-then-discard — Firestore
    // bills per document.
    expect(readsAt(MEALS)).toEqual([]);
    expect(readsAt("users/u1/bodyweightLogs")).toEqual([]);
  });

  it("inactive when the user has a manual calorie override", () => {
    authMock.mockReturnValue({
      user: { uid: "u1" },
      profile: { targetCalories: 2200, customCalorieTarget: 2000 },
      updateProfile: updateProfileMock,
    });
    const { result } = renderHook(() => useAdaptiveTdee());
    expect(result.current.active).toBe(false);
    expect(readsAt(MEALS)).toEqual([]);
  });

  it("inactive when logged out", () => {
    authMock.mockReturnValue({
      user: null,
      profile: null,
      updateProfile: updateProfileMock,
    });
    const { result } = renderHook(() => useAdaptiveTdee());
    expect(result.current.active).toBe(false);
  });
});

describe("useAdaptiveTdee — active assembly", () => {
  it("Pro user with no data: active, warmup showing, gate not ready, formula target", async () => {
    const { result } = renderHook(() => useAdaptiveTdee());
    await waitFor(() => expect(result.current.showWarmup).toBe(true));
    expect(result.current.active).toBe(true);
    expect(result.current.ready).toBe(false);
    expect(result.current.warmupFraction).toBe(0);
    // Below the gate the target stays on the formula — never a learned number.
    expect(result.current.source).toBe("formula");
    expect(result.current.value).toBe(2200);
  });

  it("free user resolves to the formula value (no learned, no warmup)", () => {
    subMock.mockReturnValue({ isPro: false });
    const { result } = renderHook(() => useAdaptiveTdee());
    expect(result.current.source).toBe("formula");
    expect(result.current.value).toBe(2200);
    expect(result.current.showWarmup).toBe(false);
  });

  it("Pro user with a full window: assembles → gate ready → warmup hidden", async () => {
    const ds = recentDays(21);
    seedMeals(ds, 2500);
    seedWeights(ds, 80);

    const { result } = renderHook(() => useAdaptiveTdee());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.showWarmup).toBe(false);
    // Learned takes over, but the FIRST engage is clamped to formula ± 150 (no
    // jump): flat 80 kg @ 2500 kcal → learned 2500, formula 2200 → applied 2350.
    expect(result.current.source).toBe("learned");
    expect(result.current.value).toBe(2350);
    // Cap state is persisted so the smoothing is stable across sessions.
    await waitFor(() =>
      expect(updateProfileMock).toHaveBeenCalledWith({
        adaptiveCapState: expect.objectContaining({ lastApplied: 2350 }),
      })
    );
  });
});

describe("useAdaptiveTdee — race-taper freeze", () => {
  const pad = (x: number) => String(x).padStart(2, "0");
  const futureKey = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  it("holds the pre-taper learned value through the taper window, ignoring taper intake/weight", async () => {
    // Race 5 days out (inside a half-marathon's 2-week taper) → frozen. A prior
    // learned value lives in adaptiveCapState; taper-period intake is high but
    // must NOT move the estimate.
    authMock.mockReturnValue({
      user: { uid: "u1" },
      profile: {
        targetCalories: 2200,
        runMode: "race_prep",
        raceGoal: { distance: "half", targetDate: futureKey(5) },
        adaptiveCapState: {
          lastApplied: 2450,
          lastAppliedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      updateProfile: updateProfileMock,
    });
    updateProfileMock.mockClear(); // module-level mock isn't auto-reset
    const ds = recentDays(21);
    seedMeals(ds, 3200);
    seedWeights(ds, 78);

    const { result } = renderHook(() => useAdaptiveTdee());
    // Frozen short-circuits to the persisted pre-taper value immediately.
    expect(result.current.source).toBe("learned");
    expect(result.current.value).toBe(2450);
    // The cap is never advanced during the freeze (no corruption).
    await waitFor(() => expect(result.current.value).toBe(2450));
    expect(updateProfileMock).not.toHaveBeenCalled();
  });
});

describe("live adaptive evidence", () => {
  it("becomes ready after new meals and weigh-ins arrive, sharing subscriptions", async () => {
    const first = renderHook(() => useAdaptiveTdee());
    const second = renderHook(() => useAdaptiveTdee());
    await flushSnapshots();
    expect(first.result.current.ready).toBe(false);
    expect(
      readsAt(MEALS).filter((read) => read.op === "onSnapshot")
    ).toHaveLength(1);
    expect(
      readsAt("users/u1/bodyweightLogs").filter(
        (read) => read.op === "onSnapshot"
      )
    ).toHaveLength(1);
    const days = recentDays(21);
    await act(async () => {
      seedMeals(days, 2500);
      seedWeights(days, 80);
    });
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    expect(second.result.current.value).toBe(first.result.current.value);
    first.unmount();
    await act(async () => {
      seedMeals(days, 2600);
    });
    await flushSnapshots();
    expect(second.result.current.ready).toBe(true);
    expect(
      readsAt(MEALS).filter((read) => read.op === "onSnapshot")
    ).toHaveLength(1);
  });

  it("re-evaluates deleted meals and corrected weigh-ins without remounting", async () => {
    const days = recentDays(21);
    seedMeals(days, 2500);
    seedWeights(days, 80);
    const { result } = renderHook(() => useAdaptiveTdee());
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () =>
      seedFirestore(
        Object.fromEntries(
          days.map((date, i) => [
            `${MEALS}/m${i}`,
            { date, totalCalories: 2500, deletedAt: 1 },
          ])
        )
      )
    );
    await waitFor(() => expect(result.current.ready).toBe(false));
    await act(async () => {
      seedMeals(days, 2500);
      seedWeights(days, 79);
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it("does not show the prior account's evidence after an account switch", async () => {
    const days = recentDays(21);
    seedMeals(days, 2500);
    seedWeights(days, 80);
    const { result, rerender } = renderHook(() => useAdaptiveTdee());
    await waitFor(() => expect(result.current.ready).toBe(true));
    authMock.mockReturnValue({
      user: { uid: "u2" },
      profile: { targetCalories: 1900 },
      updateProfile: updateProfileMock,
    });
    rerender();
    await flushSnapshots();
    expect(result.current.ready).toBe(false);
    expect(result.current.value).toBe(1900);
  });
});
