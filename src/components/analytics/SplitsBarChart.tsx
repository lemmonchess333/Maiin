import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import type { Split } from "../../lib/gps";
import { paceLabel, paceMinSec } from "../../lib/runLabels";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { distanceUnitLabel, type DistanceUnit } from "@/lib/distanceUnits";
import { THEME } from "@/lib/theme";
import { CHART_AXIS_TICK } from "./chartStyles";

interface SplitsBarChartProps {
  splits: Split[];
  avgPaceSeconds: number;
  accentColor?: string;
  /**
   * The unit these ROWS are cut on, which is not always the reader's.
   *
   * A saved run stores kilometre laps, and a run with no GPS trace
   * (treadmill, manual) can only ever offer those — so an imperial reader
   * looking at one gets kilometre rows, labelled as such rather than
   * silently relabelled. Where the trace exists the caller recomputes mile
   * laps and passes "mi".
   *
   * The PACES are unaffected either way: a pace is a rate, so it converts
   * to the reader's unit independently of how long the lap was.
   */
  lapUnit: DistanceUnit;
}

export default function SplitsBarChart({
  splits,
  avgPaceSeconds,
  accentColor = THEME.teal,
  lapUnit,
}: SplitsBarChartProps) {
  const unit = useDistanceUnit();
  if (splits.length === 0) return null;

  const maxPace = Math.max(...splits.map((s) => s.paceSeconds));
  const data = splits.map((s) => ({
    km: `${s.km}`,
    pace: s.paceSeconds,
    invertedPace: maxPace - s.paceSeconds + 60,
    /* From `paceSeconds` (always sec/km) rather than the `pace` STRING the
       split carries: that string is baked per-kilometre at save time and
       cannot be converted, which is exactly why it isn't read here. */
    paceLabel: paceMinSec(s.paceSeconds, unit),
    isFast: s.paceSeconds < avgPaceSeconds * 0.97,
    isSlow: s.paceSeconds > avgPaceSeconds * 1.03,
  }));

  return (
    <div className="p-4 rounded-2xl bg-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">
          Splits
          {lapUnit === unit ? "" : ` (per ${distanceUnitLabel(lapUnit)})`}
        </h3>
        <p className="text-xs font-mono tabular-nums text-muted-foreground">
          avg {paceLabel(avgPaceSeconds, unit)}
        </p>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} barCategoryGap="20%">
          <XAxis
            dataKey="km"
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Bar dataKey="invertedPace" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={accentColor}
                fillOpacity={entry.isFast ? 1 : entry.isSlow ? 0.35 : 0.65}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex justify-around mt-1">
        {data.map((d, i) => (
          <p
            key={i}
            className={`text-xs font-mono tabular-nums ${
              d.isFast
                ? "text-success-strong"
                : d.isSlow
                  ? "text-destructive-strong"
                  : "text-muted-foreground"
            }`}
          >
            {d.paceLabel}
          </p>
        ))}
      </div>
    </div>
  );
}
