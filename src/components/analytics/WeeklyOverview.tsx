import { THEME } from '@/lib/theme';

interface WeeklyOverviewProps {
  runCount: number;
  runDistance: number;
  liftCount: number;
  liftVolume: number;
  caloriesBurned: number;
  nutritionAdherence: number;
}

export default function WeeklyOverview({
  runCount, runDistance, liftCount, liftVolume, caloriesBurned, nutritionAdherence,
}: WeeklyOverviewProps) {
  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">This Week</p>

      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <div className="w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-1"
            style={{ backgroundColor: `${THEME.running}15` }}>
            <span className="text-lg">&#127939;</span>
          </div>
          <p className="text-lg font-bold font-mono tabular-nums text-foreground">{runCount}</p>
          <p className="text-[9px] text-muted-foreground">{runDistance.toFixed(1)} km</p>
        </div>

        <div className="text-center">
          <div className="w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-1"
            style={{ backgroundColor: `${THEME.lifting}15` }}>
            <span className="text-lg">&#127947;&#65039;</span>
          </div>
          <p className="text-lg font-bold font-mono tabular-nums text-foreground">{liftCount}</p>
          <p className="text-[9px] text-muted-foreground">{(liftVolume/1000).toFixed(1)}t volume</p>
        </div>

        <div className="text-center">
          <div className="w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-1"
            style={{ backgroundColor: `${THEME.success}15` }}>
            <span className="text-lg">&#127869;&#65039;</span>
          </div>
          <p className="text-lg font-bold font-mono tabular-nums text-foreground">{nutritionAdherence}%</p>
          <p className="text-[9px] text-muted-foreground">macro adherence</p>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground text-center mt-3 pt-3 border-t border-border/30">
        {runCount + liftCount} sessions &middot; {caloriesBurned.toLocaleString()} cal burned
      </p>
    </div>
  );
}
