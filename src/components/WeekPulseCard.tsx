import { useWeekPulse, type PendingRun } from "@/hooks/useWeekPulse";
import WeekPulseView from "@/components/WeekPulseView";

/**
 * "Your week so far" (Rev1 PR2) — the live mid-week counterpart of the
 * Weekly Review's training section, shown at the two moments of maximum
 * attention: SessionCompleteScreen and RunSummary. Week progress in both
 * sport-coded lanes + streak. Deliberately NO PI claims (the index
 * recomputes async after a save — an instant "+3 PI" would be a guess).
 * Renders nothing while loading or when there's nothing to say.
 */
export default function WeekPulseCard({
  /** Finished-but-unsaved sessions to count into this week (see useWeekPulse). */
  pendingLifts = 0,
  /** The run a run's finish screen is showing (see useWeekPulse). */
  pendingRun = null,
}: {
  pendingLifts?: number;
  pendingRun?: PendingRun | null;
} = {}) {
  return <WeekPulseView pulse={useWeekPulse(pendingLifts, pendingRun)} />;
}
