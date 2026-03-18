import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

interface PaceChartProps {
  data: { label: string; paceSeconds: number }[];
  accentColor?: string;
}

export default function PaceChart({ data, accentColor = '#FF6B6B' }: PaceChartProps) {
  if (!data.length) return null;

  return (
    <div className="p-4 rounded-2xl bg-[#1C1C24] border border-white/5">
      <h3 className="text-sm font-semibold text-white mb-3">Pace Trend</h3>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.25)' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Line type="monotone" dataKey="paceSeconds" stroke={accentColor} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
