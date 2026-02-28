import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell } from 'recharts';
import type { Split } from '../../lib/gps';

interface SplitsBarChartProps {
  splits: Split[];
  avgPaceSeconds: number;
  accentColor?: string;
}

export default function SplitsBarChart({ splits, avgPaceSeconds, accentColor = '#00D4AA' }: SplitsBarChartProps) {
  if (splits.length === 0) return null;

  const maxPace = Math.max(...splits.map(s => s.paceSeconds));
  const data = splits.map(s => ({
    km: `${s.km}`,
    pace: s.paceSeconds,
    invertedPace: maxPace - s.paceSeconds + 60,
    paceLabel: s.pace,
    isFast: s.paceSeconds < avgPaceSeconds * 0.97,
    isSlow: s.paceSeconds > avgPaceSeconds * 1.03,
  }));

  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Splits</h3>
        <p className="text-[10px] text-muted-foreground">
          avg {Math.floor(avgPaceSeconds / 60)}:{(Math.floor(avgPaceSeconds) % 60).toString().padStart(2, '0')}/km
        </p>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} barCategoryGap="20%">
          <XAxis dataKey="km" tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.3 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Bar dataKey="invertedPace" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={accentColor}
                fillOpacity={entry.isFast ? 1 : entry.isSlow ? 0.35 : 0.65} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex justify-around mt-1">
        {data.map((d, i) => (
          <p key={i} className={`text-[10px] font-mono tabular-nums ${
            d.isFast ? 'text-emerald-500' : d.isSlow ? 'text-red-500' : 'text-muted-foreground'
          }`}>
            {d.paceLabel}
          </p>
        ))}
      </div>
    </div>
  );
}
