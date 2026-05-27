import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { track as trackHistoryEvent } from "@/lib/historyAnalytics";
import { THEME } from "@/lib/theme";

interface MacroDistributionProps {
  protein: number;
  carbs: number;
  fat: number;
}

/* Hist5f S2 + P3: Tooltip matches PerformanceIndexChart + VolumeChart's
   style (THEME.chartTooltipBg). Reference style per Hist5f-P3 so the
   three Analytics charts read as a coherent set. */
const TOOLTIP_STYLE = {
  background: THEME.chartTooltipBg,
  border: "none" as const,
  borderRadius: 12,
  fontSize: 12,
  color: THEME.textPrimary,
  padding: "8px 12px",
};

// Average daily macro split as a donut. Reads calories-by-macro, not
// grams-by-macro, because what users care about is "how much of my
// plate is fat vs carbs" — not the absolute gram counts the stat cards
// above already show.
//
// Conversion uses the standard Atwater factors: 4 cal/g protein and
// carbs, 9 cal/g fat. A 30g fat day makes up a bigger share of daily
// energy than a 30g protein day and the donut should reflect that.
export default function MacroDistribution({
  protein,
  carbs,
  fat,
}: MacroDistributionProps) {
  const pCal = protein * 4;
  const cCal = carbs * 4;
  const fCal = fat * 9;
  const total = pCal + cCal + fCal;

  if (total === 0) return null;

  const data = [
    {
      name: "Protein",
      value: pCal,
      color: THEME.macros.protein,
      grams: protein,
    },
    { name: "Carbs", value: cCal, color: THEME.macros.carbs, grams: carbs },
    { name: "Fat", value: fCal, color: THEME.macros.fat, grams: fat },
  ];

  const pct = (v: number) => Math.round((v / total) * 100);

  return (
    <div
      className="p-4 rounded-2xl bg-card"
      style={{ boxShadow: "var(--ds-shadow-card)" }}
    >
      <p className="text-xs uppercase tracking-wider font-medium mb-3 text-muted-foreground">
        Macro Distribution
      </p>
      <div className="flex items-center gap-4">
        {/* Donut is decorative re: VoiceOver — the legend below it
            already announces the same percentages + grams as text.
            aria-hidden on the chart container prevents the screen
            reader from reading "image" twice. */}
        <div className="w-24 h-24 shrink-0 relative" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              {/* Hist5f S2 + P3: tooltip matches the other two
                  Analytics charts. Shows "Protein · 38% (120g)" on
                  hover/touch — the same info the legend below
                  carries, surfaced at the slice for users reading
                  the donut directly. */}
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(_value, _name, item) => {
                  const p = item?.payload as
                    | { name: string; value: number; grams: number }
                    | undefined;
                  if (!p) return ["", ""];
                  const sharePct = Math.round((p.value / total) * 100);
                  return [`${sharePct}% · ${p.grams}g`, p.name] as [
                    string,
                    string,
                  ];
                }}
              />
              <Pie
                data={data}
                dataKey="value"
                innerRadius={28}
                outerRadius={44}
                startAngle={90}
                endAngle={-270}
                stroke="none"
                isAnimationActive={false}
                /* Hist5f S1 + P4: tap-attempt telemetry. Fires on
                   slice click with the macro name as binKey + the
                   calorie-share % as value. P6 honoured — a slice
                   with value === 0 is render-suppressed by
                   Recharts already, but guard explicitly so the
                   handler reads cleanly. */
                onClick={(entry) => {
                  const e = entry as
                    | { name?: string; value?: number }
                    | undefined;
                  if (!e || !e.value || e.value === 0) return;
                  trackHistoryEvent("history_chart_tap_attempted", {
                    chart: "macro",
                    binKey: e.name ?? "",
                    value: Math.round((e.value / total) * 100),
                  });
                }}
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-xs font-mono tabular-nums text-muted-foreground">
              avg
            </p>
          </div>
        </div>
        <div className="flex-1 space-y-1.5">
          {data.map((d) => (
            <div
              key={d.name}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: d.color }}
                  aria-hidden="true"
                />
                <span className="text-foreground font-medium">{d.name}</span>
              </div>
              <span className="font-mono tabular-nums text-muted-foreground">
                {pct(d.value)}% · {d.grams}g
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
