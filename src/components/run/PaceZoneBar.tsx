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

  /* The bar is the pace scale, light to dark from fast to slow
     (`THEME.pace`, DS10 call 2): the band either side of the target is the
     average's amber, and the marker is white with its words above it, so
     "slow" is a word and a place, never the clock's running coral. */
  // The marker sits at 50 + pct x 48 per cent, and the tolerance is half
  // of pct's range, so the target's band reaches 24 per cent either side.
  const band = 24;
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
        <div aria-hidden="true" className="absolute inset-0 flex opacity-70">
          <div
            className="h-full"
            style={{ width: `${50 - band}%`, background: THEME.pace.fast }}
          />
          <div
            className="h-full"
            style={{ width: `${band * 2}%`, background: THEME.pace.average }}
          />
          <div
            className="h-full flex-1"
            style={{ background: THEME.pace.slow }}
          />
        </div>
        {/* A full-width layer slid by the marker's place, the marker at its
            left edge: a translate is a percentage of the layer, so of the
            track, where animating `left` laid out every frame. */}
        <div
          className="absolute inset-0 transition-transform duration-500"
          style={{
            transform: `translateX(${Math.min(95, Math.max(2, 50 + pct * 48))}%)`,
          }}
        >
          <div className="absolute top-0 left-0 h-full w-3 rounded-full">
            <div
              // eslint-disable-next-line no-restricted-syntax -- the marker sits on the run's always-dark stage; white is the neutral there in both themes.
              className="size-full rounded-full bg-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.6)]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
