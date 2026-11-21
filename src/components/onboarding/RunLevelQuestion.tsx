/**
 * Setup's running question: how much the person runs now, which a plan's
 * running is built from (`runFrequency`). Nothing is chosen until they
 * choose. Setup's running step and Run plan's Add running both draw it
 * (TrainWk1 step 6).
 */
import OptionCard from "@/components/onboarding/OptionCard";
import ChoiceArt from "@/components/onboarding/ChoiceArt";
import type { RunLevel } from "@/lib/sportChange";

const LEVELS = [
  {
    id: "new",
    label: "New to running",
    desc: "Starting out, or coming back after a long gap.",
    distance: 1,
  },
  {
    id: "occasional",
    label: "Occasional runner",
    desc: "Usually one or two runs a week.",
    distance: 2,
  },
  {
    id: "regular",
    label: "Regular runner",
    desc: "Usually three or more runs a week.",
    distance: 3,
  },
] as const;

export default function RunLevelQuestion({
  value,
  onChange,
}: {
  /** The level chosen, or null before one is. */
  value: RunLevel | null;
  onChange: (level: RunLevel) => void;
}) {
  return (
    <>
      {LEVELS.map((option) => (
        <OptionCard
          key={option.id}
          selected={value === option.id}
          tone="running"
          /* A route that grows with the running: one footprint icon three
             times over said nothing about which. */
          icon={
            <ChoiceArt art={{ kind: "route", distance: option.distance }} />
          }
          label={option.label}
          desc={option.desc}
          onSelect={() => onChange(option.id)}
        />
      ))}
    </>
  );
}
