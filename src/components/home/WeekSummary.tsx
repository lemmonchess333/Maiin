import type { WeekSummaryCounts } from "@/lib/weekSummary";

interface Part {
  key: string;
  label: string;
  done: number;
  of: number | null;
  unit?: string;
}

/**
 * What the week's count is made of, as one quiet line under Home's week
 * segments (Trim1 call 1): "Lifts 2 of 3", "Runs 1 of 2", "Food logged 4
 * of 7 days".
 *
 * It was a card of its own at the foot of Home, three columns with bars
 * under a "This week" heading (DS3). The line above the segments ("3 of 5
 * sessions this week") read the same counts, so Home said the week twice.
 * The two are one card now, and the segments are its picture.
 *
 * Lifts and runs are listed only when the week holds both. With one of
 * them, the line above the segments is already its count, and saying it
 * again is what this card stopped doing.
 *
 * A discipline the week has neither planned nor logged is left out, so a
 * runner who does not lift is not shown "0 lifts" every week. A runner
 * always has Runs (Home4 (1)): on a free-run plan nothing is planned, and
 * it would otherwise appear only after the week's first run.
 *
 * Food is always listed. It is the one every week has, and nothing else
 * on Home counts its days.
 */
export default function WeekSummary({
  counts,
  runner = false,
}: {
  counts: WeekSummaryCounts;
  /** The person runs (setup's `runFrequency` is not "none"). */
  runner?: boolean;
}) {
  const training: Part[] = [];
  if (counts.lifts.planned !== null || counts.lifts.done > 0)
    training.push({
      key: "lifts",
      label: "Lifts",
      done: counts.lifts.done,
      of: counts.lifts.planned,
    });
  if (runner || counts.runs.planned !== null || counts.runs.done > 0)
    training.push({
      key: "runs",
      label: "Runs",
      done: counts.runs.done,
      of: counts.runs.planned,
    });
  const parts: Part[] = [
    ...(training.length > 1 ? training : []),
    {
      key: "food",
      label: "Food logged",
      done: counts.foodDays,
      of: counts.foodDayTotal,
      unit: "days",
    },
  ];

  return (
    <ul
      aria-label="This week so far"
      className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm text-muted-foreground"
    >
      {parts.map((p) => (
        <li key={p.key} data-week-part={p.key}>
          {p.label}{" "}
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {p.done}
          </span>
          {p.of !== null && (
            <>
              {" of "}
              <span className="font-mono tabular-nums">{p.of}</span>
              {p.unit ? ` ${p.unit}` : ""}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
