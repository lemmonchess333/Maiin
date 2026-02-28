import { useRunningStats } from '../../hooks/useRunningStats';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

export default function RunningHistorySection() {
  const { weeklyData, loading } = useRunningStats(90);

  if (loading) return <p className="text-xs text-muted-foreground animate-pulse">Loading running data...</p>;
  if (weeklyData.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold flex items-center gap-2">🏃 Running</h3>

      <div className="p-4 rounded-2xl bg-card border border-border">
        <p className="text-xs text-muted-foreground mb-3">Weekly Distance (km)</p>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={30} />
            <Bar dataKey="totalDistance" fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {weeklyData.some(w => w.avgPace > 0) && (
        <div className="p-4 rounded-2xl bg-card border border-border">
          <p className="text-xs text-muted-foreground mb-3">Average Pace Trend</p>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={weeklyData.filter(w => w.avgPace > 0)}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={40} reversed domain={['auto', 'auto']}
                tickFormatter={(v: number) => {
                  const m = Math.floor(v / 60);
                  const s = Math.floor(v % 60);
                  return `${m}:${s.toString().padStart(2, '0')}`;
                }} />
              <Line type="monotone" dataKey="avgPace" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: '#8b5cf6' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 rounded-xl bg-card border border-border text-center">
          <p className="text-lg font-bold font-mono tabular-nums text-orange-500">
            {weeklyData.reduce((s, w) => s + w.totalDistance, 0).toFixed(1)}
          </p>
          <p className="text-[10px] text-muted-foreground">total km</p>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border text-center">
          <p className="text-lg font-bold font-mono tabular-nums">
            {weeklyData.reduce((s, w) => s + w.runCount, 0)}
          </p>
          <p className="text-[10px] text-muted-foreground">total runs</p>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border text-center">
          <p className="text-lg font-bold font-mono tabular-nums text-purple-500">
            {(() => {
              const paces = weeklyData.filter(w => w.avgPace > 0).map(w => w.avgPace);
              if (paces.length === 0) return '--:--';
              const best = Math.min(...paces);
              return `${Math.floor(best / 60)}:${(Math.floor(best) % 60).toString().padStart(2, '0')}`;
            })()}
          </p>
          <p className="text-[10px] text-muted-foreground">best pace</p>
        </div>
      </div>
    </div>
  );
}
