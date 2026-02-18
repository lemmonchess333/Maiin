import { useState } from "react";
import { Lock } from "lucide-react"; // Only keeping Lock as it's used

export type Tier = "free" | "pro";

export const pricing = {
  monthly: 2.99,
  yearly: 29.99,
};

export function useSubscription() {
  const tier: Tier = "free"; // Replace later with Stripe/Firebase
  return { tier };
}

type PhaseMode = "lean bulk" | "cut" | "recomp" | "strength peak";

interface AdaptiveSummaryProps {
  athleteType?: string;
  mode?: "weekly" | "monthly";
  weightKg: number;
  heightCm: number;
  weeklyPR?: boolean;
  weeklyBodyweightTrend?: number[];
  monthlyPR?: boolean;
  monthlyBodyweightTrend?: number[];
  weeklyWorkoutsDone?: number;
  weeklyWorkoutsTarget?: number;
  weeklyMealsDone?: number;
  weeklyMealsTarget?: number;
  monthlyWorkoutsDone?: number;
  monthlyWorkoutsTarget?: number;
  monthlyMealsDone?: number;
  monthlyMealsTarget?: number;
}

export function AdaptiveSummary({
  mode = "weekly",
  weightKg,
  weeklyPR = false,
  weeklyBodyweightTrend = [],
  monthlyPR = false,
  monthlyBodyweightTrend = [],
}: AdaptiveSummaryProps) {
  const { tier } = useSubscription();
  const isPro = tier === "pro";

  const bodyweightTrend = mode === "weekly" ? weeklyBodyweightTrend : monthlyBodyweightTrend;
  const newPR = mode === "weekly" ? weeklyPR : monthlyPR;

  return (
    <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
      <div className="p-5 space-y-5">
        {!isPro && (
          <div className="p-4 rounded-xl bg-muted/30 border border-border text-center space-y-3">
            <Lock className="mx-auto w-5 h-5 text-muted-foreground" />
            <p className="text-sm font-medium">Unlock Adaptive Performance Engine</p>
            <p className="text-xs text-muted-foreground">
              AI macro adjustments, plateau detection, and phase modes.
            </p>
            <p className="text-xs font-semibold">
              £{pricing.monthly}/month or £{pricing.yearly}/year
            </p>
          </div>
        )}
      </div>
    </div>
  );
}