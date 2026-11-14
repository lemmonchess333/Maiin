import OptionCard from "@/components/onboarding/OptionCard";
import {
  ROLLING_GOALS,
  ROLLING_GOAL_LINES,
  ROLLING_GOAL_NAMES,
  type RollingGoal,
} from "@/features/program/rollingPlan";

/**
 * The goals of a plan with no race date (Run24 (3), deep dive D7), one card
 * each with what its weeks hold, as setup and the run plan editor offer
 * them. A plan with no date is free on every account: only half and full
 * marathon race plans are Pro after their first week (`racePlanLocked`).
 */
export default function RollingGoalPicker({
  value,
  onChange,
}: {
  value: RollingGoal;
  onChange: (goal: RollingGoal) => void;
}) {
  return (
    <div role="group" aria-label="Plan goal" className="space-y-2">
      {ROLLING_GOALS.map((goal) => (
        <OptionCard
          key={goal}
          tone="running"
          selected={value === goal}
          onSelect={() => onChange(goal)}
          label={ROLLING_GOAL_NAMES[goal]}
          desc={ROLLING_GOAL_LINES[goal]}
        />
      ))}
    </div>
  );
}
