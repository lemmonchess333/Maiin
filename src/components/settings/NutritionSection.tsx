import { useRef } from "react";
import { motion } from "framer-motion";
import { haptic } from "@/lib/haptic";
import { Calculator, Flame, Minus, Plus, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { MIN_TARGET_CALORIES } from "@/lib/macroConstants";
import { ACTIVITY_LABELS } from "@/lib/tdee";
import type { ActivityLevel, TDEEResult } from "@/lib/tdee";
import type { GoalWeightPlan } from "@/lib/goalWeightPlan";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import { resolveTargetDrift, shouldShowTargetDrift } from "@/lib/targetDrift";
import AccordionSection from "@/components/AccordionSection";
import { useMacroPalette } from "@/hooks/useMacroPalette";
import {
  adaptiveCalorieStatus,
  adaptiveCalorieStatusLabel,
} from "@/lib/adaptiveStatus";
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
  /** The engine's own result type rather than a hand-copied shape — the
   *  inline duplicate here silently omitted every field added to TDEEResult
   *  after it was written. */
  tdee: TDEEResult;
  updateProfile: (
    data: Partial<UserProfile>,
    opts?: { allowProtected?: boolean }
  ) => Promise<UpdateProfileResult>;
  /** Re-persist the freshly-computed targets for today's body. Supplied by
   *  SettingsNutrition, which owns the goal-weight persist recipe — the same
   *  payload its reactive save writes, so a recalculation and an edit cannot
   *  drift apart. */
  onRecalculate?: () => void;
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
  tdee,
  updateProfile,
  onRecalculate,
  inline = false,
}: NutritionSectionProps) {
  // Contrast-safe macro colours from the shared palette — protein=pink,
  // carbs=gold, fat=sage everywhere else in the app. These tiles were
  // previously mis-coloured (protein blue / carbs amber / fat pink) with
  // raw Tailwind palette classes that also broke the token invariant.
  const { text: macroText } = useMacroPalette();

  const calorieTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  /* The stored target was set from the body the user had at the time;
     `tdee.tdee` is maintenance for the body they have now. A cut therefore
     decays into a slower cut while the plan keeps naming the original pace —
     measured at a third slower after 12 kg. Adaptive TDEE answers this, but
     it is Pro-gated, so for a free user nothing closes the gap and nothing
     mentions it. Surfaced, never silently applied: the recalculation is the
     user's tap. */
  const adaptiveStatus = adaptiveCalorieStatus(profile);
  const drift = resolveTargetDrift(
    profile?.targetCalories,
    tdee.tdee,
    profile?.weeklyRateKg
  );
  const showDrift =
    !!onRecalculate &&
    shouldShowTargetDrift({
      drift,
      isManualOverride: adaptiveStatus.kind === "manual",
      isAdaptiveEngaged: adaptiveStatus.kind === "adapting",
    });
  const paceLabel = (kgPerWeek: number) =>
    `${kgPerWeek > 0 ? "+" : ""}${kgPerWeek.toFixed(2)} kg/wk`;

  return (
    <AccordionSection
      inline={inline}
      icon={<Calculator className="size-5 text-primary" />}
      title="Nutrition"
      subtitle="TDEE, phase, macros"
    >
      {/* The TDEE sub-collapsible, on the primitive rather than a
            hand-rolled copy of it. The old markup reproduced
            `AccordionSection`'s non-inline branch class-for-class —
            same shell, same header row, same chevron pair, same body
            padding — in a file that already imports the primitive, so
            it looked identical and silently shipped none of the
            wiring: no `aria-expanded`, no `aria-controls`, no
            `role="region"` on the panel, and no haptic on toggle.

            Deliberately NOT `inline`: the collapse is correct here.
            `inline` exists for a nested Settings page whose own chrome
            already names the section — this is a sub-section INSIDE
            such a page, and folding a calculator away by default is
            the point. */}
      <AccordionSection
        icon={<Calculator className="size-5 text-primary" />}
        title="TDEE Calculator"
        subtitle={`${tdee.targetCalories} cal/day target`}
      >
        <div>
          <label htmlFor="tdee-age" className="text-sm text-muted-foreground">
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
          <span className="text-sm text-muted-foreground">Activity Level</span>
          <div className="mt-1 space-y-1">
            {(Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]).map(
              ([key, label]) => (
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
              )
            )}
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
      </AccordionSection>

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
            <SegmentedControl
              ariaLabel="Weekly pace"
              value={weeklyRateKg}
              onChange={(value) => {
                haptic("medium");
                setWeeklyRateKg(value);
              }}
              options={[
                { value: 0.25, label: "Relaxed" },
                { value: 0.5, label: "Steady" },
                { value: 0.75, label: "Fast" },
              ].map((r) => ({
                value: r.value,
                label: (
                  <span className="flex flex-col items-center leading-tight">
                    <span>{r.label}</span>
                    <span className="text-caption font-normal text-muted-foreground font-mono tabular-nums mt-0.5">
                      {r.value} kg/wk
                    </span>
                  </span>
                ),
              }))}
            />
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
            {/* D6 — is this target engine-adapted, manual, or formula? So the
                user can tell what's learning vs what they own. */}
            <p className="text-caption text-muted-foreground leading-snug pt-1">
              {adaptiveCalorieStatusLabel(
                adaptiveStatus,
                // The learned value, so the line can't claim the formula
                // figure above it is the adapted one.
                profile?.adaptiveCapState?.lastApplied
              )}
            </p>
            {showDrift && drift && (
              <div className="pt-2 space-y-2">
                <p
                  className="text-caption leading-snug"
                  style={{ color: "hsl(var(--warning-strong))" }}
                >
                  Your body has changed since this target was set, so it now
                  works out at{" "}
                  <span className="font-mono tabular-nums">
                    {paceLabel(drift.effectiveRateKgPerWeek)}
                  </span>
                  , not the{" "}
                  <span className="font-mono tabular-nums">
                    {paceLabel(drift.intendedRateKgPerWeek)}
                  </span>{" "}
                  you picked.
                </p>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    haptic("medium");
                    onRecalculate?.();
                  }}
                >
                  Recalculate for {currentKg.toFixed(1)} kg
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <motion.div
              key={tdee.protein}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
              className="text-center flex-1"
            >
              <p
                className="text-sm font-bold font-mono tabular-nums"
                style={{ color: macroText.protein }}
              >
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
              <p
                className="text-sm font-bold font-mono tabular-nums"
                style={{ color: macroText.carbs }}
              >
                {tdee.carbs} g
              </p>
              <p className="text-xs text-muted-foreground">carbs</p>
            </motion.div>
            <div className="w-px h-6 bg-border/50" />
            <motion.div
              key={tdee.fat}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
              className="text-center flex-1"
            >
              <p
                className="text-sm font-bold font-mono tabular-nums"
                style={{ color: macroText.fat }}
              >
                {tdee.fat} g
              </p>
              <p className="text-xs text-muted-foreground">fat</p>
            </motion.div>
          </div>

          {/* The pace picker can produce a target too small to hold bodyweight
              protein alongside the essential fat floor, in which case protein
              is set to what fits. That happens silently on heavy bodies at the
              "Fast" pace, and the grams above are the only place it shows —
              a 168 g figure where the plan intends 242 g reads as a plan
              choice rather than a shortfall. Say it, at the point the pace is
              chosen. */}
          {tdee.proteinCapped && (
            <p
              className="text-caption leading-snug pt-2"
              style={{ color: "hsl(var(--warning-strong))" }}
            >
              This pace leaves room for{" "}
              <span className="font-mono tabular-nums">{tdee.protein} g</span>{" "}
              protein, not the{" "}
              <span className="font-mono tabular-nums">
                {tdee.proteinUncapped} g
              </span>{" "}
              your plan aims for — essential fat has to fit too. A slower pace
              holds protein.
            </p>
          )}

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
            {/* The rate-derived path is floored at MIN_TARGET_CALORIES; this
                field is not — it is bounded only by the profile sanitizer
                (0..10000), so a target below the floor is reachable by typing
                one. Owner decision 2026-08-12: warn, don't clamp. It is the
                user's own number, and blocking it just pushes them to lower
                their goal weight instead — but the app enforcing a floor three
                centimetres up the same screen and saying nothing here is the
                dishonest option. */}
            {typeof profile?.customCalorieTarget === "number" &&
              profile.customCalorieTarget > 0 &&
              profile.customCalorieTarget < MIN_TARGET_CALORIES && (
                <p
                  className="text-caption leading-snug mt-2"
                  style={{ color: "hsl(var(--warning-strong))" }}
                >
                  Below the{" "}
                  <span className="font-mono tabular-nums">
                    {MIN_TARGET_CALORIES}
                  </span>{" "}
                  cal floor Tropos uses everywhere else. Your plan will keep
                  this figure — very low targets make protein and essential fat
                  hard to fit.
                </p>
              )}
          </div>
        </div>
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
