import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BatteryLow, X } from "lucide-react";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import { track as trackProgrammeEvent } from "@/lib/programmeAnalytics";
import { Button } from "@/components/ui/Button";
import type { CanonicalMuscle } from "@/features/program/muscleTaxonomy";

/** Per-week dismissal, same scoping rationale as DeloadBanner: a new week
 *  is a new reduction decision, so the banner reopens if the signal
 *  fires again. */
const DISMISSED_STORAGE_PREFIX = "tropos-pgm-recovery-dismissed";

interface RecoveryReductionBannerProps {
  /** The muscles whose sets/reps this week's rollover halved —
   *  `programState.recoveringMuscles`. Empty/absent hides the banner. */
  muscles: readonly CanonicalMuscle[];
  /** Stable identifier for the active week (`w${displayWeekNumber}`),
   *  scoping the dismissal. */
  weekKey: string;
  /** Restores the undiminished prescription for `muscles` (the
   *  `revertRecoverySession` inverse). Resolves true on success — the
   *  banner then auto-dismisses for the week; the caller owns the
   *  success toast. Absent → informational only. */
  onUndo?: () => Promise<boolean>;
}

/** "Chest and Quads" / "Chest, Quads and Hamstrings". */
function muscleList(muscles: readonly CanonicalMuscle[]): string {
  if (muscles.length <= 1) return muscles[0] ?? "";
  return `${muscles.slice(0, -1).join(", ")} and ${muscles[muscles.length - 1]}`;
}

/**
 * LIFT-EV-05 (owner decision 2026-08-09): the automatic recovery
 * reduction — two sessions of regression on a muscle halves its sets and
 * reps at held load on the next rollover — used to be INVISIBLE: the
 * numbers were simply lower on the day card. This banner surfaces it with
 * honest copy and a one-tap undo.
 *
 * Copy constraints (from the decision): describe the trigger factually
 * (two sessions under target) and the change factually (sets and reps
 * halved, same weight). Never claim individual physiology, MRV science,
 * or a readiness measurement — this is the plan's heuristic.
 *
 * Undo semantics: restore full volume for the reduced muscles; the
 * engine's refractory list stays populated so the same muscles don't
 * re-trigger on the very next rollover (see `revertRecoverySession`).
 */
export default function RecoveryReductionBanner({
  muscles,
  weekKey,
  onUndo,
}: RecoveryReductionBannerProps) {
  const { dismissed, dismiss } = useDismissOnce(
    `${DISMISSED_STORAGE_PREFIX}:${weekKey}`
  );
  const prefersReducedMotion = useReducedMotion();
  const viewedFiredRef = useRef(false);
  const [undoing, setUndoing] = useState(false);

  const shouldRender = muscles.length > 0 && !dismissed;

  useEffect(() => {
    if (!shouldRender || viewedFiredRef.current) return;
    viewedFiredRef.current = true;
    trackProgrammeEvent("programme_recovery_banner_viewed");
  }, [shouldRender]);

  const handleUndo = async () => {
    if (!onUndo || undoing) return;
    haptic("light");
    setUndoing(true);
    try {
      const ok = await onUndo();
      if (ok) {
        trackProgrammeEvent("programme_recovery_banner_action", {
          action: "undone",
        });
        // The prescription is restored; the reduction this banner
        // describes no longer exists, so it leaves with the week.
        dismiss();
      }
    } finally {
      setUndoing(false);
    }
  };

  const handleDismiss = () => {
    haptic("light");
    trackProgrammeEvent("programme_recovery_banner_action", {
      action: "dismissed",
    });
    dismiss();
  };

  return (
    <AnimatePresence>
      {shouldRender && (
        <motion.div
          initial={
            prefersReducedMotion ? false : { opacity: 0, y: -8, height: 0 }
          }
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={
            prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: 0, y: -8, height: 0 }
          }
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { duration: 0.25, ease: "easeOut" }
          }
          className="overflow-hidden"
        >
          <div
            className="p-4 rounded-2xl relative"
            style={{ background: THEME.warning + "14" }}
            role="region"
            aria-label="Recovery reduction active"
          >
            <div className="flex items-start gap-3">
              <BatteryLow
                className="size-5 shrink-0 mt-0.5"
                style={{ color: THEME.warning }}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold"
                  style={{ color: THEME.warning }}
                >
                  {`Eased this week: ${muscleList(muscles)}`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {`Two sessions in a row came in under target, so this week halves sets and reps for ${muscleList(
                    muscles
                  )} at the same weight. It's the plan's heuristic, not a physiology measurement — restore full volume if you feel ready.`}
                </p>
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Dismiss recovery banner"
                className="size-7 -m-1 relative before:absolute before:-inset-2 before:content-[''] rounded-lg flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-black/[0.04] active:scale-90 transition-all"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            {onUndo && (
              <div className="mt-3 pl-8">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={undoing}
                  onClick={() => void handleUndo()}
                >
                  Restore full volume
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
