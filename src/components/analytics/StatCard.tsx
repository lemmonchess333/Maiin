import { ResponsiveContainer, AreaChart, Area } from 'recharts';

interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  delta?: { value: string; positive: boolean } | null;
  sparklineData?: number[];
  accentColor?: string;
  onClick?: () => void;
}

export default function StatCard({
  label, value, unit, delta, sparklineData, accentColor = '#8b5cf6', onClick,
}: StatCardProps) {
  const gradientId = `spark-${label.replace(/\s/g, '-')}`;
  return (
    <button onClick={onClick}
      className="p-4 rounded-2xl bg-card text-left w-full active:scale-[0.98] transition-transform"
      style={{ background: `linear-gradient(135deg, ${accentColor}08 0%, transparent 70%)` }}>
      <p className="text-[10px] uppercase tracking-[0.5px] font-medium mb-2" style={{ color: '#8E8E93' }}>{label}</p>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-[28px] font-extrabold font-mono tabular-nums text-foreground leading-none">{value}</span>
            {unit && <span className="text-[13px]" style={{ color: '#8E8E93' }}>{unit}</span>}
          </div>
          {delta && (
            <p className={`text-[10px] mt-1 font-medium flex items-center gap-0.5 ${delta.positive ? 'text-emerald-500' : 'text-red-400'}`}>
              <span>{delta.positive ? '↑' : '↓'}</span>
              <span>{delta.value} vs last</span>
            </p>
          )}
        </div>
        {sparklineData && sparklineData.length > 2 && (
          <div className="w-16 h-9 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData.map((v, i) => ({ v, i }))}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accentColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={accentColor} strokeWidth={1.5}
                  fill={`url(#${gradientId})`} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </button>
  );
}