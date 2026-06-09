/**
 * useEffectiveTargets — live program→nutrition wiring (running copy).
 *
 * The lib tests prove the translator + getAdjustedTargets. This proves the
 * RUNNING copy: useEffectiveTargets subscribes to the real programState doc
 * and feeds it through, so the dead-branch fix is actually live on the Food
 * hero — not just in a lib unit test. We assert the protein multiplier the
 * tiles render flips with the program's phase.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useEffectiveTargets } from "../useEffectiveTargets";
import type { AdaptiveTdeeView } from "@/lib/adaptiveTarget";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";
import { LIFT_ONLY, PRO_TAPER, makeProfile } from "@/test/nutritionFixtures";

const h = vi.hoisted(() => ({
  profile: null as UserProfile | null,
  program: null as ProgramState | null,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u1" }, profile: h.profile }),
}));

vi.mock("@/hooks/useAdaptiveTdee", () => ({
  useAdaptiveTdee: (): AdaptiveTdeeView => ({
    active: false,
    ready: false,
    source: "formula",
    // formula path → finalTarget === profile.targetCalories
    value: h.profile?.targetCalories ?? 2200,
    showWarmup: false,
    warmupFraction: 0,
    stalled: false,
  }),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({ __kind: "collection" })),
  doc: vi.fn(() => ({ __kind: "programDoc" })),
  query: vi.fn(() => ({ __kind: "query" })),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  // Fire the callback only for the programState doc subscription, with the
  // injected fixture program. Workouts/runs stay unloaded (burn is display-
  // only and irrelevant to the macro split).
  onSnapshot: vi.fn(
    (refOrQuery: { __kind?: string }, cb: (snap: unknown) => void) => {
      if (refOrQuery?.__kind === "programDoc") {
        cb({ exists: () => h.program != null, data: () => h.program });
      }
      return () => {};
    }
  ),
  Timestamp: { fromDate: (d: Date) => ({ toDate: () => d }) },
}));

// All-lift schedule so any test date resolves to a training day (protein is
// phase-driven and dayType-independent, but this keeps the fixture coherent).
const ALL_LIFT = Array.from({ length: 7 }, (_, day) => ({
  day,
  type: "lift" as const,
}));

describe("useEffectiveTargets — live program-phase wiring", () => {
  beforeEach(() => {
    h.profile = makeProfile({
      weightKg: 80,
      weeklyWorkoutsTarget: 4,
      primaryGoal: "strength",
      weekSchedule: ALL_LIFT,
    });
    h.program = null;
  });

  it("deload-week program → tiles render eased deload protein (1.8 × kg)", () => {
    h.program = LIFT_ONLY({ currentPhase: "deload", weekNumber: 4 }).program!;
    const { result } = renderHook(() => useEffectiveTargets());
    expect(result.current.protein).toBe(Math.round(1.8 * 80)); // 144
  });

  it("progression-week program → strength PrimaryGoal protein (2.2 × kg)", () => {
    h.program = LIFT_ONLY().program!; // strength, progression, wk2
    const { result } = renderHook(() => useEffectiveTargets());
    expect(result.current.protein).toBe(Math.round(2.2 * 80)); // 176
  });

  it("no programState doc → safe legacy fallback (base 2.0 × kg)", () => {
    h.program = null;
    const { result } = renderHook(() => useEffectiveTargets());
    expect(result.current.protein).toBe(Math.round(2.0 * 80)); // 160
  });

  it("macros still reconcile to finalTarget under the program-driven phase", () => {
    h.program = LIFT_ONLY().program!;
    const { result } = renderHook(() => useEffectiveTargets());
    const t = result.current;
    const sum = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    expect(Math.abs(sum - t.finalTarget)).toBeLessThanOrEqual(2);
  });
});

describe("useEffectiveTargets — race taper (the only forward calorie move)", () => {
  beforeEach(() => {
    h.program = null;
  });

  const reconciles = (t: {
    finalTarget: number;
    protein: number;
    carbs: number;
    fat: number;
  }) => Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.finalTarget);

  it("PRO_TAPER taper week: calories contract vs base, split reconciles, taperActive", () => {
    const { profile } = PRO_TAPER({ daysToRace: 6 });
    h.profile = profile; // targetCalories 2500
    const { result } = renderHook(() => useEffectiveTargets());
    const t = result.current;
    expect(t.taperActive).toBe(true);
    expect(t.finalTarget).toBeLessThan(2500); // contracted
    expect(reconciles(t)).toBeLessThanOrEqual(2);
  });

  it("final-days carb-load: calories bump back up and carbs exceed a taper-week day", () => {
    h.profile = PRO_TAPER({ daysToRace: 6 }).profile;
    const taperDay = renderHook(() => useEffectiveTargets()).result.current;

    h.profile = PRO_TAPER({ daysToRace: 1 }).profile;
    const carbLoad = renderHook(() => useEffectiveTargets()).result.current;

    expect(carbLoad.taperActive).toBe(true);
    expect(carbLoad.finalTarget).toBeGreaterThan(2500); // +carb-load bump
    expect(carbLoad.carbs).toBeGreaterThan(taperDay.carbs); // loading
    expect(reconciles(carbLoad)).toBeLessThanOrEqual(2);
  });

  it("LIFT_ONLY / no-race user: taper NEVER fires (no spurious calorie cut)", () => {
    h.profile = LIFT_ONLY().profile; // no runMode/raceGoal
    const { result } = renderHook(() => useEffectiveTargets());
    expect(result.current.taperActive).toBe(false);
    expect(result.current.finalTarget).toBe(2500); // flat, uncut
  });
});
