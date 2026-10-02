import type { WeekSummaryCounts } from "@/lib/weekSummary";

interface Column {
  key: string;
  label: string;
  done: number;
  of: number | null;
  unit?: string;
  fill: string;
}

/**
 * The week so far, as up to three columns with bars (DS3 Home).
 *
 * A discipline the week has neither planned nor logged is left out, so a
 * runner who does not lift is not shown "0 of 0 lifts" every week. Food
 * is always shown: it is the one every week has. Each bar is the share of
 * the plan done, full once the plan is met.
 */
export default function WeekSummary({ counts }: { counts: WeekSummaryCounts }) {
  const columns: Column[] = [];
  if (counts.lifts.planned > 0 || counts.lifts.done > 0)
    columns.push({
      key: "lifts",
      label: "Lifts",
      done: counts.lifts.done,
      of: counts.lifts.planned || null,
      fill: "hsl(var(--lifting))",
    });
  if (counts.runs.planned > 0 || counts.runs.done > 0)
    columns.push({
      key: "runs",
      label: "Runs",
      done: counts.runs.done,
      of: counts.runs.planned || null,
      fill: "hsl(var(--running))",
    });
  columns.push({
    key: "food",
    label: "Food logged",
    done: counts.foodDays,
    of: counts.foodDayTotal,
    unit: "days",
    fill: "hsl(var(--nutrition))",
  });

  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
      }}
    >
      {columns.map((c) => {
        const share =
          c.of !== null ? Math.min(1, c.done / c.of) : c.done > 0 ? 1 : 0;
        return (
          <div
            key={c.key}
            role="group"
            aria-label={
              c.of !== null
                ? `${c.label}: ${c.done} of ${c.of}${c.unit ? ` ${c.unit}` : ""}`
                : `${c.label}: ${c.done}`
            }
            className="min-w-0"
          >
            <p className="text-xs font-semibold text-muted-foreground">
              {c.label}
            </p>
            <p
              className="mt-1 text-sm text-muted-foreground"
              aria-hidden="true"
            >
              <span className="text-lg font-extrabold font-mono tabular-nums text-foreground">
                {c.done}
              </span>
              {c.of !== null && (
                <>
                  {" of "}
                  <span className="font-mono tabular-nums">{c.of}</span>
                  {c.unit ? ` ${c.unit}` : ""}
                </>
              )}
            </p>
            <div
              className="mt-1.5 h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: "hsl(var(--muted-foreground) / 0.22)" }}
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${share * 100}%`, backgroundColor: c.fill }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
