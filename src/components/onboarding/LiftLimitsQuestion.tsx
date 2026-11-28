/**
 * Setup's third lifting question: anything to work around. "None" stands
 * alone; the others go together (`toggledLimit`). Setup's limitations step
 * and Lift plan's Add lifting both draw it (TrainWk1 step 6), and the
 * exercise warning sits under the choices in both.
 */
import ExerciseWarning from "@/components/legal/ExerciseWarning";
import OptionCard from "@/components/onboarding/OptionCard";
import { LIFT_LIMIT_OPTIONS, toggledLimit } from "@/lib/liftingQuestions";

export default function LiftLimitsQuestion({
  injuries,
  onChange,
}: {
  injuries: readonly string[];
  onChange: (injuries: string[]) => void;
}) {
  return (
    <>
      {LIFT_LIMIT_OPTIONS.map((option) => (
        <OptionCard
          key={option.id}
          selected={injuries.includes(option.id)}
          label={option.label}
          onSelect={() => onChange(toggledLimit(injuries, option.id))}
        />
      ))}
      <ExerciseWarning />
    </>
  );
}
