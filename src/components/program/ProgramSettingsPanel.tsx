import { forwardRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/IconButton";
import type { Goal, SplitType } from "@/features/program/programTypes";
import { splitLabel } from "@/features/program/programEngine";

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

type PendingAction =
  | { kind: "goal"; goal: Goal }
  | { kind: "reset" };

const ProgramSettingsPanel = forwardRef<HTMLDivElement, ProgramSettingsPanelProps>(
  ({ currentGoal, currentSplit, settings, onClose, onRegenerate, onUpdateSettings }, ref) => {
    const [pending, setPending] = useState<PendingAction | null>(null);

    const confirmPending = () => {
      if (!pending) return;
      if (pending.kind === "goal") onRegenerate(pending.goal);
      else onRegenerate();
      setPending(null);
    };

    const pendingTitle =
      pending?.kind === "goal"
        ? `Switch to ${goalLabel(pending.goal)}?`
        : pending?.kind === "reset"
          ? "Reset programme?"
          : "";
    // Both actions call regenerateProgram, which resets weekNumber to 1
    // and clears weekHistory — the user loses their place in the
    // current week and can no longer browse to past weeks via the
    // history navigator. Saved workout records (in Firestore) are NOT
    // affected, so PRs / streaks / analytics stay intact.
    const pendingBody =
      pending?.kind === "goal"
        ? "Your programme will be rebuilt with the new goal. You'll start fresh at Week 1 — past week summaries will be cleared. Logged workouts in History stay intact."
        : pending?.kind === "reset"
          ? "Your programme will be rebuilt from scratch with your current goal and training days. You'll start fresh at Week 1 — past week summaries will be cleared. Logged workouts in History stay intact."
          : "";

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
          style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-w-md mx-auto p-4 space-y-4">
            <div className="w-10 h-1 rounded-full bg-border mx-auto" />

            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-foreground">Programme Settings</p>
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="text-sm font-medium text-primary">
                  Done
                </button>
                <IconButton
                  onClick={onClose}
                  aria-label="Close settings"
                  size="sm"
                  className="text-muted-foreground"
                  icon={<X />}
                />
              </div>
            </div>

            {/* Goal selector — confirmation required since changing goal
                triggers a full programme rebuild. Tapping the current
                goal is a no-op. */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Goal</p>
              <div className="flex gap-1">
                {(["cut", "recomp", "lean bulk"] as Goal[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => {
                      if (g !== currentGoal) setPending({ kind: "goal", goal: g });
                    }}
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

            {/* Split (read-only) — the engine derives the split
                deterministically from training days/week (chooseSplit
                in programEngine.ts), so this isn't user-selectable here.
                Showing it as buttons would imply a choice the user
                doesn't have AND the previous version offered only 2 of
                the 6 supported splits while bundling them with hidden
                day-count changes. */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Split</p>
              <div className="px-3 py-2.5 rounded-lg bg-muted">
                <p className="text-sm font-medium text-foreground">
                  {splitLabel(currentSplit as SplitType)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Auto-derived from your training days. To change, edit your weekly schedule in Settings &rarr; Training.
                </p>
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">Auto Progression</p>
                  <p className="text-xs text-muted-foreground">
                    Bumps next session&apos;s weight when you complete every set cleanly
                  </p>
                </div>
                <button
                  onClick={() => onUpdateSettings({ autoProgression: !settings.autoProgression })}
                  className={cn("w-10 h-6 rounded-full transition-colors relative pointer-events-auto shrink-0 ml-3", settings.autoProgression ? "bg-primary" : "bg-muted")}
                  aria-pressed={settings.autoProgression}
                  aria-label="Auto progression"
                >
                  <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform", settings.autoProgression ? "translate-x-5" : "translate-x-1")} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">Microloading</p>
                  <p className="text-xs text-muted-foreground">
                    Use ½ kg jumps on smaller lifts (curls, raises) so progression keeps moving past stalls
                  </p>
                </div>
                <button
                  onClick={() => onUpdateSettings({ microloading: !settings.microloading })}
                  className={cn("w-10 h-6 rounded-full transition-colors relative pointer-events-auto shrink-0 ml-3", settings.microloading ? "bg-primary" : "bg-muted")}
                  aria-pressed={settings.microloading}
                  aria-label="Microloading"
                >
                  <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform", settings.microloading ? "translate-x-5" : "translate-x-1")} />
                </button>
              </div>
            </div>

            <button
              onClick={() => setPending({ kind: "reset" })}
              className="w-full py-2.5 rounded-xl bg-red-500/10 text-red-500 text-sm font-medium hover:bg-red-500/20 transition-colors pointer-events-auto"
            >
              Reset Programme
            </button>

            <div className="h-[120px]" />
          </div>
        </motion.div>

        {/* Confirmation modal — gates regenerateProgram() destructive
            paths (goal change, reset). Mirrors the restructure modal
            pattern in Settings.tsx so behaviour is consistent across
            the two surfaces that can rebuild the programme. */}
        <AnimatePresence>
          {pending && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setPending(null)}
                className="fixed inset-0 bg-black/60 z-[60]"
              />
              <motion.div
                role="alertdialog"
                aria-modal="true"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[61] bg-card rounded-2xl p-4 space-y-3 max-w-sm mx-auto shadow-xl"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(245,158,11,0.12)" }}>
                    <AlertTriangle className="w-4 h-4" style={{ color: "#f59e0b" }} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{pendingTitle}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{pendingBody}</p>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setPending(null)}
                    className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmPending}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
                  >
                    {pending.kind === "reset" ? "Reset" : "Switch"}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>
    );
  }
);

ProgramSettingsPanel.displayName = "ProgramSettingsPanel";
export default ProgramSettingsPanel;
