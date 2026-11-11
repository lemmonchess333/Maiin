import { cn } from "@/lib/utils";

/** A chart's reading, and whether it is the line that waits for data. */
export interface ChartReadingLine {
  text: string;
  /** A first-use line ("From 3 Dec, this compares…"), not a verdict. */
  waiting: boolean;
}

/**
 * The reading line under a History chart's title (DS4, §14m words rules):
 * the verdict, one of the person's numbers and what it is compared with,
 * from `historyReadings`. In the card's own text colour, as the Sets per
 * muscle verdict already was: a reading never takes a good or bad colour
 * of its own, so the number, the colour and the words cannot disagree. A
 * line still waiting for data reads as the card's other first-use lines
 * do, muted.
 */
export default function ChartReading({
  line,
  className,
}: {
  line: ChartReadingLine | null;
  className?: string;
}) {
  if (!line) return null;
  return (
    <p
      className={cn(
        "text-sm text-pretty",
        line.waiting
          ? "text-muted-foreground"
          : "font-semibold text-foreground",
        className
      )}
      data-testid="chart-reading"
    >
      {line.text}
    </p>
  );
}
