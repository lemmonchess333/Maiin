import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { parseLocalDate } from "@/lib/dateHelpers";
import { useLocalDateKey } from "./useLocalDateKey";
import { useAdaptiveEvidence } from "./useAdaptiveEvidence";
import { getNutritionPhase } from "@/lib/nutritionPhase";
import {
  resolveAdaptiveTarget,
  isAdaptiveActive,
  type AdaptiveTdeeView,
} from "@/lib/adaptiveTarget";
import {
  GOAL_CALORIE_OFFSET,
  offsetFromWeeklyRate,
} from "@/lib/macroConstants";
import { isAdaptiveExcludedDate, isAdaptiveFrozen } from "@/lib/taperNutrition";
import type { UserProfile } from "@/lib/auth";
import { attestedWeeklyRateKg } from "@/lib/goalWeightPlan";

/**
 * The goal calorie offset baked into the stored formula target (mirrors
 * `tdee.ts`): rate-derived when an explicit weekly rate is set, else the goal
 * band (cut -500 / lean bulk +300 / recomp 0). Re-applied to the learned
 * MAINTENANCE estimate so the adaptive target keeps the user's deficit/surplus
 * (C-NUTRITION) instead of drifting to bare maintenance.
 */
function goalCalorieOffset(profile: UserProfile | null): number {
  // Through `attestedWeeklyRateKg`, not the raw field. Pre-NUTR-M2 profiles
  // stored the rate UNSIGNED, so a legacy cutter reads +0.5 and this returned
  // a +550 SURPLUS where -550 was intended — then `applyWeeklyCap` walked the
  // target up 150/week, slow enough to look like the engine working. The
  // sibling consumer `goalReachedOffer` has defended against exactly this
  // since NUTR-M2; the rule is shared rather than restated.
  //
  // An unattested rate falls through to the goal BAND, which is
  // phase-correct by construction (cut -500) rather than merely
  // sign-corrected — and the next Settings save re-signs the field anyway.
  const rate = attestedWeeklyRateKg(profile);
  if (rate !== null) return offsetFromWeeklyRate(rate);
  const goal = getNutritionPhase(profile);
  return GOAL_CALORIE_OFFSET[goal] ?? 0;
}

/**
 * Nutr2 / #981 + #982 — the client-side adaptive-TDEE plumbing.
 *
 * This hook is deliberately thin: it loads the trailing-window data, holds the
 * session display state (the high-water warmup latch), and persists cap state.
 * ALL of the decision logic — estimate → weekly cap → source precedence →
 * view assembly — lives in the pure `resolveAdaptiveTarget` engine
 * (`src/lib/adaptiveTarget.ts`), which is where the behaviour is table-tested.
 *
 * Active ONLY for Pro/trial users without a manual calorie override (Q4 lock
 * A) — everyone else gets `active: false`, `source: "formula"`, and ZERO extra
 * Firestore reads. `useEffectiveTargets` consumes this and is the single
 * source of truth that surfaces it everywhere.
 */
export type { AdaptiveTdeeView } from "@/lib/adaptiveTarget";

export function useAdaptiveTdee(): AdaptiveTdeeView {
  const { user, profile, updateProfile } = useAuth();
  const { isPro } = useSubscription(); // isPro is true during trial too

  // Formula target = the stored base (already customCalorieTarget || formula).
  const formulaTarget = profile?.targetCalories ?? 2200;
  // Offset baked into formulaTarget, re-applied to the learned maintenance
  // estimate so the adaptive target preserves the deficit/surplus.
  const goalOffset = goalCalorieOffset(profile);
  const isManualOverride = !!profile?.customCalorieTarget;
  const active = isAdaptiveActive({ hasUser: !!user, isPro, isManualOverride });
  const capPrev = profile?.adaptiveCapState ?? null;

  const today = useLocalDateKey();
  const { intakeByDay, weighIns, loaded } = useAdaptiveEvidence(
    active ? (user?.uid ?? null) : null,
    today
  );
  const now = useMemo(() => parseLocalDate(today), [today]);
  const [latched, setLatched] = useState(0);
  const persistKeyRef = useRef("");

  const resolved = useMemo(() => {
    const excluded = (k: string) => isAdaptiveExcludedDate(k, profile);
    const intakeFiltered = intakeByDay.filter((i) => !excluded(i.dateKey));
    const weighInsFiltered = weighIns.filter((w) => !excluded(w.dateKey));
    return resolveAdaptiveTarget({
      hasUser: !!user,
      isPro,
      isManualOverride,
      formulaTarget,
      goalOffset,
      intakeByDay: intakeFiltered,
      weighIns: weighInsFiltered,
      loaded,
      capPrev,
      now,
      latched,
      frozen: isAdaptiveFrozen(now, profile),
    });
  }, [
    user,
    profile,
    isPro,
    isManualOverride,
    formulaTarget,
    goalOffset,
    intakeByDay,
    weighIns,
    loaded,
    capPrev,
    now,
    latched,
  ]);

  // Persist the new cap state once (guarded so the resulting profile reload
  // doesn't re-trigger the write).
  useEffect(() => {
    if (!resolved.capChanged || !resolved.capState) return;
    const key = `${resolved.capState.lastApplied}@${resolved.capState.lastAppliedAt}`;
    if (persistKeyRef.current === key) return;
    persistKeyRef.current = key;
    void updateProfile({ adaptiveCapState: resolved.capState })
      .then((result) => {
        if (!result.ok && persistKeyRef.current === key)
          persistKeyRef.current = "";
      })
      .catch(() => {
        if (persistKeyRef.current === key) persistKeyRef.current = "";
      });
  }, [resolved, updateProfile]);

  // Raise the high-water latch (legitimate derived-state-from-prop case).
  // warmupFraction === max(latched, liveFraction), so it is the new high-water.
  useEffect(() => {
    const { warmupFraction } = resolved.view;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (warmupFraction > latched) setLatched(warmupFraction);
  }, [resolved.view, latched]);

  return resolved.view;
}
