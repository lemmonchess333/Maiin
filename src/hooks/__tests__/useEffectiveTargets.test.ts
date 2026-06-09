/**
 * useEffectiveTargets — macro/finalTarget reconciliation (running copy).
 *
 * The Food hero renders the calorie ring from `finalTarget` and the three
 * macro tiles from `{protein, carbs, fat}`, both off THIS hook. If the macros
 * are split off a different calorie number than the ring shows, the three
 * tiles visibly don't add up to the ring. This suite pins the invariant on
 * the copy that actually runs (not just the phaseNutrition engine): the
 * returned macros satisfy protein*4 + carbs*4 + fat*9 === finalTarget
 * (modulo per-gram rounding), on a no-bonus day AND when finalTarget is
 * bumped (+400) by the learned-TDEE takeover.
 *
 * Firestore is mocked to a no-op subscription — the macro split is derived
 * purely from profile + finalTarget and never depends on the (display-only)
 * burn snapshots.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useEffectiveTargets } from "../useEffectiveTargets";
import type { AdaptiveTdeeView } from "@/lib/adaptiveTarget";
import type { UserProfile } from "@/lib/auth";

const h = vi.hoisted(() => ({
  profile: null as UserProfile | null,
  adaptive: null as AdaptiveTdeeView | null,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u1" }, profile: h.profile }),
}));

vi.mock("@/hooks/useAdaptiveTdee", () => ({
  useAdaptiveTdee: () => h.adaptive,
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  // Return an unsubscribe fn; never fire the callback so *Loaded stays false
  // and the display-only burn path is skipped.
  onSnapshot: vi.fn(() => () => {}),
  Timestamp: { fromDate: (d: Date) => ({ toDate: () => d }) },
}));

// Every day is a "both" (lift + run) training day so the day-type fat→carb
// shift is exercised regardless of which weekday the test date lands on.
const ALL_BOTH_SCHEDULE = Array.from({ length: 7 }, (_, day) => ({
  day,
  type: "both" as const,
}));

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    weightKg: 75,
    targetCalories: 2000,
    targetProtein: 160,
    targetCarbs: 250,
    targetFat: 60,
    weekSchedule: ALL_BOTH_SCHEDULE,
    program: { goal: "maintain", currentPhase: "base" },
    ...overrides,
  } as unknown as UserProfile;
}

function formulaView(value: number): AdaptiveTdeeView {
  return {
    active: false,
    ready: false,
    source: "formula",
    value,
    showWarmup: false,
    warmupFraction: 0,
    stalled: false,
  };
}

function learnedView(value: number): AdaptiveTdeeView {
  return {
    active: true,
    ready: true,
    source: "learned",
    value,
    showWarmup: false,
    warmupFraction: 0,
    stalled: false,
  };
}

const reconciles = (t: {
  finalTarget: number;
  protein: number;
  carbs: number;
  fat: number;
}) => Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.finalTarget);

describe("useEffectiveTargets — macros reconcile to finalTarget", () => {
  beforeEach(() => {
    h.profile = makeProfile();
    h.adaptive = formulaView(2000);
  });

  it("no-bonus day: tiles sum to the flat finalTarget", () => {
    const { result } = renderHook(() => useEffectiveTargets());
    const t = result.current;

    expect(t.finalTarget).toBe(2000);
    expect(reconciles(t)).toBeLessThanOrEqual(2);
  });

  it("+400-cal-bonus day (learned takeover): tiles sum to the BUMPED finalTarget", () => {
    h.adaptive = learnedView(2400);
    const { result } = renderHook(() => useEffectiveTargets());
    const t = result.current;

    // The ring jumped to 2400 — the macros must follow it, not stay summed to
    // the 2000 base.
    expect(t.finalTarget).toBe(2400);
    expect(reconciles(t)).toBeLessThanOrEqual(2);
  });

  it("the bonus lands entirely in carbs; protein + fat hold steady", () => {
    h.adaptive = formulaView(2000);
    const noBonus = renderHook(() => useEffectiveTargets()).result.current;

    h.adaptive = learnedView(2400);
    const bonus = renderHook(() => useEffectiveTargets()).result.current;

    expect(bonus.protein).toBe(noBonus.protein);
    expect(bonus.fat).toBe(noBonus.fat);
    expect(bonus.carbs).toBe(noBonus.carbs + 100); // +400 kcal / 4
  });

  it("legacy profile missing stored macro/calorie fields still reconciles", () => {
    // TestFlight docs predate targetProtein/targetCarbs/targetFat — the
    // || fallbacks must keep the split valid (and summed to the 2200 default).
    h.profile = {
      weightKg: 80,
      weekSchedule: ALL_BOTH_SCHEDULE,
      program: { goal: "maintain", currentPhase: "base" },
    } as unknown as UserProfile;
    h.adaptive = formulaView(2200);

    const { result } = renderHook(() => useEffectiveTargets());
    const t = result.current;

    expect(t.finalTarget).toBe(2200);
    expect(reconciles(t)).toBeLessThanOrEqual(2);
  });
});
