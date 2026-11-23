import Sparkline from "@/components/analytics/Sparkline";
import SectionLabel from "@/components/ui/SectionLabel";

/** One daily average on Progress › Food: calories, or a macro. */
export interface FoodAverage {
  key: string;
  label: string;
  value: string;
  unit: string;
  /** The change on the previous range, in grey whichever way it moved. */
  delta?: { value: string; positive: boolean } | null;
  /** "target 2,350 kcal", "target 181g". */
  target?: string;
  /** The range's days, for the line's shape; left out when too thin. */
  sparkline?: readonly number[];
  lineColor: string;
}

/** "↓1% vs last · target 2,350 kcal": what a figure stands against. */
function againstLine(average: FoodAverage): string | null {
  const parts = [
    average.delta
      ? `${average.delta.positive ? "↑" : "↓"}${average.delta.value} vs last`
      : null,
    average.target ?? null,
  ].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Progress › Food's daily averages, on the page: calories as the one lead
 * figure with its line across the width, then protein, carbs and fat as
 * ruled rows, each with its figure, a small line for the shape and what
 * it stands against. Nothing here is tapped, so none of it is a card.
 */
export default function FoodAverages({
  lead,
  rows,
}: {
  lead: FoodAverage;
  rows: readonly FoodAverage[];
}) {
  const leadAgainst = againstLine(lead);
  return (
    <section aria-label="Daily averages" className="@container space-y-1">
      <div className="pt-4 pb-2">
        <SectionLabel className="mb-1">{lead.label}</SectionLabel>
        {/* At larger text the unit wraps under the figure rather than
            squeezing it. */}
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-4xl font-extrabold font-figure tabular-nums leading-none text-foreground">
            {lead.value}
          </span>
          <span className="text-sm text-muted-foreground">{lead.unit}</span>
        </p>
        {lead.sparkline && (
          <Sparkline
            values={lead.sparkline}
            color={lead.lineColor}
            width={320}
            height={32}
            fluid
            endDot
            className="mt-3 block"
          />
        )}
        {leadAgainst && (
          <p className="mt-2 text-sm text-muted-foreground font-mono tabular-nums">
            {leadAgainst}
          </p>
        )}
      </div>
      <ul className="divide-y divide-border border-t border-border">
        {rows.map((row) => {
          const against = againstLine(row);
          return (
            <li
              key={row.key}
              className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-3"
            >
              <span className="min-w-min flex-1">
                <span className="block text-base font-semibold text-foreground">
                  {row.label}
                </span>
                {against && (
                  <span className="block text-sm text-muted-foreground font-mono tabular-nums text-pretty">
                    {against}
                  </span>
                )}
              </span>
              {row.sparkline && (
                /* The line gives its room to the words under 20em of
                   page (a 320px phone at larger text). */
                <Sparkline
                  values={row.sparkline}
                  color={row.lineColor}
                  className="shrink-0 @max-[20em]:hidden"
                />
              )}
              <span className="ml-auto text-right">
                <span className="text-lg font-bold font-figure tabular-nums text-foreground">
                  {row.value}
                </span>
                <span className="text-sm text-muted-foreground">
                  {" "}
                  {row.unit}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
