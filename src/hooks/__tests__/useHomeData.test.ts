/* eslint-disable @typescript-eslint/no-explicit-any -- mock return types need any casts */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { getDocs } from "firebase/firestore";
import { useHomeData } from "../useHomeData";
import type { UserProfile } from "@/lib/auth";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  Timestamp: { fromDate: vi.fn(() => ({ seconds: 0, nanoseconds: 0 })) },
  orderBy: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("date-fns", () => ({
  format: vi.fn((_d: unknown, _fmt: string) => "2026-04-01"),
}));

function makeSnap(docs: Record<string, unknown>[], empty = false) {
  const docObjects = docs.map((d) => ({ data: () => d }));
  return {
    docs: docObjects,
    forEach: (fn: (doc: { data: () => Record<string, unknown> }) => void) =>
      docObjects.forEach(fn),
    empty: empty || docs.length === 0,
    size: docs.length,
  };
}

const EMPTY_SNAP = makeSnap([], true);

/** Sets up getDocs to return the same 3 snapshots on every call cycle (handles React strict mode double-invocation) */
function mockGetDocs(mealsSnap: any, runsSnap: any, weightSnap: any) {
  let callIndex = 0;
  const results = [mealsSnap, runsSnap, weightSnap];
  vi.mocked(getDocs).mockImplementation(() => {
    const idx = callIndex % 3;
    callIndex++;
    return Promise.resolve(results[idx]);
  });
}

/** Like mockGetDocs but the meals query rejects */
function mockGetDocsWithMealFailure(runsSnap: any, weightSnap: any) {
  let callIndex = 0;
  vi.mocked(getDocs).mockImplementation(() => {
    const idx = callIndex % 3;
    callIndex++;
    if (idx === 0) return Promise.reject(new Error("network error"));
    if (idx === 1) return Promise.resolve(runsSnap);
    return Promise.resolve(weightSnap);
  });
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u1",
    displayName: "Test",
    email: "test@test.com",
    weightKg: 70,
    heightCm: 175,
    age: 30,
    sex: "male",
    activityLevel: "moderate",
    goal: "maintain",
    experienceLevel: "intermediate",
    onboardingComplete: true,
    targetCalories: 2500,
    targetProtein: 160,
    targetCarbs: 300,
    targetFat: 80,
    ...overrides,
  } as UserProfile;
}

describe("useHomeData", { timeout: 5000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts in loading state and resolves to not loading", async () => {
    mockGetDocs(EMPTY_SNAP, EMPTY_SNAP, EMPTY_SNAP);

    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, makeProfile(), [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("returns zero defaults when no user", () => {
    const { result } = renderHook(() => useHomeData(null, null, [], "kg"));

    expect(result.current.dailyCal).toBe(0);
    expect(result.current.dailyProt).toBe(0);
    expect(result.current.loading).toBe(true);
  });

  it("computes meal totals from Firestore results", async () => {
    const mealsSnap = makeSnap([
      { totalCalories: 500, totalProtein: 40 },
      { calories: 300, protein: 20 },
    ]);
    mockGetDocs(mealsSnap, EMPTY_SNAP, EMPTY_SNAP);

    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, makeProfile(), [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.dailyCal).toBe(800);
    expect(result.current.dailyProt).toBe(60);
  });

  it("computes run calories using weight and distance", async () => {
    const runsSnap = makeSnap([{ distance: 5000, duration: 1800 }]);
    mockGetDocs(EMPTY_SNAP, runsSnap, EMPTY_SNAP);

    const profile = makeProfile({ weightKg: 80 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // 80 * 5 * 1.036 = 414.4 → 414
    expect(result.current.todayRunCals).toBe(414);
  });

  // P0.5 run-stat hygiene: a saved-anyway invalid run (the
  // misclick / fat-fingered-distance case from PR #480) must not
  // contribute phantom calories to today's energy aggregate.
  // Pre-fix this hook only read `distance` and the calorie estimate
  // pulled in ~414kcal for a 5km "too-fast" save the user never
  // actually ran.
  it("excludes isInvalid runs from todayRunCals", async () => {
    const runsSnap = makeSnap([
      { distance: 5000, duration: 1800, isInvalid: true },
    ]);
    mockGetDocs(EMPTY_SNAP, runsSnap, EMPTY_SNAP);

    const profile = makeProfile({ weightKg: 80 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.todayRunCals).toBe(0);
  });

  it("excludes savedAnyway runs from todayRunCals", async () => {
    const runsSnap = makeSnap([
      { distance: 5000, duration: 1800, savedAnyway: true },
    ]);
    mockGetDocs(EMPTY_SNAP, runsSnap, EMPTY_SNAP);

    const profile = makeProfile({ weightKg: 80 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.todayRunCals).toBe(0);
  });

  it("still counts legacy runs (no isInvalid / savedAnyway fields)", async () => {
    // Pre-PR-#480 docs have neither flag. The eligibility predicate
    // treats missing flags as not-flagged so historic runs stay in
    // the aggregate; the distance/duration floors (50m + 30s) still
    // gate them. Regression guard for the missing-field branch.
    const runsSnap = makeSnap([{ distance: 5000, duration: 1800 }]);
    mockGetDocs(EMPTY_SNAP, runsSnap, EMPTY_SNAP);

    const profile = makeProfile({ weightKg: 80 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.todayRunCals).toBe(414);
  });

  it("falls back to profile weight when bodyweightLogs is empty (kg)", async () => {
    mockGetDocs(EMPTY_SNAP, EMPTY_SNAP, EMPTY_SNAP);

    const profile = makeProfile({ weightKg: 75 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.lastWeightInfo).toEqual({
      weight: "75.0",
      date: "From profile",
      rawDate: null,
    });
  });

  it("falls back to profile weight when bodyweightLogs is empty (lbs)", async () => {
    mockGetDocs(EMPTY_SNAP, EMPTY_SNAP, EMPTY_SNAP);

    const profile = makeProfile({ weightKg: 75 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "lbs")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.lastWeightInfo!.weight).toBe("165.3");
  });

  it("handles partial failures gracefully (Promise.allSettled)", async () => {
    // P0.5: `duration` is required for the run to pass
    // isCountableRun's 30s floor. Pre-fix this test only set
    // distance and still aggregated; after the eligibility filter
    // landed, missing duration drops the run from the aggregate.
    mockGetDocsWithMealFailure(
      makeSnap([{ distance: 3000, duration: 1200 }]),
      EMPTY_SNAP
    );

    const profile = makeProfile({ weightKg: 70 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toContain("Failed to load meals");
    // Runs still computed: 70 * 3 * 1.036 = 217.56 → 218
    expect(result.current.todayRunCals).toBe(218);
  });

  it("converts weight to lbs when weightUnit is lbs", async () => {
    const weightSnap = makeSnap([{ date: "2026-03-30", weight: 80 }]);
    mockGetDocs(EMPTY_SNAP, EMPTY_SNAP, weightSnap);

    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, makeProfile(), [], "lbs")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // 80 * 2.20462 = 176.3696 → "176.4"
    expect(result.current.lastWeightInfo!.weight).toBe("176.4");
  });

  it("setLastWeightInfo updates weight optimistically", async () => {
    mockGetDocs(EMPTY_SNAP, EMPTY_SNAP, EMPTY_SNAP);

    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, makeProfile({ weightKg: 70 }), [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const newWeight = { weight: "82.0", date: "Apr 1", rawDate: "2026-04-01" };
    result.current.setLastWeightInfo(newWeight);

    await waitFor(() => {
      expect(result.current.lastWeightInfo).toEqual(newWeight);
    });
  });
});
