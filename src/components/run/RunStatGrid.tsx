import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export interface RunStat {
  label: string;
  value: string;
  /** Set small beside the figure ("/km", "m", "kcal"). */
  unit?: string;
}

/**
 * A run's numbers as one card of four: a label over each figure, the unit
 * small beside it (DS3). The run detail and the run finish screen both
 * lead with the map and the distance, then this.
 *
 * The figures are plain foreground. They were each tinted a different
 * colour — pace in the hydration teal, calories in amber or green —
 * which spent colour on nothing: DS3 keeps each colour for one job.
 */
export default function RunStatGrid({ stats }: { stats: RunStat[] }) {
  return (
    <Card padded={false} className="@container overflow-hidden">
      {/* Two by two, and one per row under 14em of card (larger text, from
          1.35x on a 320px phone): "Elevation" and an hour's "1:02:15" no
          longer fit half the card. The side padding then holds at 16px, as
          iOS keeps its margins, so a figure keeps the room the text grew
          into. Wide-first. */}
      <div className="grid grid-cols-2 @max-[14em]:grid-cols-1">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={cn(
              "p-4 @max-[14em]:px-[16px]",
              i % 2 === 0 && "border-r border-border @max-[14em]:border-r-0",
              i >= 2 && "border-t border-border",
              i === 1 && "@max-[14em]:border-t @max-[14em]:border-border"
            )}
          >
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-h3 font-extrabold font-mono tabular-nums leading-tight text-foreground">
              {stat.value}
              {/* A real space before the unit, so it reads "30 m" to a
                  screen reader as well as on screen. */}
              {stat.unit && (
                <>
                  {" "}
                  <span className="font-sans text-sm font-semibold text-muted-foreground">
                    {stat.unit}
                  </span>
                </>
              )}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
