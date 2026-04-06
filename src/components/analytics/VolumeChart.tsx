import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';

interface VolumeChartProps {
  data: { week: string; volume: number }[];
  accentColor?: string;
}

export default function VolumeChart({ data, accentColor = '#6B74E0' }: VolumeChartProps) {
  return (
    <div className="p-4 rounded-2xl bg-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Weekly Volume</h3>
        <p className="text-xs text-muted-foreground">kg lifted</p>
      </div>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[140px] gap-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${accentColor}15` }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/></svg>
          </div>
          <p className="text-xs text-muted-foreground">Complete workouts to see your volume trend</p>
        </div>
      ) : (
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.3 }}
            axisLine={false} tickLine={false}
            tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth()+1}`; }} />
          <YAxis tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.2 }} axisLine={false} tickLine={false} width={35}
            tickFormatter={(v) => Number(v) >= 1000 ? `${(Number(v)/1000).toFixed(0)}k` : String(v)} />
          <Bar dataKey="volume" radius={[4, 4, 0, 0]} minPointSize={2}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.volume === 0 ? "var(--border)" : accentColor}
                fillOpacity={entry.volume === 0 ? 0.4 : i === data.length - 1 ? 1 : 0.5} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      )}
    </div>
  );
}
