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
import {
  LIFT_ONLY,
  PRO_TAPER,
  FREE_RUN,
  makeProfile,
  makeProgram,
  liftDay,
} from "@/test/nutritionFixtures";

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

describe("useEffectiveTargets — training label gating (free→Pro conversion hook)", () => {
  // High-volume lift on an all-lift week → classifier HARD on any date, so the
  // gate is exercised without date alignment.
  const hardProgram = () =>
    makeProgram({
      primaryGoal: "hypertrophy",
      currentPhase: "progression",
      weekNumber: 2,
      workouts: [liftDay("Heavy", 8, 4, 6)], // 192 reps → HARD
    });
  const hardProfile = (tier: "free" | "pro") =>
    makeProfile({
      weightKg: 80,
      targetCalories: 2500,
      subscriptionTier: tier,
      weekSchedule: ALL_LIFT,
    });

  it("FREE on a HARD day: descriptive label shows, macros stay FLAT (no shift), copy never claims a change", () => {
    h.profile = hardProfile("free");
    h.program = hardProgram();
    const free = renderHook(() => useEffectiveTargets()).result.current;

    expect(free.annotation).toBe("Hard session"); // label visible to free
    // Flat baseline: fat at the ~25% calorie-fraction baseline (REST), NOT cut.
    expect(free.fat).toBe(69); // round(0.25 * 2500 / 9)
    expect(free.taperActive).toBe(false);
    // Honest copy — must not assert carbs/fat moved.
    expect(free.annotation).not.toMatch(/up|down|increase|loaded/i);
    // trainingFuel: eligible (real training day) but NOT applied for free.
    expect(free.trainingFuel.eligible).toBe(true);
    expect(free.trainingFuel.applied).toBe(false);
    expect(free.trainingFuel.carbDeltaG).toBe(0);
    expect(free.trainingFuel.fatDeltaG).toBe(0);
    expect(free.trainingFuel.proteinDeltaG).toBe(0);
  });

  it("PRO on the SAME HARD day: same label AND macros shift (fat down, carbs up)", () => {
    h.profile = hardProfile("free");
    h.program = hardProgram();
    const free = renderHook(() => useEffectiveTargets()).result.current;

    h.profile = hardProfile("pro");
    h.program = hardProgram();
    const pro = renderHook(() => useEffectiveTargets()).result.current;

    expect(pro.annotation).toBe(free.annotation); // same descriptive label
    expect(pro.fat).toBeLessThan(free.fat); // shift applied for Pro
    expect(pro.carbs).toBeGreaterThan(free.carbs);
    // trainingFuel reports the EXACT applied delta vs the same-calorie REST
    // split (== the free user's split at the same finalTarget).
    expect(pro.trainingFuel.eligible).toBe(true);
    expect(pro.trainingFuel.applied).toBe(true);
    expect(pro.trainingFuel.carbDeltaG).toBe(pro.carbs - free.carbs);
    expect(pro.trainingFuel.fatDeltaG).toBe(free.fat - pro.fat);
    expect(pro.trainingFuel.proteinDeltaG).toBe(
      Math.max(0, pro.protein - free.protein)
    );
    // Both still reconcile to the (flat) calorie target.
    for (const t of [free, pro]) {
      expect(
        Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.finalTarget)
      ).toBeLessThanOrEqual(2);
    }
  });

  it("rest day: trainingFuel is not eligible and has zero deltas", () => {
    h.profile = makeProfile({
      subscriptionTier: "pro",
      weekSchedule: Array.from({ length: 7 }, (_, day) => ({
        day,
        type: "rest" as const,
      })),
    });
    h.program = null;
    const rest = renderHook(() => useEffectiveTargets()).result.current;
    expect(rest.trainingFuel.eligible).toBe(false);
    expect(rest.trainingFuel.applied).toBe(false);
    expect(rest.trainingFuel.carbDeltaG).toBe(0);
    expect(rest.trainingFuel.fatDeltaG).toBe(0);
    expect(rest.trainingFuel.proteinDeltaG).toBe(0);
  });

  it("rest / planless day: annotation suppressed (empty)", () => {
    h.profile = makeProfile({
      subscriptionTier: "pro",
      weekSchedule: Array.from({ length: 7 }, (_, day) => ({
        day,
        type: "rest" as const,
      })),
    });
    h.program = null;
    expect(
      renderHook(() => useEffectiveTargets()).result.current.annotation
    ).toBe("");

    h.profile = FREE_RUN().profile; // no plan
    h.program = null;
    expect(
      renderHook(() => useEffectiveTargets()).result.current.annotation
    ).toBe("");
  });

  it("free race-prep user sees the race-week label but no calorie move (conversion hook)", () => {
    const free = {
      ...PRO_TAPER({ daysToRace: 1 }).profile, // final days → carb-load label
      subscriptionTier: "free" as const,
    };
    h.profile = free;
    h.program = null;
    const t = renderHook(() => useEffectiveTargets()).result.current;
    expect(t.annotation).toBe("Race week — carb load"); // label shown to free
    expect(t.taperActive).toBe(false); // but the calorie move is NOT applied
    expect(t.finalTarget).toBe(free.targetCalories); // flat, uncut
  });
});
