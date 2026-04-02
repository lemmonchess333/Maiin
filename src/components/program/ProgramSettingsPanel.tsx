import { forwardRef } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Goal } from "@/features/program/programTypes";

interface ProgramSettingsPanelProps {
  currentGoal: Goal;
  currentSplit: string;
  settings: { autoProgression: boolean; microloading: boolean };
  onClose: () => void;
  onRegenerate: (goal?: Goal, weeklyTarget?: number) => void;
  onUpdateSettings: (patch: Partial<{ autoProgression: boolean; microloading: boolean }>) => void;
}

function goalLabel(g: Goal): string {
  if (g === "cut") return "Cut";
  if (g === "lean bulk") return "Lean Bulk";
  return "Recomp";
}

const ProgramSettingsPanel = forwardRef<HTMLDivElement, ProgramSettingsPanelProps>(
  ({ currentGoal, currentSplit, settings, onClose, onRegenerate, onUpdateSettings }, ref) => {
    return (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 z-40"
        />
        <motion.div
          ref={ref}
          role="dialog"
          aria-modal="true"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl safe-area-pb pointer-events-auto max-h-[85vh] overflow-y-auto"
          style={{ background: "var(--background)", border: "1px solid var(--border)", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-w-md mx-auto p-4 space-y-4">
            <div className="w-10 h-1 rounded-full bg-border mx-auto" />

            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-foreground">Program Settings</p>
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="text-sm font-medium text-primary">
                  Done
                </button>
                <button onClick={onClose} className="p-1 rounded hover:bg-muted" aria-label="Close settings">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Goal selector */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Goal</p>
              <div className="flex gap-1">
                {(["cut", "recomp", "lean bulk"] as Goal[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => onRegenerate(g)}
                    className={cn(
                      "flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors pointer-events-auto",
                      currentGoal === g ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80"
                    )}
                  >
                    {goalLabel(g)}
                  </button>
                ))}
              </div>
            </div>

            {/* Split selector */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Split</p>
              <div className="flex gap-1">
                {([
                  { value: 4, label: "Upper / Lower", split: "upper_lower" as const },
                  { value: 5, label: "Push / Pull / Legs", split: "ppl" as const },
                ]).map((s) => (
                  <button
                    key={s.value}
                    onClick={() => onRegenerate(undefined, s.value)}
                    className={cn(
                      "flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors pointer-events-auto",
                      s.split === currentSplit ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">Auto Progression</p>
                  <p className="text-xs text-muted-foreground">Adjust weights after logging</p>
                </div>
                <button
                  onClick={() => onUpdateSettings({ autoProgression: !settings.autoProgression })}
                  className={cn("w-10 h-6 rounded-full transition-colors relative pointer-events-auto", settings.autoProgression ? "bg-primary" : "bg-muted")}
                >
                  <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform", settings.autoProgression ? "translate-x-5" : "translate-x-1")} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">Microloading</p>
                  <p className="text-xs text-muted-foreground">+1kg steps for isolations</p>
                </div>
                <button
                  onClick={() => onUpdateSettings({ microloading: !settings.microloading })}
                  className={cn("w-10 h-6 rounded-full transition-colors relative pointer-events-auto", settings.microloading ? "bg-primary" : "bg-muted")}
                >
                  <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform", settings.microloading ? "translate-x-5" : "translate-x-1")} />
                </button>
              </div>
            </div>

            <button
              onClick={() => onRegenerate()}
              className="w-full py-2.5 rounded-xl bg-red-500/10 text-red-500 text-sm font-medium hover:bg-red-500/20 transition-colors pointer-events-auto"
            >
              Reset Program
            </button>

            <div className="h-[120px]" />
          </div>
        </motion.div>
      </>
    );
  }
);

ProgramSettingsPanel.displayName = "ProgramSettingsPanel";
export default ProgramSettingsPanel;
