import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { GPSPoint } from '../../lib/gps';

interface ElevationProfileProps {
  points: GPSPoint[];
  accentColor?: string;
}

export default function ElevationProfile({ points, accentColor = '#FF6B6B' }: ElevationProfileProps) {
  const data = points
    .filter((p) => p.altitude != null)
    .filter((_, i) => i % Math.max(1, Math.ceil(points.length / 200)) === 0)
    .map((p, i) => ({ i, alt: Math.round(p.altitude!) }));

  if (data.length < 3) return null;

  const minAlt = Math.min(...data.map((d) => d.alt));
  const maxAlt = Math.max(...data.map((d) => d.alt));

  return (
    <div className="p-4 rounded-2xl bg-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Elevation</h3>
        <p className="text-[11px] text-muted-foreground">
          {minAlt}m – {maxAlt}m
        </p>
      </div>

      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentColor} stopOpacity={0.4} />
              <stop offset="100%" stopColor={accentColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <YAxis hide domain={[minAlt - 5, maxAlt + 5]} />
          <XAxis hide />
          <Area type="monotone" dataKey="alt" stroke={accentColor} strokeWidth={2}
            fill="url(#elevGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
