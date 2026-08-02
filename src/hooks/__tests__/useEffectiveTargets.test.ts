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
import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";
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
  // Stable across renders — see the note on the auth mock below.
  user: { uid: "u1" },
}));

// The `user` identity must be STABLE across renders. `useEffectiveTargets`
// subscribes in a `useEffect(..., [user])`, so a fresh object literal per
// render re-subscribes every render — and since each snapshot delivers a
// fresh `data()` object, that setState re-renders, which re-subscribes,
// which fires... a runaway synchronous loop that hangs the worker.
//
// The old inline stub hid this: it handed back the SAME `h.program`
// reference every time, so React bailed out of the re-render and the
// cycle never closed. The real `useAuth` returns a stable user from
// context, so this matches production rather than working around the
// fake.
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: h.user, profile: h.profile }),
  useUid: () => ({ user: h.user, profile: h.profile }).user?.uid ?? null,
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

/**
 * MIGRATED off the inline SDK factory 2026-07-26 (ADR-0009: one fake).
 *
 * The old stub keyed on a synthetic `__kind: "programDoc"` marker its own
 * `doc()` returned, and fired the callback only for that ref — so the
 * subscription under test was matched by a token the stub invented, not
 * by the path the hook actually asks for. Seeding
 * `users/u1/programState/current` means a wrong path now shows up as a
 * missing program (the legacy-fallback branch) instead of passing.
 *
 * The workouts / runs subscriptions were silently never fired by the
 * stub. They now deliver empty collections, which is the honest shape:
 * burn is display-only and irrelevant to the macro split, and an empty
 * result is what a real account with no logged sessions returns.
 */
vi.mock("firebase/firestore");

// All-lift schedule so any test date resolves to a training day (protein is
// phase-driven and dayType-independent, but this keeps the fixture coherent).
const ALL_LIFT = Array.from({ length: 7 }, (_, day) => ({
  day,
  type: "lift" as const,
}));

const PROGRAM_DOC = "users/u1/programState/current";

describe("useEffectiveTargets — live program-phase wiring", () => {
  beforeEach(() => {
    resetFirestore();
    h.profile = makeProfile({
      weightKg: 80,
      weeklyWorkoutsTarget: 4,
      primaryGoal: "strength",
      weekSchedule: ALL_LIFT,
    });
    // no programState doc — legacy fallback branch
  });

  it("deload-week program → tiles render eased deload protein (1.8 × kg)", () => {
    seedFirestore({
      [PROGRAM_DOC]: LIFT_ONLY({ currentPhase: "deload", weekNumber: 4 })
        .program! as unknown as Record<string, unknown>,
    });
    const { result } = renderHook(() => useEffectiveTargets());
    expect(result.current.protein).toBe(Math.round(1.8 * 80)); // 144
  });

  it("progression-week program → strength PrimaryGoal protein (2.2 × kg)", () => {
    // strength, progression, wk2
    seedFirestore({
      [PROGRAM_DOC]: LIFT_ONLY().program! as unknown as Record<string, unknown>,
    });
    const { result } = renderHook(() => useEffectiveTargets());
    expect(result.current.protein).toBe(Math.round(2.2 * 80)); // 176
  });

  it("no programState doc → safe legacy fallback (base 2.0 × kg)", () => {
    // no programState doc — legacy fallback branch
    const { result } = renderHook(() => useEffectiveTargets());
    expect(result.current.protein).toBe(Math.round(2.0 * 80)); // 160
  });

  it("macros still reconcile to finalTarget under the program-driven phase", () => {
    seedFirestore({
      [PROGRAM_DOC]: LIFT_ONLY().program! as unknown as Record<string, unknown>,
    });
    const { result } = renderHook(() => useEffectiveTargets());
    const t = result.current;
    const sum = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    expect(Math.abs(sum - t.finalTarget)).toBeLessThanOrEqual(2);
  });
});

describe("useEffectiveTargets — race taper (the only forward calorie move)", () => {
  beforeEach(() => {
    // no programState doc — legacy fallback branch
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
    seedFirestore({
      [PROGRAM_DOC]: hardProgram() as unknown as Record<string, unknown>,
    });
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
    seedFirestore({
      [PROGRAM_DOC]: hardProgram() as unknown as Record<string, unknown>,
    });
    const free = renderHook(() => useEffectiveTargets()).result.current;

    h.profile = hardProfile("pro");
    seedFirestore({
      [PROGRAM_DOC]: hardProgram() as unknown as Record<string, unknown>,
    });
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
    // no programState doc — legacy fallback branch
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
    // no programState doc — legacy fallback branch
    expect(
      renderHook(() => useEffectiveTargets()).result.current.annotation
    ).toBe("");

    h.profile = FREE_RUN().profile; // no plan
    // no programState doc — legacy fallback branch
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
    // no programState doc — legacy fallback branch
    const t = renderHook(() => useEffectiveTargets()).result.current;
    expect(t.annotation).toBe("Race week — carb load"); // label shown to free
    expect(t.taperActive).toBe(false); // but the calorie move is NOT applied
    expect(t.finalTarget).toBe(free.targetCalories); // flat, uncut
  });
});
