import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { haptic } from "@/lib/haptic";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Flame,
  Minus,
  Plus,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ACTIVITY_LABELS } from "@/lib/tdee";
import type { ActivityLevel } from "@/lib/tdee";
import type { GoalWeightPlan } from "@/lib/goalWeightPlan";
import AccordionSection from "@/components/AccordionSection";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

interface NutritionSectionProps {
  profile: UserProfile;
  age: number;
  setAge: (v: number) => void;
  activityLevel: ActivityLevel;
  setActivityLevel: (v: ActivityLevel) => void;
  currentKg: number;
  goalWeightKg: number;
  setGoalWeightKg: (v: number) => void;
  weeklyRateKg: number;
  setWeeklyRateKg: (v: number) => void;
  goalPlan: GoalWeightPlan;
  mealsTarget: number;
  setMealsTarget: (v: number) => void;
  tdee: {
    bmr: number;
    tdee: number;
    targetCalories: number;
    protein: number;
    carbs: number;
    fat: number;
    deficit: number;
  };
  updateProfile: (
    data: Partial<UserProfile>,
    opts?: { allowProtected?: boolean }
  ) => Promise<UpdateProfileResult>;
  inline?: boolean;
}

export default function NutritionSection({
  profile,
  age,
  setAge,
  activityLevel,
  setActivityLevel,
  currentKg,
  goalWeightKg,
  setGoalWeightKg,
  weeklyRateKg,
  setWeeklyRateKg,
  goalPlan,
  mealsTarget,
  setMealsTarget,
  tdee,
  updateProfile,
  inline = false,
}: NutritionSectionProps) {
  const [showTDEE, setShowTDEE] = useState(false);
  const mealsTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleMealsChange = useCallback(
    (val: number) => {
      const prev = profile.weeklyMealsTarget ?? 10;
      setMealsTarget(val);
      clearTimeout(mealsTimerRef.current);
      mealsTimerRef.current = setTimeout(async () => {
        const result = await updateProfile({ weeklyMealsTarget: val });
        if (!result.ok) setMealsTarget(prev);
      }, 500);
    },
    [setMealsTarget, updateProfile, profile.weeklyMealsTarget]
  );

  const calorieTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  return (
    <AccordionSection
      inline={inline}
      icon={<Calculator className="size-5 text-primary" />}
      title="Nutrition"
      subtitle="TDEE, phase, macros, meal target"
    >
      {/* TDEE Calculator (sub-collapsible) */}
      <div className="bg-card rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowTDEE(!showTDEE)}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-3">
            <Calculator className="size-5 text-primary" />
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">
                TDEE Calculator
              </p>
              <p className="text-xs text-muted-foreground">
                {tdee.targetCalories} cal/day target
              </p>
            </div>
          </div>
          {showTDEE ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </button>

        {showTDEE && (
          <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4">
            <div>
              <label
                htmlFor="tdee-age"
                className="text-sm text-muted-foreground"
              >
                Age
              </label>
              <input
                id="tdee-age"
                type="number"
                value={age}
                onChange={(e) => setAge(Number(e.target.value) || 25)}
                onBlur={async () => {
                  const prev = profile.age ?? 25;
                  if (age === prev) return;
                  const result = await updateProfile({ age });
                  if (!result.ok) setAge(prev);
                }}
                className="w-full mt-1 px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm"
              />
            </div>

            <div>
              <span className="text-sm text-muted-foreground">
                Activity Level
              </span>
              <div className="mt-1 space-y-1">
                {(
                  Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]
                ).map(([key, label]) => (
                  <button
                    type="button"
                    key={key}
                    onClick={async () => {
                      const prev = activityLevel;
                      setActivityLevel(key);
                      const result = await updateProfile({
                        activityLevel: key,
                      });
                      if (!result.ok) setActivityLevel(prev);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors",
                      activityLevel === key
                        ? "bg-primary/10 text-primary font-medium"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* TDEE Results */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-foreground font-mono tabular-nums">
                  {tdee.bmr}
                </p>
                <p className="text-xs text-muted-foreground">BMR</p>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-foreground font-mono tabular-nums">
                  {tdee.tdee}
                </p>
                <p className="text-xs text-muted-foreground">TDEE</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Goal Weight — owns the nutrition direction (target vs current → phase) */}
      <div className="bg-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Target className="size-5 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Goal Weight</p>
            <p className="text-xs text-muted-foreground">
              Sets your calorie target — current{" "}
              <span className="font-mono tabular-nums">
                {currentKg.toFixed(1)}
              </span>{" "}
              kg
            </p>
          </div>
        </div>

        {/* Target weight stepper (0.5 kg steps) */}
        <div className="flex items-center justify-between rounded-xl bg-muted/30 p-2">
          <button
            type="button"
            aria-label="Lower goal weight"
            onClick={() => {
              haptic("light");
              setGoalWeightKg(
                Math.max(30, Math.round((goalWeightKg - 0.5) * 10) / 10)
              );
            }}
            className="size-11 rounded-lg bg-card border border-border/50 flex items-center justify-center text-foreground active:scale-95 transition-transform"
          >
            <Minus className="size-4" />
          </button>
          <div className="text-center">
            <p className="text-2xl font-mono tabular-nums font-bold text-foreground">
              {goalWeightKg.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">kg target</p>
          </div>
          <button
            type="button"
            aria-label="Raise goal weight"
            onClick={() => {
              haptic("light");
              setGoalWeightKg(
                Math.min(250, Math.round((goalWeightKg + 0.5) * 10) / 10)
              );
            }}
            className="size-11 rounded-lg bg-card border border-border/50 flex items-center justify-center text-foreground active:scale-95 transition-transform"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {/* Weekly pace — only meaningful when not maintaining */}
        {goalPlan.direction !== "maintain" && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Weekly pace ({goalPlan.direction === "lose" ? "loss" : "gain"})
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 0.25, label: "Relaxed" },
                { value: 0.5, label: "Steady" },
                { value: 0.75, label: "Fast" },
              ].map((r) => (
                <button
                  type="button"
                  key={r.value}
                  onClick={() => {
                    haptic("medium");
                    setWeeklyRateKg(r.value);
                  }}
                  className={cn(
                    "min-h-11 p-2 rounded-xl border text-center transition-all",
                    weeklyRateKg === r.value
                      ? "border-primary bg-primary/10"
                      : "border-border/50 bg-muted/30 hover:border-border"
                  )}
                >
                  <p
                    className={cn(
                      "text-xs font-medium",
                      weeklyRateKg === r.value
                        ? "text-primary"
                        : "text-foreground"
                    )}
                  >
                    {r.label}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">
                    {r.value} kg/wk
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Derived: direction → phase + the daily offset it produces */}
        <div className="rounded-xl bg-muted/30 p-3 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {goalPlan.direction === "lose"
              ? "Losing"
              : goalPlan.direction === "gain"
                ? "Gaining"
                : "Maintaining"}
            {" → "}
            <span className="text-foreground font-medium">
              {goalPlan.fitnessGoal === "lean bulk"
                ? "Lean Bulk"
                : goalPlan.fitnessGoal === "cut"
                  ? "Cut"
                  : "Recomp"}
            </span>
          </span>
          <span className="text-xs font-mono tabular-nums font-medium text-foreground">
            {goalPlan.dailyOffset > 0 ? "+" : ""}
            {goalPlan.dailyOffset} cal/day
          </span>
        </div>

        {/* Calorie calculation chain */}
        <div className="rounded-xl bg-muted/50 p-3 space-y-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Base TDEE</span>
              <span>{tdee.tdee} cal</span>
            </div>
            {tdee.deficit !== 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {goalPlan.fitnessGoal === "lean bulk"
                    ? "Lean Bulk"
                    : goalPlan.fitnessGoal === "cut"
                      ? "Cut"
                      : "Recomp"}{" "}
                  offset
                </span>
                <span className="font-mono tabular-nums">
                  {tdee.deficit > 0 ? "+" : ""}
                  {tdee.deficit} cal
                </span>
              </div>
            )}
            <div className="border-t border-border/50 pt-1 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">
                Daily target
              </span>
              <motion.span
                key={tdee.targetCalories}
                initial={{ opacity: 0.5, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="text-sm font-bold text-primary"
              >
                {tdee.targetCalories} cal
              </motion.span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <motion.div
              key={tdee.protein}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
              className="text-center flex-1"
            >
              <p className="text-sm font-bold text-blue-500">
                {tdee.protein} g
              </p>
              <p className="text-xs text-muted-foreground">protein</p>
            </motion.div>
            <div className="w-px h-6 bg-border/50" />
            <motion.div
              key={tdee.carbs}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
              className="text-center flex-1"
            >
              <p className="text-sm font-bold text-amber-500">{tdee.carbs} g</p>
              <p className="text-xs text-muted-foreground">carbs</p>
            </motion.div>
            <div className="w-px h-6 bg-border/50" />
            <motion.div
              key={tdee.fat}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
              className="text-center flex-1"
            >
              <p className="text-sm font-bold text-pink-500">{tdee.fat} g</p>
              <p className="text-xs text-muted-foreground">fat</p>
            </motion.div>
          </div>

          {/* Custom calorie override */}
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between">
              <label
                htmlFor="tdee-custom-target"
                className="text-sm text-muted-foreground"
              >
                Override daily target (optional)
              </label>
              {profile?.customCalorieTarget && (
                <button
                  type="button"
                  onClick={() =>
                    updateProfile({ customCalorieTarget: undefined })
                  }
                  className="text-xs text-primary font-medium"
                >
                  Reset to calculated
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              Leave blank to use calculated target of {tdee.targetCalories} cal
            </p>
            <input
              id="tdee-custom-target"
              type="number"
              value={profile?.customCalorieTarget ?? ""}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : undefined;
                clearTimeout(calorieTimerRef.current);
                calorieTimerRef.current = setTimeout(() => {
                  updateProfile({ customCalorieTarget: val || undefined });
                }, 500);
              }}
              placeholder={String(tdee.targetCalories)}
              className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm"
            />
          </div>
        </div>
      </div>

      {/* Meal logging target */}
      <div>
        <label className="text-sm text-muted-foreground">
          Weekly meal logging target ({mealsTarget})
        </label>
        <input
          type="range"
          aria-label="Weekly meal logging target"
          min="0"
          max="20"
          value={mealsTarget}
          onChange={(e) => handleMealsChange(Number(e.target.value))}
          className="w-full accent-primary"
        />
      </div>

      {/* Nutr1 (expenditure-inclusive): the "Adjust calories for training"
          toggle was retired. Your target already accounts for activity, so
          completed workouts are never added back (no eat-back) — there's
          nothing to toggle. This read-only note explains the model in place
          of the old switch. */}
      <div className="bg-card rounded-2xl p-4">
        <div className="flex items-center gap-3 min-w-0">
          <Flame className="size-5 text-primary shrink-0" />
          <div className="text-left min-w-0">
            <p className="text-sm font-medium text-foreground">
              Activity is already in your target
            </p>
            <p className="text-xs text-muted-foreground">
              Your daily calorie target already accounts for your training, so
              there's no need to eat back exercise calories. Big training days
              shift more carbs for fuel.
            </p>
          </div>
        </div>
      </div>
    </AccordionSection>
  );
}
