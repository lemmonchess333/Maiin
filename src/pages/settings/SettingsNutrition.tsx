/**
 * SettingsNutrition — Nutrition section nested page (Set1.2).
 * TDEE, training phase, macros, meal target. Reactive TDEE persists
 * derived macros via useEffect (mirrors the legacy flat-page logic).
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { calculateTDEE } from "@/lib/tdee";
import type { ActivityLevel } from "@/lib/tdee";
import SettingsSection from "@/components/settings/SettingsSection";
import NutritionSection from "@/components/settings/NutritionSection";

export default function SettingsNutrition() {
  const { profile, updateProfile } = useAuth();
  const [age, setAge] = useState(profile?.age ?? 25);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    (profile?.activityLevel as ActivityLevel) ?? "moderate"
  );
  const [trainingPhase, setTrainingPhase] = useState<
    "cut" | "lean bulk" | "recomp"
  >((profile?.program?.goal as "cut" | "lean bulk" | "recomp") ?? "recomp");
  const [mealsTarget, setMealsTarget] = useState(() =>
    Math.min(profile?.weeklyMealsTarget ?? 10, 20)
  );

  const tdee = useMemo(
    () =>
      calculateTDEE(
        profile?.weightKg ?? 70,
        profile?.heightCm ?? 170,
        age,
        activityLevel,
        trainingPhase,
        profile?.sex ?? "male"
      ),
    [
      profile?.weightKg,
      profile?.heightCm,
      age,
      activityLevel,
      trainingPhase,
      profile?.sex,
    ]
  );

  // Reactive TDEE persistence — auto-save derived values when inputs
  // change. Mirrors the legacy Settings.tsx behaviour so users who
  // navigated through Settings see the same write cadence here.
  const prevTdeeRef = useRef(tdee);
  const hasMounted = useRef(false);
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (prevTdeeRef.current.targetCalories !== tdee.targetCalories) {
      updateProfile({
        tdeeBase: tdee.targetCalories,
        targetCalories: profile?.customCalorieTarget || tdee.targetCalories,
        targetProtein: tdee.protein,
        targetCarbs: tdee.carbs,
        targetFat: tdee.fat,
      });
    }
    prevTdeeRef.current = tdee;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tdee]);

  async function handlePhaseChange(
    phase: "cut" | "lean bulk" | "recomp"
  ): Promise<void> {
    const prevPhase = trainingPhase;
    const result = await updateProfile({
      program: {
        goal: phase,
        startWeight: profile?.program?.startWeight ?? profile?.weightKg ?? 70,
        currentPhase: profile?.program?.currentPhase ?? "base",
      },
    });
    if (!result.ok) setTrainingPhase(prevPhase);
  }

  if (!profile) return <SettingsSection title="Nutrition" />;

  return (
    <SettingsSection
      title="Nutrition"
      subtitle="Calorie targets, phase, activity level"
    >
      <NutritionSection
        inline
        profile={profile}
        age={age}
        setAge={setAge}
        activityLevel={activityLevel}
        setActivityLevel={setActivityLevel}
        trainingPhase={trainingPhase}
        setTrainingPhase={setTrainingPhase}
        mealsTarget={mealsTarget}
        setMealsTarget={setMealsTarget}
        tdee={tdee}
        updateProfile={updateProfile}
        onPhaseChange={handlePhaseChange}
      />
    </SettingsSection>
  );
}
