import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

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
const bodyweightMock = vi.fn<() => Promise<{ date: string; weight: number }[]>>(
  async () => []
);
const getDocsMock = vi.fn(async () => ({ docs: [] as unknown[] }));

vi.mock("@/lib/auth", () => ({ useAuth: () => authMock() }));
vi.mock("@/lib/subscription", () => ({ useSubscription: () => subMock() }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/api", () => ({
  fetchBodyweightLogs: () => bodyweightMock(),
}));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  getDocs: () => getDocsMock(),
}));

import { useAdaptiveTdee } from "../useAdaptiveTdee";

/** Recent local "YYYY-MM-DD" keys (today back), safely inside the 21d window. */
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
  bodyweightMock.mockResolvedValue([]);
  getDocsMock.mockResolvedValue({ docs: [] });
});

describe("useAdaptiveTdee — gating (no Firestore reads)", () => {
  it("inactive for free users", () => {
    subMock.mockReturnValue({ isPro: false });
    const { result } = renderHook(() => useAdaptiveTdee());
    expect(result.current.active).toBe(false);
    expect(result.current.showWarmup).toBe(false);
    expect(getDocsMock).not.toHaveBeenCalled();
    expect(bodyweightMock).not.toHaveBeenCalled();
  });

  it("inactive when the user has a manual calorie override", () => {
    authMock.mockReturnValue({
      user: { uid: "u1" },
      profile: { targetCalories: 2200, customCalorieTarget: 2000 },
      updateProfile: updateProfileMock,
    });
    const { result } = renderHook(() => useAdaptiveTdee());
    expect(result.current.active).toBe(false);
    expect(getDocsMock).not.toHaveBeenCalled();
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
    getDocsMock.mockResolvedValue({
      docs: ds.map((date) => ({
        data: () => ({ date, totalCalories: 2500 }),
      })),
    });
    bodyweightMock.mockResolvedValue(ds.map((date) => ({ date, weight: 80 })));

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
