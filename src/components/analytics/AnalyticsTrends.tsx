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
      <Card padded={false} className="divide-y divide-border overflow-hidden">
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => {
              haptic();
              onOpen(row.page);
            }}
            className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-foreground">
                {row.label}
              </span>
              <span className="block truncate text-sm text-muted-foreground">
                {row.detail}
              </span>
            </span>
            {row.series && (
              <Sparkline
                values={row.series}
                color={row.color}
                className="shrink-0"
              />
            )}
            {row.value && (
              <span className="shrink-0 text-right">
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
