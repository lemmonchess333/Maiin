import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { THEME } from '@/lib/theme';

interface PaceChartProps {
  data: { label: string; paceSeconds: number }[];
  accentColor?: string;
}

export default function PaceChart({ data, accentColor }: PaceChartProps) {
  if (!data.length) return null;

  const lineColor = accentColor || THEME.running;

  return (
    <div className="p-4 rounded-2xl bg-card border border-border">
      <h3 className="text-sm font-semibold text-foreground mb-3">Pace Trend</h3>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={THEME.chartGrid} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: THEME.textSecondary }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Line type="monotone" dataKey="paceSeconds" stroke={lineColor} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
