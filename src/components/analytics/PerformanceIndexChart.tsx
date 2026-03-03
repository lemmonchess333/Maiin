// src/components/analytics/PerformanceIndexChart.tsx
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
} from "recharts";
import type { PerformanceWeekDoc } from "@/lib/performanceTypes";
import { THEME } from "@/lib/theme";

interface Props {
  weeks: PerformanceWeekDoc[];
}

export default function PerformanceIndexChart({ weeks }: Props) {
  const data = weeks.map((d) => ({
    week: d.weekKey,
    pi: d.performanceIndex,
    liftLoad: d.breakdown.liftLoadScore,
    runLoad: d.breakdown.runLoadScore,
    recovery: d.breakdown.recoveryScore,
    band: d.labels?.loadBand || d.loadBand,
  }));

  if (data.length === 0) return null;

  const bandColor = (band: string) => {
    switch (band) {
      case "overreach":
        return THEME.danger;
      case "high":
        return THEME.warning;
      case "moderate":
        return THEME.brand;
      case "low":
        return THEME.teal;
      default:
        return THEME.textMuted;
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Performance Index</h3>
        <span className="text-[10px] text-muted-foreground">0–100 · last {data.length}w</span>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id="pi-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={THEME.brand} stopOpacity={0.35} />
              <stop offset="100%" stopColor={THEME.brand} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />

          {/* Zone reference lines */}
          <ReferenceLine y={70} stroke={THEME.warning} strokeDasharray="4 4" strokeOpacity={0.4} />
          <ReferenceLine y={85} stroke={THEME.danger} strokeDasharray="4 4" strokeOpacity={0.4} />

          <XAxis
            dataKey="week"
            tick={{ fontSize: 9, fill: "currentColor", opacity: 0.3 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: any) => {
              const s = typeof v === "string" ? v : String(v ?? "");
              const d = new Date(s + "T00:00:00");
              if (Number.isNaN(d.getTime())) return "";
              return `${d.getDate()}/${d.getMonth() + 1}`;
            }}
          />

          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fontSize: 9, fill: "currentColor", opacity: 0.2 }}
            axisLine={false}
            tickLine={false}
            width={28}
          />

          <Tooltip
            contentStyle={{
              background: THEME.chartTooltipBg,
              border: "none",
              borderRadius: 12,
              fontSize: 11,
              color: THEME.textPrimary,
              padding: "8px 12px",
            }}
            labelFormatter={(label: any) => {
              const s = typeof label === "string" ? label : String(label ?? "");
              const d = new Date(s + "T00:00:00");
              if (Number.isNaN(d.getTime())) return "";
              return `Week of ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
            }}
            formatter={(value: any, name: any) => {
              const labels: Record<string, string> = {
                pi: "PI",
                liftLoad: "Lift Load",
                runLoad: "Run Load",
                recovery: "Recovery",
              };

              const n = typeof name === "string" ? name : String(name ?? "");
              const v = typeof value === "number" ? value : Number(value ?? 0);

              return [v, labels[n] || n] as [number, string];
            }}
          />

          <Area
            type="monotone"
            dataKey="pi"
            stroke={THEME.brand}
            strokeWidth={2.5}
            fill="url(#pi-gradient)"
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              return (
                <circle
                  key={payload.week}
                  cx={cx}
                  cy={cy}
                  r={3.5}
                  fill={bandColor(payload.band)}
                  stroke={THEME.surface}
                  strokeWidth={1.5}
                />
              );
            }}
            activeDot={{ r: 5, stroke: THEME.brand, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Zone legend */}
      <div className="flex items-center justify-center gap-4 mt-2">
        {[
          { label: "Deload", color: THEME.textMuted },
          { label: "Low", color: THEME.teal },
          { label: "Moderate", color: THEME.brand },
          { label: "High", color: THEME.warning },
          { label: "Overreach", color: THEME.danger },
        ].map((z) => (
          <div key={z.label} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: z.color }} />
            <span className="text-[9px] text-muted-foreground">{z.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
