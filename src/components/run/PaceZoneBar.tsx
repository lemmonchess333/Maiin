interface PaceZoneBarProps {
  currentPace: number;
  targetPace: number;
  tolerance: number;
}

export default function PaceZoneBar({ currentPace, targetPace, tolerance }: PaceZoneBarProps) {
  if (currentPace <= 0 || targetPace <= 0) return null;

  const diff = currentPace - targetPace;
  const pct = Math.max(-1, Math.min(1, diff / (tolerance * 2)));

  const color = Math.abs(diff) <= tolerance
    ? 'bg-green-500'
    : diff > 0
      ? 'bg-red-500'
      : 'bg-yellow-500';

  const label = Math.abs(diff) <= tolerance
    ? 'On pace'
    : diff > 0
      ? `+${Math.round(diff)}s slow`
      : `${Math.round(diff)}s fast`;

  return (
    <div className="mx-4 mt-2">
      <div className="flex justify-between text-xs text-white/50 mb-1">
        <span>Fast</span>
        <span className="text-white/70 font-medium">{label}</span>
        <span>Slow</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full relative overflow-hidden">
        <div
          className="absolute top-0 h-full w-3 rounded-full transition-all duration-500"
          style={{ left: `${Math.min(95, Math.max(2, 50 + pct * 48))}%` }}
        >
          <div className={`h-full w-full rounded-full ${color}`} />
        </div>
      </div>
    </div>
  );
}
