import { Dumbbell } from "lucide-react";

interface CompactExerciseRowProps {
  name: string;
  summary: string;
  onTap: () => void;
  opacity?: number;
}

export default function CompactExerciseRow({
  name,
  summary,
  onTap,
  opacity = 1,
}: CompactExerciseRowProps) {
  return (
    <button
      onClick={onTap}
      className="w-full flex items-center gap-3 h-11 px-4 text-left active:scale-[0.98] transition-transform"
      style={{ opacity }}
    >
      <Dumbbell className="w-5 h-5 shrink-0 text-muted-foreground/50" />
      <span className="flex-1 min-w-0 text-sm font-normal text-foreground truncate">
        {name}
      </span>
      <span className="text-sm text-muted-foreground font-mono tabular-nums shrink-0 ml-2">
        {summary}
      </span>
    </button>
  );
}
