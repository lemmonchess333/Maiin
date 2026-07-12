import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { GPSPoint } from "../../lib/gps";
import { THEME } from "@/lib/theme";
import { CHART_GRID_PROPS } from "./chartStyles";
import ChartAreaGradient from "./ChartAreaGradient";

interface ElevationProfileProps {
  points: GPSPoint[];
  accentColor?: string;
}

export default function ElevationProfile({
  points,
  accentColor = THEME.running,
}: ElevationProfileProps) {
  // Filter FIRST, then derive the decimation stride from the filtered
  // length — the old stride came off the unfiltered array while the
  // modulo ran over the filtered one, skewing the sample. Min/max (the
  // header label and the y-domain) come from ALL altitude points, not
  // the ~200-point render sample, so a short spike that lands between
  // samples can't shrink the stated range. Loop rather than
  // Math.min(...spread): long runs carry thousands of GPS points and a
  // spread that size can overflow the argument stack.
  const withAlt = points.filter((p) => p.altitude != null);
  const stride = Math.max(1, Math.ceil(withAlt.length / 200));
  const data = withAlt
    .filter((_, i) => i % stride === 0)
    .map((p, i) => ({ i, alt: Math.round(p.altitude!) }));

  if (data.length < 3) return null;

  let minAlt = Infinity;
  let maxAlt = -Infinity;
  for (const p of withAlt) {
    const alt = Math.round(p.altitude!);
    if (alt < minAlt) minAlt = alt;
    if (alt > maxAlt) maxAlt = alt;
  }

  return (
    <div className="p-4 rounded-2xl bg-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Elevation</h3>
        <p className="text-xs font-mono tabular-nums text-muted-foreground">
          {minAlt}m – {maxAlt}m
        </p>
      </div>

      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={data}>
          <ChartAreaGradient
            id="elevGrad"
            color={accentColor}
            topOpacity={0.4}
            bottomOpacity={0.02}
          />
          <CartesianGrid {...CHART_GRID_PROPS} />
          <YAxis hide domain={[minAlt - 5, maxAlt + 5]} />
          <XAxis hide />
          <Area
            type="monotone"
            dataKey="alt"
            stroke={accentColor}
            strokeWidth={2}
            fill="url(#elevGrad)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
