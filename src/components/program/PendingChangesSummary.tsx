/**
 * Pgm4 / P1 — "N changes pending" line for the sticky save bar.
 *
 * Makes the save bar less abrupt by naming how many plan-shaping fields are
 * dirty before the user commits the rebuild. The count is derived from
 * `computeProgrammeChanges` in the parent (the single source of truth for
 * dirty state + the confirmation recap), so this never duplicates diff
 * logic — it just renders the count. Renders nothing when nothing changed.
 */
import { cn } from "@/lib/utils";

interface PendingChangesSummaryProps {
  count: number;
  className?: string;
}

export default function PendingChangesSummary({
  count,
  className,
}: PendingChangesSummaryProps) {
  if (count <= 0) return null;
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      <span className="font-mono tabular-nums">{count}</span>{" "}
      {count === 1 ? "change" : "changes"} pending
    </p>
  );
}
