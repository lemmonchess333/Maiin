import { GUIDED_WORKOUTS, type GuidedRunWorkout } from "@/lib/guidedRun";
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
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Pick a Guided Run</p>
      <div className="space-y-2">
        {GUIDED_WORKOUTS.map((w) => {
          const isSelected = selected?.id === w.id;
          return (
            <button
              key={w.id}
              onClick={() => onSelect(w)}
              className={cn(
                "w-full p-3.5 rounded-xl text-left transition-all active:scale-[0.98]",
              )}
              style={isSelected ? {
                background: `${w.color}15`,
                border: `2px solid ${w.color}60`,
                boxShadow: `0 0 0 3px ${w.color}20`,
              } : {
                background: "rgba(255,255,255,0.04)",
                border: "2px solid rgba(255,255,255,0.08)",
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold" style={{ color: isSelected ? w.color : undefined }}>
                  {w.name}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: `${w.color}20`, color: w.color }}>
                  {w.totalMinutes} min
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{w.description}</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">
                {DIFFICULTY_LABEL[w.difficulty]} · {w.segments.length} segments
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
