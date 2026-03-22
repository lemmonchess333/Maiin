import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';

interface VolumeChartProps {
  data: { week: string; volume: number }[];
  accentColor?: string;
}

export default function VolumeChart({ data, accentColor = '#6C7CFF' }: VolumeChartProps) {
  if (data.length === 0) return null;

  return (
    <div className="p-4 rounded-2xl bg-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Weekly Volume</h3>
        <p className="text-[11px] text-muted-foreground">kg lifted</p>
      </div>

      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.3 }}
            axisLine={false} tickLine={false}
            tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth()+1}`; }} />
          <YAxis tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.2 }} axisLine={false} tickLine={false} width={35}
            tickFormatter={(v) => Number(v) >= 1000 ? `${(Number(v)/1000).toFixed(0)}k` : String(v)} />
          <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={accentColor}
                fillOpacity={i === data.length - 1 ? 1 : 0.5} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
