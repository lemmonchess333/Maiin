import { THEME } from "@/lib/theme";

interface PaceZoneBarProps {
  currentPace: number;
  targetPace: number;
  tolerance: number;
}

export default function PaceZoneBar({
  currentPace,
  targetPace,
  tolerance,
}: PaceZoneBarProps) {
  if (currentPace <= 0 || targetPace <= 0) return null;

  const diff = currentPace - targetPace;
  const pct = Math.max(-1, Math.min(1, diff / (tolerance * 2)));

  // Token identities, not raw Tailwind palette (green-500 drifted from
  // THEME.success; the guardrail test bans the class form). Bar fills on
  // the dark run surface — decorative data-viz, identities are correct.
  const color =
    Math.abs(diff) <= tolerance
      ? THEME.success
      : diff > 0
        ? THEME.danger
        : THEME.amberLight;

  const label =
    Math.abs(diff) <= tolerance
      ? "On pace"
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
          <div
            className="size-full rounded-full"
            style={{ background: color }}
          />
        </div>
      </div>
    </div>
  );
}
