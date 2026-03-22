import { THEME } from '@/lib/theme';
import { Footprints, Dumbbell, UtensilsCrossed } from 'lucide-react';
import { formatVolumeSub } from '@/utils/formatters';

interface WeeklyOverviewProps {
  runCount: number;
  runDistance: number;
  liftCount: number;
  liftVolume: number;
  caloriesBurned: number;
  nutritionAdherence: number;
}

function Ring({ value, max, color, size = 44 }: { value: number; max: number; color: string; size?: number }) {
  const r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / Math.max(max, 1), 1);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`${color}18`} strokeWidth="4" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round" />
    </svg>
  );
}

export default function WeeklyOverview({
  runCount, runDistance, liftCount, liftVolume, caloriesBurned, nutritionAdherence,
}: WeeklyOverviewProps) {
  const stats = [
    {
      icon: <Footprints className="w-4 h-4" style={{ color: THEME.running }} />,
      label: 'Runs', value: runCount, sub: `${runDistance.toFixed(1)} km`,
      color: THEME.running, ringVal: runCount, ringMax: 5,
    },
    {
      icon: <Dumbbell className="w-4 h-4" style={{ color: THEME.lifting }} />,
      label: 'Sessions', value: liftCount, sub: formatVolumeSub(liftVolume),
      color: THEME.lifting, ringVal: liftCount, ringMax: 5,
    },
    {
      icon: <UtensilsCrossed className="w-4 h-4" style={{ color: THEME.semantic.nutrition }} />,
      label: 'Adherence', value: `${nutritionAdherence}%`, sub: `${caloriesBurned.toLocaleString()} cal`,
      color: THEME.semantic.nutrition, ringVal: nutritionAdherence, ringMax: 100,
    },
  ];

  return (
    <div className="p-4 rounded-2xl bg-card">
      <p className="text-[11px] uppercase tracking-[0.5px] font-medium mb-4 text-muted-foreground">This Week</p>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-2">
            <div className="relative">
              <Ring value={s.ringVal} max={s.ringMax} color={s.color} />
              <div className="absolute inset-0 flex items-center justify-center">
                {s.icon}
              </div>
            </div>
            <div className="text-center">
              <p className="text-base font-bold font-mono tabular-nums text-foreground leading-none">{s.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}