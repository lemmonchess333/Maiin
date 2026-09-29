import { cn } from "@/lib/utils";

/**
 * The Performance Index's change on last week, in words: "Up 3 on last
 * week". Plain grey text, as the calorie ring's label is (owner call;
 * DS3's STATUS lines). It was a green or coral pill with an
 * arrow, which graded the change and spent the running colour on a falling
 * score. The verb beside it already says what kind of week it was.
 *
 * `compact` is Home's row, where the whole sentence does not fit beside
 * the title on a small phone: it reads "Up 3", and the row's description
 * says the rest to a screen reader.
 */
export default function PerformanceChange({
  delta,
  compact = false,
  className,
  "aria-hidden": ariaHidden,
}: {
  /** Whole points, never 0: a week that held level shows nothing. */
  delta: number;
  compact?: boolean;
  className?: string;
  "aria-hidden"?: "true";
}) {
  return (
    <span
      className={cn("text-xs font-medium text-muted-foreground", className)}
      aria-hidden={ariaHidden}
    >
      {delta > 0 ? "Up" : "Down"}{" "}
      <span className="font-mono tabular-nums">{Math.abs(delta)}</span>
      {compact ? null : " on last week"}
    </span>
  );
}
