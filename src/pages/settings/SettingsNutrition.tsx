/**
 * SettingsNutrition — Nutrition section nested page (Set1.2).
 * TDEE, GOAL WEIGHT + rate (which OWNS the nutrition direction —
 * MFP/MacroFactor model, per the locked goalWeightPlan decision), macros,
 * meal target. The cut/recomp/lean-bulk phase is DERIVED from target-vs-current
 * weight, not picked directly. Reactive TDEE persists derived macros +
 * goal-weight fields via an effect (mirrors the legacy flat-page write cadence;
 * migration-safe — the mount write is skipped so an existing user's stored
 * program.goal isn't silently flipped until they actually edit the goal).
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { calculateTDEE } from "@/lib/tdee";
import type { ActivityLevel, FitnessGoal } from "@/lib/tdee";
import { resolveGoalWeightPlan } from "@/lib/goalWeightPlan";
import { logger } from "@/lib/logger";
import { resolveProgramGoalMirror } from "./resolveProgramGoalMirror";
import SettingsSection from "@/components/settings/SettingsSection";
import NutritionSection from "@/components/settings/NutritionSection";

export default function SettingsNutrition() {
  const { user, profile, updateProfile } = useAuth();
  const currentKg = profile?.weightKg ?? 70;

  const [age, setAge] = useState(profile?.age ?? 25);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    (profile?.activityLevel as ActivityLevel) ?? "moderate"
  );
  // Goal weight owns nutrition direction. Seed from the stored goal weight
  // (falls back to current → "maintain"); rate magnitude seeds from the stored
  // signed rate, defaulting to 0.5 kg/wk so a freshly-set target has a sensible
  // pace.
  const [goalWeightKg, setGoalWeightKg] = useState<number>(
    profile?.goalWeightKg ?? currentKg
  );
  const [weeklyRateKg, setWeeklyRateKg] = useState<number>(
    Math.abs(profile?.weeklyRateKg ?? 0) || 0.5
  );
  const [mealsTarget, setMealsTarget] = useState(() =>
    Math.min(profile?.weeklyMealsTarget ?? 10, 20)
  );

  // Target weight + rate → direction → fitnessGoal + daily calorie offset.
  const goalPlan = useMemo(
    () =>
      resolveGoalWeightPlan({
        currentKg,
        targetKg: goalWeightKg,
        rateKgPerWeek: weeklyRateKg,
      }),
    [currentKg, goalWeightKg, weeklyRateKg]
  );

  const tdee = useMemo(
    () =>
      calculateTDEE(
        currentKg,
        profile?.heightCm ?? 170,
        age,
        activityLevel,
        goalPlan.fitnessGoal,
        profile?.sex ?? "male",
        // explicitOffset — the rate-derived deficit/surplus OWNS the target,
        // replacing the crude per-goal band (NUTR-M2 fix).
        goalPlan.dailyOffset
      ),
    [
      currentKg,
      profile?.heightCm,
      age,
      activityLevel,
      goalPlan.fitnessGoal,
      goalPlan.dailyOffset,
      profile?.sex,
    ]
  );

  // Reactive persistence — auto-save derived values when inputs change. The
  // mount write is skipped (migration-safe: an existing user's stored
  // program.goal / targets are untouched until they actually change the goal).
  const hasMounted = useRef(false);
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    updateProfile({
      goalWeightKg,
      // Persist the SIGNED rate (0 when maintaining) so downstream readers
      // (adaptive-TDEE offset, onboarding parity) see the true direction.
      weeklyRateKg: goalPlan.effectiveRateKgPerWeek,
      program: {
        goal: goalPlan.fitnessGoal,
        startWeight: profile?.program?.startWeight ?? currentKg,
        currentPhase: profile?.program?.currentPhase ?? "base",
      },
      tdeeBase: tdee.targetCalories,
      targetCalories: profile?.customCalorieTarget || tdee.targetCalories,
      targetProtein: tdee.protein,
      targetCarbs: tdee.carbs,
      targetFat: tdee.fat,
    });

    // Mirror the derived nutrition phase into programState.goal in the same
    // logical operation (see resolveProgramGoalMirror above). Without this the
    // profile copy (macros) and the programState copy (lift rep scheme / header
    // / regenerate preference) drift after a goal-weight change. Only the scalar
    // `goal` field is merged — workouts and the rest of programState are left
    // untouched (Pgm5: no silent restructure). Read-then-merge so we only write
    // when a plan already exists and the phase actually changed; fire-and-forget
    // with the same error discipline as the profile write.
    if (!user) return;
    const derivedPhase = goalPlan.fitnessGoal;
    const programRef = doc(db, "users", user.uid, "programState", "current");
    void (async () => {
      try {
        const snap = await getDoc(programRef);
        const storedGoal = snap.exists()
          ? (snap.data().goal as FitnessGoal | undefined)
          : undefined;
        const mirror = resolveProgramGoalMirror(derivedPhase, storedGoal);
        if (mirror === null) return;
        await setDocGuarded(programRef, { goal: mirror }, { merge: true });
      } catch (error) {
        logger.error(
          "[SettingsNutrition] programState goal mirror failed:",
          error
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalWeightKg, weeklyRateKg, tdee.targetCalories]);

  if (!profile) return <SettingsSection title="Nutrition" />;

  return (
    <SettingsSection
      title="Nutrition"
      subtitle="Goal weight, calorie targets, activity level"
    >
      <NutritionSection
        inline
        profile={profile}
        age={age}
        setAge={setAge}
        activityLevel={activityLevel}
        setActivityLevel={setActivityLevel}
        currentKg={currentKg}
        goalWeightKg={goalWeightKg}
        setGoalWeightKg={setGoalWeightKg}
        weeklyRateKg={weeklyRateKg}
        setWeeklyRateKg={setWeeklyRateKg}
        goalPlan={goalPlan}
        mealsTarget={mealsTarget}
        setMealsTarget={setMealsTarget}
        tdee={tdee}
        updateProfile={updateProfile}
      />
    </SettingsSection>
  );
}
