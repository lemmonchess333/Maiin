import { ChevronRight } from "lucide-react";
import Card from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import Sparkline from "@/components/analytics/Sparkline";
import type { AnalyticsPage } from "@/components/analytics/AnalyticsGoDeeper";
import type { TrendRow } from "@/components/analytics/trendRows";
import { haptic } from "@/lib/haptic";

/**
 * The overview's Trends (DS3): one row per measure that moves — weight,
 * what you eat, what you could race — each with its figure, what it is
 * measured against, and a small line for the shape. A row opens the page
 * that holds its chart.
 *
 * Sessions, volume and distance are not here: the period summary above
 * already states them with their change, and saying a number twice on
 * one screen is the thing DS3 set out to stop.
 */
export default function AnalyticsTrends({
  rows,
  onOpen,
}: {
  rows: readonly TrendRow[];
  onOpen: (page: AnalyticsPage) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section aria-label="Trends" className="space-y-2">
      <SectionHeading>Trends</SectionHeading>
      <Card
        padded={false}
        className="@container divide-y divide-border overflow-hidden"
      >
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => {
              haptic();
              onOpen(row.page);
            }}
            className="flex min-h-16 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            {/* The figure drops under the words when the two no longer
                fit side by side (larger text on the phone), rather than
                pushing "target 2,200" past the card. */}
            <span className="min-w-min flex-1">
              <span className="block text-base font-semibold text-foreground break-words hyphens-auto">
                {row.label}
              </span>
              {/* Wraps rather than cuts: "Down 1.2 kg since 30 A…" hid the
                  one part of the line that says what the change is from. */}
              <span className="block text-sm text-muted-foreground">
                {row.detail}
              </span>
            </span>
            {row.series && (
              /* The line is a glance at the shape, not the figure: it
                 gives its room to the label once the card is under 20em
                 (a 320px phone at larger text). */
              <Sparkline
                values={row.series}
                color={row.color}
                className="hidden shrink-0 @min-[20em]:block"
              />
            )}
            {row.value && (
              <span className="ml-auto min-w-min text-right">
                <span className="text-lg font-bold font-mono tabular-nums text-foreground">
                  {row.value}
                </span>
                {row.unit && (
                  <span className="text-sm text-muted-foreground">
                    {" "}
                    {row.unit}
                  </span>
                )}
              </span>
            )}
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        ))}
      </Card>
    </section>
  );
}
