import { useEffect, useRef } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { Flame, X } from "lucide-react";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import { track as trackProgrammeEvent } from "@/lib/programmeAnalytics";

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
}

/**
 * Pgm3 locked deload banner. Sits above the DayStepper at the week
 * level so it's visible regardless of which day the user is
 * inspecting — deload is a week-level signal, not a day-level one.
 *
 * v1 ships informational copy + a Dismiss action. The locked
 * "Apply" CTA is reserved for when the program-engine deload-apply
 * mutation lands (it'd need to reduce volume across the active
 * week's planned sessions). Until then, the user can act on the
 * banner manually by lifting lighter / running easier; the banner
 * itself is the awareness surface.
 *
 * Telemetry per Pgm3 lock:
 *   - programme_deload_banner_viewed: fires once per session when
 *     the banner first becomes visible (deloadRecommended flips
 *     true AND the user hasn't dismissed for this week).
 *   - programme_deload_banner_action: fires on dismiss with
 *     action: 'dismissed'. The 'applied' action is reserved.
 *
 * Animation: framer-motion AnimatePresence slide-down + fade on
 * first appearance. Subsequent navigations between days find the
 * banner already-mounted (no re-animation — wouldn't want jitter
 * on every day-stepper tap).
 */
export default function DeloadBanner({ visible, weekKey }: DeloadBannerProps) {
  const { dismissed, dismiss } = useDismissOnce(
    `${DISMISSED_STORAGE_PREFIX}:${weekKey}`
  );
  const prefersReducedMotion = useReducedMotion();
  // viewedFiredRef ensures the viewed event fires at most once per
  // mount-visible cycle. If the week changes or the flag re-trips
  // after dismissal-window expiry, the parent will remount this
  // component (key on weekKey) and the ref resets.
  const viewedFiredRef = useRef(false);

  const shouldRender = visible && !dismissed;

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
            className="p-4 rounded-2xl flex items-start gap-3 relative"
            style={{ background: THEME.warning + "14" }}
            role="region"
            aria-label="Deload week recommended"
          >
            <Flame
              className="size-5 shrink-0 mt-0.5"
              style={{ color: THEME.warning }}
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-semibold"
                style={{ color: THEME.warning }}
              >
                Consider a deload week
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Your training load has been high with signs of reduced recovery.
                A lighter week can help you come back stronger.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss deload banner"
              className="size-7 -m-1 rounded-lg flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-black/[0.04] active:scale-90 transition-all"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
