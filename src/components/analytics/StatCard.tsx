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
      className="p-4 rounded-2xl bg-card border border-border/50 text-left w-full transition-colors hover:bg-muted/50">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-2xl font-bold font-mono tabular-nums text-foreground">{value}</span>
          {unit && <span className="text-sm text-muted-foreground ml-1">{unit}</span>}
          {delta && (
            <p className={`text-[10px] mt-0.5 font-medium ${delta.positive ? 'text-emerald-500' : 'text-red-500'}`}>
              {delta.positive ? '\u2191' : '\u2193'} {delta.value} vs last period
            </p>
          )}
        </div>
        {sparklineData && sparklineData.length > 2 && (
          <div className="w-16 h-8">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData.map((v, i) => ({ v, i }))}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accentColor} stopOpacity={0.3} />
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
