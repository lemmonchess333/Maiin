import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Footprints, ChevronRight } from "lucide-react";
import { useRunningStats } from "@/hooks/useRunningStats";
import { getTimeAgo } from "@/lib/timeAgo";
import { haptic } from "@/lib/haptic";
import { THEME } from "@/lib/theme";

/**
 * Quiet running entry-point that lives in the gap between the
 * Programme page title and the lifting-specific WeekPhaseRow / day
 * stepper. The Programme page is otherwise lifting-only, and a user
 * who wants to start a run currently has to bounce out to Home or use
 * the bottom nav. The strip is deliberately understated — a thin
 * coral-tinted row, NOT a CTA — so it doesn't compete with
 * TodaySessionCard or the exercise list.
 *
 * Reuses the existing `useRunningStats(30)` hook (already used by the
 * History page). 30 days is a deliberate window: users dormant longer
 * than that fall through to "Tap to start" copy, which doubles as
 * honest re-engagement language. No new Firestore query.
 */
export default function RunningModalityStrip() {
  const navigate = useNavigate();
  const { runs } = useRunningStats(30);

  const startOfWeek = (() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const thisWeekCount = runs.filter((r) => r.completedAt >= startOfWeek).length;
  const lastRun = runs[0];

  let statusText: string;
  let statusColor: string | undefined;
  if (thisWeekCount > 0) {
    statusText = `${thisWeekCount} run${thisWeekCount === 1 ? "" : "s"} this week`;
  } else if (lastRun) {
    const km = (lastRun.distance / 1000).toFixed(1);
    statusText = `Last: ${km}km ${getTimeAgo(lastRun.completedAt)}`;
  } else {
    statusText = "Tap to start";
    statusColor = THEME.running;
  }

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={() => {
        haptic("light");
        navigate("/run");
      }}
      aria-label="Open running tools"
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mt-3 mb-4"
      style={{
        backgroundColor: `${THEME.running}14`,
        border: `1px solid ${THEME.running}1A`,
        minHeight: 44,
      }}
    >
      <Footprints size={18} style={{ color: THEME.running }} />
      <span className="text-sm font-semibold text-foreground">Running</span>
      {statusColor ? (
        <span className="ml-auto text-xs" style={{ color: statusColor }}>
          {statusText}
        </span>
      ) : (
        <span className="ml-auto text-xs text-muted-foreground">
          {statusText}
        </span>
      )}
      <ChevronRight size={16} className="text-muted-foreground" />
    </motion.button>
  );
}
