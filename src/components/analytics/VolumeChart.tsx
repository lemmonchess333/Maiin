import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';

interface VolumeChartProps {
  data: { week: string; volume: number }[];
  accentColor?: string;
}

export default function VolumeChart({ data, accentColor = '#6C7CFF' }: VolumeChartProps) {
  if (data.length === 0) return null;

  return (
    <div className="p-4 rounded-2xl bg-[#1C1C24] border border-white/5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Weekly Volume</h3>
        <p className="text-[10px] text-white/30">kg lifted</p>
      </div>

      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.25)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${new Date(v).getDate()}/${new Date(v).getMonth() + 1}`}
          />
          <YAxis
            tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.2)' }}
            axisLine={false}
            tickLine={false}
            width={35}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
          />
          <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={accentColor} fillOpacity={i === data.length - 1 ? 1 : 0.5} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
