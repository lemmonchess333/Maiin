import { useElapsedSeconds } from "@/hooks/useElapsedSeconds";
import { formatClock } from "@/utils/formatters";

/** Only this text updates each second, leaving the set editor untouched. */
export default function WorkoutProgress({
  startedAt,
  completed,
  total,
}: {
  startedAt: number;
  completed: number;
  total: number;
}) {
  const elapsed = useElapsedSeconds(startedAt);
  return (
    <p className="text-xs text-muted-foreground">
      {completed}/{total} sets · {formatClock(elapsed)}
    </p>
  );
}
