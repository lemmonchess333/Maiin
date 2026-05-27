import type { Ref } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Footprints } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { THEME } from "@/lib/theme";

interface Props {
  className?: string;
  /** Forwarded so Coachmark / Tooltip can attach floating-ui's anchor
   *  ref to the underlying button (React 19 ref-as-prop pattern). */
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Top-right utility icon on the Programme page that deep-links to the
 * running flow (/run). Sits alongside the existing reorder + overflow
 * icons as a header utility — the architectural stance is "running
 * entry is a header utility, not a content element."
 *
 * Quiet by design: a coral-tinted 28px circle, intentionally smaller
 * than the 32-44px greyscale neighbours. The colour does the work of
 * marking it interactive; size doesn't have to. We accept icon-only
 * nav's discoverability cost in exchange for visual quietness — the
 * Home page's RunCTACard remains the primary running entry on run
 * days, so users who don't notice this icon still have a path.
 *
 * No coachmark in v1 (no positioned-tooltip primitive exists in the
 * codebase; building one is a separate task). Revisit if data shows
 * the icon is being missed.
 */
export default function RunningNavIcon({ className, ref }: Props) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  // TODO(onboarding): wire a first-use coachmark when a positioned
  // tooltip primitive lands. Use useCoachMarks("program-running-nav-v1")
  // for dismissal state — the hook is ready; only the rendering layer
  // is missing. Bump the v1 suffix if the icon's position or behaviour
  // changes so dismissed users see the new explainer.

  return (
    <motion.button
      ref={ref}
      type="button"
      whileTap={reduced ? undefined : { scale: 0.92 }}
      onClick={() => {
        haptic();
        navigate("/run");
      }}
      aria-label="Open running"
      className={`flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#D4637A] ${className ?? ""}`.trim()}
      style={{ minWidth: 44, minHeight: 44 }}
    >
      {/* Inner span carries the visible 28px circle. The outer button
          is the 44×44 hit area — tap zone extends beyond the visible
          shape so a finger that lands near (but not on) the circle
          still registers. */}
      <span
        className="flex items-center justify-center size-7 rounded-full"
        style={{ backgroundColor: `${THEME.running}24` }}
      >
        <Footprints
          size={14}
          aria-hidden="true"
          style={{ color: THEME.running }}
        />
      </span>
    </motion.button>
  );
}
