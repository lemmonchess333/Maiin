import { ResponsiveContainer, AreaChart, Area, YAxis } from "recharts";
import ChartAreaGradient from "./ChartAreaGradient";
import { sparklineDomain } from "@/lib/sparklineDomain";
import { THEME } from "@/lib/theme";
import SectionLabel from "@/components/ui/SectionLabel";

interface StatCardProps {
  label: string;
  value: string;
  /**
   * What KIND of thing `value` is. Default "number".
   *
   * This card is a numeral primitive — 30px extrabold Archivo, tabular
   * figures, `whitespace-nowrap` — and that treatment is right for "47"
   * and wrong for a word. The Load band card passes "Establishing", which
   * at 30px extrabold is far wider than a half-width grid cell, so it ran
   * off the card and the user saw "Establishin". The comment above the
   * value span claimed the layout "gives every realistic value enough
   * room without truncation"; that was true of every realistic NUMBER.
   *
   * "text" drops the numeral treatment rather than shrinking it: mono +
   * tabular-nums exist to align digits and do nothing for letters, and
   * CLAUDE.md scopes that treatment to numeric displays. It also allows
   * wrapping, because a word that does not fit should go to a second line
   * rather than be silently cut in half.
   */
  valueKind?: "number" | "text";
  unit?: string;
  /** The change on the previous range, in grey whichever way it moved:
   *  it was green or red by whether the move suited the goal, which
   *  graded a 1% wobble as a success or a failure (house voice: state
   *  what the data shows). */
  delta?: { value: string; positive: boolean } | null;
  /** Optional small line under the delta, e.g. "target 180g". */
  target?: string;
  sparklineData?: number[];
  accentColor?: string;
  onClick?: () => void;
}

export default function StatCard({
  label,
  value,
  valueKind = "number",
  unit,
  delta,
  target,
  sparklineData,
  accentColor = THEME.brand,
  onClick,
}: StatCardProps) {
  const gradientId = `spark-${label.replace(/\s/g, "-")}`;

  const showSparkline = !!sparklineData && sparklineData.length > 2;
  const Container = onClick ? "button" : "div";

  return (
    <Container
      {...(onClick ? { type: "button" as const } : {})}
      onClick={onClick}
      className={`p-4 rounded-2xl bg-card text-left w-full card-shadow${onClick ? " motion-safe:active:scale-[0.98]" : ""}`}
    >
      <SectionLabel className="mb-2">{label}</SectionLabel>

      {/* Value + unit on their own full-width row. Side-by-side layout
          with the sparkline doesn't fit on phone-sized stat cards once
          the value is more than 3 digits — "2,143 kcal/day" plus a 64px
          sparkline overflows the ~152px content area. Stacking the
          sparkline below as a thin full-width band gives every realistic
          value enough room without truncation. */}
      <div className="flex items-baseline gap-1 min-w-0">
        <span
          className={
            valueKind === "text"
              ? "min-w-0 text-xl font-bold text-foreground leading-tight break-words"
              : "min-w-0 text-3xl font-extrabold font-mono tabular-nums text-foreground leading-none whitespace-nowrap"
          }
        >
          {value}
        </span>
        {/* The unit is secondary to the figure, and at text-caption it
            reads that way against either branch above. `shrink-0` keeps
            it whole: on a narrow card the VALUE should give up width,
            never the unit that makes it meaningful. */}
        {unit && (
          <span className="text-caption text-muted-foreground shrink-0">
            {unit}
          </span>
        )}
      </div>

      {showSparkline && (
        // Sparkline is decorative — no tooltip, no active dot, no
        // cursor. The big number above IS the metric. The sparkline
        // is a glance at the shape of the trend, not an interactive
        // chart. `pointerEvents: none` removes the misleading hover
        // affordance.
        <div
          className="w-full h-5 mt-2 -mx-1"
          style={{ pointerEvents: "none" }}
        >
          <ResponsiveContainer width="100%" height={20}>
            <AreaChart
              data={sparklineData!.map((v, i) => ({ v, i }))}
              margin={{ top: 1, right: 0, bottom: 0, left: 0 }}
              /* The comment above removed the misleading MOUSE affordance
                 and left the keyboard one. Recharts 3 defaults
                 `accessibilityLayer` to true, so each sparkline put a
                 `tabIndex="0"` <svg> in the tab order — measured as four
                 unnamed tab stops on the Analytics tab alone, every one of
                 them announcing nothing, on a graphic this component has
                 already declared decorative. The figure above it is the
                 metric, and it is text. */
              accessibilityLayer={false}
            >
              {/* Without this the axis defaults to [0, dataMax], which
                  pins every series to the top of the band and turns a
                  steady one into a solid slab — Avg pace beside Monthly
                  Distance was the visible case. */}
              <YAxis hide domain={sparklineDomain(sparklineData!)} />
              <ChartAreaGradient id={gradientId} color={accentColor} />
              <Area
                type="monotone"
                dataKey="v"
                stroke={accentColor}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {delta && (
        <p className="text-xs mt-1.5 font-medium flex items-center gap-0.5 text-muted-foreground">
          <span>{delta.positive ? "↑" : "↓"}</span>
          <span>{delta.value} vs last</span>
        </p>
      )}
      {target && (
        <p className="text-caption text-muted-foreground mt-0.5 font-mono tabular-nums">
          {target}
        </p>
      )}
    </Container>
  );
}
