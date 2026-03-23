import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ACTIVITY_LABELS } from "@/lib/tdee";
import type { ActivityLevel } from "@/lib/tdee";
import AccordionSection from "@/components/AccordionSection";
import type { UserProfile } from "@/lib/auth";

interface TDEESectionProps {
  profile: UserProfile;
  showTDEE: boolean;
  setShowTDEE: (v: boolean) => void;
  age: number;
  setAge: (v: number) => void;
  activityLevel: ActivityLevel;
  setActivityLevel: (v: ActivityLevel) => void;
  trainingPhase: "cut" | "lean bulk" | "recomp";
  setTrainingPhase: (v: "cut" | "lean bulk" | "recomp") => void;
  tdee: {
    bmr: number;
    tdee: number;
    targetCalories: number;
    protein: number;
    carbs: number;
    fat: number;
    deficit: number;
  };
  updateProfile: (data: Partial<UserProfile>, opts?: { allowProtected?: boolean }) => Promise<void>;
}

export default function TDEESection({
  profile,
  showTDEE,
  setShowTDEE,
  age,
  setAge,
  activityLevel,
  setActivityLevel,
  trainingPhase,
  setTrainingPhase,
  tdee,
  updateProfile,
}: TDEESectionProps) {
  return (
    <AccordionSection icon={<Calculator className="w-5 h-5 text-primary" />} title="Training Setup" subtitle="TDEE & training phase">

      {/* TDEE Calculator */}
      <div className="bg-card rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowTDEE(!showTDEE)}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-3">
            <Calculator className="w-5 h-5 text-primary" />
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">TDEE Calculator</p>
              <p className="text-xs text-muted-foreground">
                {tdee.targetCalories} cal/day target
              </p>
            </div>
          </div>
          {showTDEE ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {showTDEE && (
          <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4">
            <div>
              <label htmlFor="tdee-age" className="text-sm text-muted-foreground">Age</label>
              <input
                id="tdee-age"
                type="number"
                value={age}
                onChange={(e) => setAge(Number(e.target.value) || 25)}
                className="w-full mt-1 px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm"
              />
            </div>

            <div>
              <span className="text-sm text-muted-foreground">Activity Level</span>
              <div className="mt-1 space-y-1">
                {(Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setActivityLevel(key)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors",
                      activityLevel === key
                        ? "bg-primary/10 text-primary font-medium"
                        : "bg-muted text-muted-foreground hover:text-foreground",
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
                <p className="text-lg font-bold text-foreground">{tdee.bmr}</p>
                <p className="text-[11px] text-muted-foreground">BMR</p>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-foreground">{tdee.tdee}</p>
                <p className="text-[11px] text-muted-foreground">TDEE</p>
              </div>
            </div>

            <div className="bg-primary/5 rounded-xl p-4 space-y-2">
              <p className="text-xs font-medium text-foreground">
                Daily Target: <span className="text-primary">{tdee.targetCalories} cal</span>
                {tdee.deficit !== 0 && (
                  <span className="text-muted-foreground">
                    {" "}({tdee.deficit > 0 ? "+" : ""}{tdee.deficit})
                  </span>
                )}
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-sm font-bold text-blue-500">{tdee.protein}g</p>
                  <p className="text-[11px] text-muted-foreground">Protein</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-500">{tdee.carbs}g</p>
                  <p className="text-[11px] text-muted-foreground">Carbs</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-pink-500">{tdee.fat}g</p>
                  <p className="text-[11px] text-muted-foreground">Fat</p>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Training Phase */}
      <div className="bg-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Training Phase</p>
            <p className="text-xs text-muted-foreground">
              Adjusts macro targets and performance insights
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {([
            { value: "lean bulk" as const, label: "Lean Bulk", desc: "Muscle gain", color: "#22c55e" },
            { value: "cut" as const, label: "Cut", desc: "Fat loss", color: "#ef4444" },
            { value: "recomp" as const, label: "Recomp", desc: "Body recomp", color: "#a855f7" },
          ]).map((phase) => (
            <button
              key={phase.value}
              onClick={() => setTrainingPhase(phase.value)}
              className={cn(
                "p-3 rounded-xl border text-center transition-all",
                trainingPhase === phase.value
                  ? "border-primary bg-primary/10"
                  : "border-border/50 bg-muted/30 hover:border-border"
              )}
            >
              <div
                className="w-2 h-2 rounded-full mx-auto mb-2"
                style={{ backgroundColor: phase.color }}
              />
              <p className={cn(
                "text-xs font-medium",
                trainingPhase === phase.value ? "text-primary" : "text-foreground"
              )}>
                {phase.label}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {phase.desc}
              </p>
            </button>
          ))}
        </div>

        <p className="text-xs text-primary/60 italic text-center">
          Tap Save Changes to apply
        </p>

        <div className="rounded-xl bg-muted/50 p-3 space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Daily targets for {trainingPhase}
          </p>
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <p className="text-sm font-bold text-foreground">{tdee.targetCalories}</p>
              <p className="text-[11px] text-muted-foreground">cal</p>
            </div>
            <div className="w-px h-6 bg-border/50" />
            <div className="text-center flex-1">
              <p className="text-sm font-bold text-blue-500">{tdee.protein}g</p>
              <p className="text-[11px] text-muted-foreground">protein</p>
            </div>
            <div className="w-px h-6 bg-border/50" />
            <div className="text-center flex-1">
              <p className="text-sm font-bold text-amber-500">{tdee.carbs}g</p>
              <p className="text-[11px] text-muted-foreground">carbs</p>
            </div>
            <div className="w-px h-6 bg-border/50" />
            <div className="text-center flex-1">
              <p className="text-sm font-bold text-pink-500">{tdee.fat}g</p>
              <p className="text-[11px] text-muted-foreground">fat</p>
            </div>
          </div>
          {tdee.deficit !== 0 && (
            <p className="text-[11px] text-muted-foreground text-center">
              {tdee.deficit > 0 ? "+" : ""}{tdee.deficit} cal vs maintenance
            </p>
          )}
            {/* Manual calorie override */}
            <div className="mt-3 pt-3 border-t border-border/50">
              <label htmlFor="tdee-custom-target" className="text-sm text-muted-foreground">
                Custom daily target (optional)
              </label>
              <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
                Leave blank to use your calculated TDEE of {tdee.targetCalories} cal
              </p>
              <input
                id="tdee-custom-target"
                type="number"
                value={profile?.customCalorieTarget ?? ""}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  updateProfile({ customCalorieTarget: val || undefined });
                }}
                placeholder={String(tdee.targetCalories)}
                className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm"
              />
            </div>
        </div>
      </div>

    </AccordionSection>
  );
}
