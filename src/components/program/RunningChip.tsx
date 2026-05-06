import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Footprints, ChevronRight } from "lucide-react";
import { useRunningStats } from "@/hooks/useRunningStats";
import { haptic } from "@/lib/haptic";
import { THEME } from "@/lib/theme";

/**
 * Small inline pill that sits next to the "Programme" title and
 * deep-links to /run. Replaces an earlier full-width strip that
 * claimed too much visual weight on a lifting-first page — this is
 * deliberately a status-badge sized affordance, similar to a "Beta"
 * tag next to a feature name, NOT a CTA button.
 *
 * Reuses useRunningStats(30) so the count reflects the same
 * "this week" math as the History page surfaces.
 */
export default function RunningChip() {
  const navigate = useNavigate();
  const { runs } = useRunningStats(30);

  const startOfWeek = (() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const thisWeekCount = runs.filter((r) => r.completedAt >= startOfWeek).length;
  const label = thisWeekCount > 0 ? `Running · ${thisWeekCount}` : "Running";

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={() => {
        haptic("light");
        navigate("/run");
      }}
      aria-label="Open running tools"
      /* `before:` extends the hit area to ≥44px tall without growing
         the visual chip — the visible pill stays ~28px while the
         effective touch target absorbs vertical space outside its
         own box. Sibling elements (the h1 next to it) aren't
         interactive so the larger touch zone can't steal taps. */
      className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full self-center shrink-0 before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
      style={{
        backgroundColor: `${THEME.running}1F`,
        color: THEME.running,
      }}
    >
      <Footprints size={12} />
      <span className="text-xs font-semibold">{label}</span>
      <ChevronRight size={12} />
    </motion.button>
  );
}
