interface WeeklyOverviewProps {
  runCount: number;
  runDistance: number;
  liftCount: number;
  liftVolume: number;
  caloriesBurned: number;
  nutritionAdherence: number;
}

export default function WeeklyOverview({
  runCount,
  runDistance,
  liftCount,
  liftVolume,
  caloriesBurned,
  nutritionAdherence,
}: WeeklyOverviewProps) {
  return (
    <div className="p-4 rounded-2xl bg-[#1C1C24] border border-white/5">
      <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">This Week</p>

      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <div className="w-10 h-10 mx-auto rounded-full bg-[#FF6B6B]/10 flex items-center justify-center mb-1">
            <span className="text-lg">🏃</span>
          </div>
          <p className="text-lg font-bold font-mono tabular-nums text-white">{runCount}</p>
          <p className="text-[9px] text-white/25">{runDistance.toFixed(1)} km</p>
        </div>

        <div className="text-center">
          <div className="w-10 h-10 mx-auto rounded-full bg-[#6C7CFF]/10 flex items-center justify-center mb-1">
            <span className="text-lg">🏋️</span>
          </div>
          <p className="text-lg font-bold font-mono tabular-nums text-white">{liftCount}</p>
          <p className="text-[9px] text-white/25">{(liftVolume / 1000).toFixed(1)}t volume</p>
        </div>

        <div className="text-center">
          <div className="w-10 h-10 mx-auto rounded-full bg-[#34D399]/10 flex items-center justify-center mb-1">
            <span className="text-lg">🍽️</span>
          </div>
          <p className="text-lg font-bold font-mono tabular-nums text-white">{nutritionAdherence}%</p>
          <p className="text-[9px] text-white/25">macro adherence</p>
        </div>
      </div>

      <p className="text-[10px] text-white/25 text-center mt-3 pt-3 border-t border-white/5">
        {runCount + liftCount} sessions · {caloriesBurned.toLocaleString()} cal burned
      </p>
    </div>
  );
}
