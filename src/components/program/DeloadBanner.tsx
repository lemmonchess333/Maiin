import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, X } from "lucide-react";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import { track as trackProgrammeEvent } from "@/lib/programmeAnalytics";
import { Button } from "@/components/ui/Button";

/** localStorage key prefix for the per-week dismissal flag. Dismissal
 *  is scoped to the active week — moving into a new week reopens the
 *  banner if the deload signal still applies, since the user's load
 *  picture has changed. */
const DISMISSED_STORAGE_PREFIX = "tropos-pgm-deload-dismissed";

interface DeloadBannerProps {
  /** When false the banner is hidden regardless of dismissal state.
   *  Drive this from `currentWeek.flags?.deloadRecommended`. */
  visible: boolean;
  /** Stable identifier for the active week (e.g. ISO week-key like
   *  "2026-W21"). Dismissal is keyed against this so a new week
   *  reopens the banner if the signal still applies. */
  weekKey: string;
  /** PROGRAM-DELOAD-01: true while the active week is already a deload
   *  week (`programState.currentPhase === "deload"` — user-applied OR
   *  the automatic week-4 cycle). Swaps the recommendation copy + Apply
   *  CTA for a calm "active" confirmation so the user is never offered
   *  an Apply that the server would reject as already-deloaded. */
  deloadActive?: boolean;
  /** Training age, straight from `profile.experience`. Drives the
   *  ACTIVE-state copy so it describes the recipe the deload actually
   *  applied (backlog #8's tier split — see deloadEngine): beginner or
   *  unknown cuts a set AND load; intermediate/advanced cuts a set and
   *  reps AT THE SAME LOAD. The old fixed "lighter weights" sentence
   *  was false for every post-novice user (evidence-handoff LIFT-EV-03). */
  experience?: "beginner" | "intermediate" | "advanced";
  /** PROGRAM-DELOAD-01: applies the deload to the active week (the
   *  server `applyDeloadWeek` command). Resolves true on success —
   *  the banner fires the reserved `action: 'applied'` telemetry;
   *  the caller owns the success/undo toast. Absent → the banner
   *  stays informational (pre-wire behaviour). */
  onApply?: () => Promise<boolean>;
}

/**
 * Pgm3 locked deload banner. Sits above the DayStepper at the week
 * level so it's visible regardless of which day the user is
 * inspecting — deload is a week-level signal, not a day-level one.
 *
 * PROGRAM-DELOAD-01 delivers the Apply CTA that v1 reserved: `onApply`
 * routes through the server `applyDeloadWeek` programme command, which
 * applies the SAME tier-split recipe as the automatic week-4 path
 * (deloadEngine mirror of programEngine.applyDeload — beginner/unknown:
 * −1 set + weight ×0.85; intermediate/advanced: −1 set and lower
 * targets at held load). While the week is already deloaded
 * (`deloadActive`) the banner renders a calm confirmation instead of
 * the CTA, worded for the recipe the user's tier actually received.
 *
 * Telemetry per Pgm3 lock:
 *   - programme_deload_banner_viewed: fires once per session when
 *     the banner first becomes visible (deloadRecommended flips
 *     true AND the user hasn't dismissed for this week).
 *   - programme_deload_banner_action: fires on dismiss with
 *     action: 'dismissed', and on a successful apply with
 *     action: 'applied' (the action v1 reserved). The undo action
 *     is tracked by the caller ('undo') since undo lives in its
 *     toast.
 *
 * Animation: framer-motion AnimatePresence slide-down + fade on
 * first appearance. Subsequent navigations between days find the
 * banner already-mounted (no re-animation — wouldn't want jitter
 * on every day-stepper tap).
 */
export default function DeloadBanner({
  visible,
  weekKey,
  deloadActive = false,
  experience,
  onApply,
}: DeloadBannerProps) {
  // Mirrors the recipe branch in programEngine.applyDeload /
  // functions/lib/deloadEngine.js exactly: only these two tiers hold
  // load; beginner AND unknown fall back to the novice cut.
  const deloadHoldsLoad =
    experience === "intermediate" || experience === "advanced";
  const { dismissed, dismiss } = useDismissOnce(
    `${DISMISSED_STORAGE_PREFIX}:${weekKey}`
  );
  const prefersReducedMotion = useReducedMotion();
  // viewedFiredRef ensures the viewed event fires at most once per
  // mount-visible cycle. If the week changes or the flag re-trips
  // after dismissal-window expiry, the parent will remount this
  // component (key on weekKey) and the ref resets.
  const viewedFiredRef = useRef(false);
  const [applying, setApplying] = useState(false);

  // An applied deload overrides a previous dismissal — the state
  // changed materially, and the "active" confirmation is the only
  // surface telling the user their week is eased.
  const shouldRender = visible && (!dismissed || deloadActive);

  const handleApply = async () => {
    if (!onApply || applying) return;
    haptic("light");
    setApplying(true);
    try {
      const ok = await onApply();
      if (ok) {
        trackProgrammeEvent("programme_deload_banner_action", {
          action: "applied",
        });
      }
    } finally {
      setApplying(false);
    }
  };

  useEffect(() => {
    if (!shouldRender || viewedFiredRef.current) return;
    viewedFiredRef.current = true;
    trackProgrammeEvent("programme_deload_banner_viewed");
  }, [shouldRender]);

  const handleDismiss = () => {
    haptic("light");
    trackProgrammeEvent("programme_deload_banner_action", {
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
            style={{
              background: (deloadActive ? THEME.success : THEME.warning) + "14",
            }}
            role="region"
            aria-label={
              deloadActive ? "Deload week active" : "Deload week recommended"
            }
          >
            <div className="flex items-start gap-3">
              <Flame
                className="size-5 shrink-0 mt-0.5"
                style={{
                  color: deloadActive ? THEME.success : THEME.warning,
                }}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold"
                  style={{
                    color: deloadActive ? THEME.success : THEME.warning,
                  }}
                >
                  {deloadActive
                    ? "Deload week active"
                    : "Consider a deload week"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {deloadActive
                    ? deloadHoldsLoad
                      ? "This week's volume is eased — one set fewer and slightly lower targets, at the same weights. Push again next week."
                      : "This week's loads are eased — lighter weights, one set fewer. Push again next week."
                    : "Your training load has been high with signs of reduced recovery. A lighter week can help you come back stronger."}
                </p>
              </div>
              {!deloadActive && (
                <button
                  type="button"
                  onClick={handleDismiss}
                  aria-label="Dismiss deload banner"
                  className="size-7 -m-1 relative before:absolute before:-inset-2 before:content-[''] rounded-lg flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-black/[0.04] active:scale-90 transition-all"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
            {!deloadActive && onApply && (
              <div className="mt-3 pl-8">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={applying}
                  onClick={() => void handleApply()}
                >
                  Apply deload week
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
