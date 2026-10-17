import type { GPSSignalQuality } from "@/hooks/useGPS";
import { gpsSignalBars } from "@/lib/gpsSignal";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Four bars of one width, rising evenly to the chip's 12px line. */
const BAR_HEIGHTS = [3, 6, 9, 12] as const;

/**
 * The live run map's GPS chip, top left: four bars and a word, on the
 * dark pill the route chip beside it uses.
 *
 * It was four bars of three widths with the fix's accuracy beside them in
 * the signal's colour, on nothing: a weak fix read as a red "±52 m"
 * floating on the map, and in the light theme that red was a dark one the
 * dark map all but swallowed. Now the bars carry the colour, the word says
 * what it means, and the accuracy shows only beside a warning, where it is
 * the reason for it.
 *
 * The buckets are useGPS's; the bars are the waiting screen's
 * (`gpsSignalBars`).
 */
export default function GpsSignalChip({
  accuracy,
  isTracking,
  pointCount,
  signalQuality,
}: {
  accuracy: number | null;
  isTracking: boolean;
  pointCount: number;
  signalQuality: GPSSignalQuality;
}) {
  if (!isTracking) return null;
  const quality: GPSSignalQuality =
    pointCount === 0 ? "searching" : signalQuality;
  const { lit, colour } = gpsSignalBars(quality);
  const label =
    quality === "searching"
      ? "Acquiring GPS"
      : quality === "weak"
        ? "Weak GPS"
        : "GPS";
  const metres =
    quality === "weak" && accuracy !== null ? Math.round(accuracy) : null;

  return (
    <div
      className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold text-white backdrop-blur"
      style={{ background: THEME.scrim }}
      data-quality={quality}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-3 items-end gap-0.5",
          quality === "searching" && "motion-safe:animate-pulse"
        )}
      >
        {BAR_HEIGHTS.map((height, i) => (
          <span
            key={height}
            data-lit={i < lit}
            className="w-[3px] rounded-full"
            style={{
              height,
              background: i < lit ? colour : "rgba(255,255,255,0.25)",
            }}
          />
        ))}
      </span>
      <span>{label}</span>
      {metres !== null && (
        <span className="font-mono font-normal tabular-nums text-white/70">
          {`±${metres} m`}
        </span>
      )}
    </div>
  );
}
