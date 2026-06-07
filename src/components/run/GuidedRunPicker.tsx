import { GUIDED_WORKOUTS, type GuidedRunWorkout } from "@/lib/guidedRun";
import SectionLabel from "@/components/ui/SectionLabel";
import { cn } from "@/lib/utils";

interface Props {
  selected: GuidedRunWorkout | null;
  onSelect: (workout: GuidedRunWorkout) => void;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "Beginner",
  moderate: "Intermediate",
  hard: "Advanced",
};

export default function GuidedRunPicker({ selected, onSelect }: Props) {
  return (
    <div className="space-y-2">
      <SectionLabel>Pick a Guided Run</SectionLabel>
      <div className="space-y-2">
        {GUIDED_WORKOUTS.map((w) => {
          const isSelected = selected?.id === w.id;
          return (
            <button
              type="button"
              key={w.id}
              onClick={() => onSelect(w)}
              className={cn(
                "w-full p-3.5 rounded-xl text-left transition-all active:scale-[0.98] border-2",
                !isSelected && "bg-muted border-border"
              )}
              style={
                isSelected
                  ? {
                      background: `${w.color}15`,
                      border: `2px solid ${w.color}60`,
                      boxShadow: `0 0 0 3px ${w.color}20`,
                    }
                  : undefined
              }
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-sm font-bold"
                  style={{ color: isSelected ? w.color : undefined }}
                >
                  {w.name}
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: `${w.color}20`, color: w.color }}
                >
                  {w.totalMinutes} min
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{w.description}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {DIFFICULTY_LABEL[w.difficulty]} · {w.segments.length} segments
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
