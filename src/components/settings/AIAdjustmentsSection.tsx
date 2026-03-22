import { useMemo } from "react";
import { Brain, Lock, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { detectPlateau, calculateAdaptiveMacros, phaseConfig } from "@/lib/plateauDetection";
import type { PlateauResult, MacroTargets, PhaseMode } from "@/lib/plateauDetection";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import AccordionSection from "@/components/AccordionSection";
import type { UserProfile } from "@/lib/auth";
import { toast } from "sonner";

interface AIAdjustmentsSectionProps {
  profile: UserProfile;
  isPro: boolean;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  onUpgrade: () => void;
}

function statusIcon(status: PlateauResult["status"]) {
  switch (status) {
    case "progressing":
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    case "stalling":
      return <Minus className="w-4 h-4 text-yellow-500" />;
    case "regressing":
      return <TrendingDown className="w-4 h-4 text-red-500" />;
    case "weight_only":
      return <AlertTriangle className="w-4 h-4 text-orange-500" />;
  }
}

function statusColor(status: PlateauResult["status"]) {
  switch (status) {
    case "progressing": return "text-green-500";
    case "stalling": return "text-yellow-500";
    case "regressing": return "text-red-500";
    case "weight_only": return "text-orange-500";
  }
}

export default function AIAdjustmentsSection({
  profile,
  isPro,
  updateProfile,
  onUpgrade,
}: AIAdjustmentsSectionProps) {
  const { weeks } = usePerformanceWeeks(4);

  const phase: PhaseMode = (profile.program?.currentPhase as PhaseMode) ?? (profile.program?.goal as PhaseMode) ?? "recomp";
  const sensitivity = phaseConfig[phase]?.plateauSensitivity ?? 1;

  // Compute average lift and weight changes from recent performance weeks
  const { avgLiftChange, avgWeightChange } = useMemo(() => {
    if (weeks.length < 2) return { avgLiftChange: 0, avgWeightChange: 0 };

    let liftChangeSum = 0;
    let weightChangeSum = 0;
    let count = 0;

    for (let i = 1; i < weeks.length; i++) {
      const prev = weeks[i - 1];
      const curr = weeks[i];
      if (prev.aggregates && curr.aggregates) {
        const prevTonnage = prev.aggregates.liftTonnage || 0;
        const currTonnage = curr.aggregates.liftTonnage || 0;
        if (prevTonnage > 0) {
          liftChangeSum += (currTonnage - prevTonnage) / prevTonnage;
        }
        const prevBw = prev.aggregates.bwCurrent7dAvg;
        const currBw = curr.aggregates.bwCurrent7dAvg;
        if (prevBw && currBw) {
          weightChangeSum += currBw - prevBw;
        }
        count++;
      }
    }

    return {
      avgLiftChange: count > 0 ? liftChangeSum / count : 0,
      avgWeightChange: count > 0 ? weightChangeSum / count : 0,
    };
  }, [weeks]);

  const plateau: PlateauResult = useMemo(
    () => detectPlateau(avgLiftChange, avgWeightChange, sensitivity),
    [avgLiftChange, avgWeightChange, sensitivity]
  );

  const macros: MacroTargets = useMemo(
    () => calculateAdaptiveMacros(
      profile.weightKg || 70,
      avgLiftChange,
      avgWeightChange,
      phase,
      profile.tdeeBase
    ),
    [profile.weightKg, avgLiftChange, avgWeightChange, phase, profile.tdeeBase]
  );

  const handleApplySuggestion = async () => {
    if (plateau.calorieAdjust === 0) return;
    const newCalories = (profile.targetCalories || 2200) + plateau.calorieAdjust;
    await updateProfile({ targetCalories: newCalories });
    toast.success(`Calories adjusted by ${plateau.calorieAdjust > 0 ? "+" : ""}${plateau.calorieAdjust}`);
  };

  return (
    <AccordionSection
      icon={<Brain className="w-5 h-5 text-primary" />}
      title="AI Adjustments"
      subtitle="Plateau detection & adaptive macros"
    >
      {!isPro ? (
        <button
          onClick={onUpgrade}
          className="w-full flex items-center gap-3 p-4 rounded-xl bg-muted/50 border border-border/30"
        >
          <Lock className="w-5 h-5 text-muted-foreground" />
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-foreground">Upgrade to Pro</p>
            <p className="text-xs text-muted-foreground">
              Unlock AI macro adjustments and plateau detection
            </p>
          </div>
        </button>
      ) : (
        <div className="space-y-4">
          {/* Current phase */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Phase</span>
            <span className="text-sm font-medium text-foreground capitalize">{phase}</span>
          </div>

          {/* Plateau status */}
          <div className="p-3 rounded-xl bg-muted/50 space-y-2">
            <div className="flex items-center gap-2">
              {statusIcon(plateau.status)}
              <span className={cn("text-sm font-medium capitalize", statusColor(plateau.status))}>
                {plateau.status.replace("_", " ")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{plateau.message}</p>
            {plateau.macroNote && plateau.calorieAdjust !== 0 && (
              <p className="text-xs text-muted-foreground italic">{plateau.macroNote}</p>
            )}
          </div>

          {/* Apply suggestion */}
          {plateau.calorieAdjust !== 0 && (
            <button
              onClick={handleApplySuggestion}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
            >
              Apply Suggestion ({plateau.calorieAdjust > 0 ? "+" : ""}{plateau.calorieAdjust} cal)
            </button>
          )}

          {/* AI macro targets */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">AI Macro Targets</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Cal", value: macros.calories },
                { label: "Protein", value: `${macros.protein}g` },
                { label: "Carbs", value: `${macros.carbs}g` },
                { label: "Fat", value: `${macros.fat}g` },
              ].map((m) => (
                <div key={m.label} className="text-center p-2 rounded-lg bg-card">
                  <p className="text-[10px] text-muted-foreground">{m.label}</p>
                  <p className="text-sm font-semibold text-foreground">{m.value}</p>
                </div>
              ))}
            </div>
          </div>

          {weeks.length < 2 && (
            <p className="text-[10px] text-muted-foreground text-center">
              Need at least 2 weeks of data for accurate plateau detection
            </p>
          )}
        </div>
      )}
    </AccordionSection>
  );
}
