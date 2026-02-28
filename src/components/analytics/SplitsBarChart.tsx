import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell } from 'recharts';
import type { Split } from '../../lib/gps';

interface SplitsBarChartProps {
  splits: Split[];
  avgPaceSeconds: number;
  accentColor?: string;
}

export default function SplitsBarChart({ splits, avgPaceSeconds, accentColor = '#00D4AA' }: SplitsBarChartProps) {
  if (splits.length === 0) return null;

  const maxPace = Math.max(...splits.map((s) => s.paceSeconds));
  const data = splits.map((s) => ({
    km: `${s.km}`,
    invertedPace: maxPace - s.paceSeconds + 60,
    paceLabel: s.pace,
    isFast: s.paceSeconds < avgPaceSeconds * 0.97,
    isSlow: s.paceSeconds > avgPaceSeconds * 1.03,
  }));

  return (
    <div className="p-4 rounded-2xl bg-[#1C1C24] border border-white/5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Splits</h3>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} barCategoryGap="20%">
          <XAxis dataKey="km" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Bar dataKey="invertedPace" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={accentColor} fillOpacity={entry.isFast ? 1 : entry.isSlow ? 0.35 : 0.65} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex justify-around mt-1">
        {data.map((d, i) => (
          <p key={i} className={`text-[10px] font-mono tabular-nums ${d.isFast ? 'text-emerald-400' : d.isSlow ? 'text-red-400' : 'text-white/40'}`}>
            {d.paceLabel}
          </p>
        ))}
      </div>
    </div>
  );
}
