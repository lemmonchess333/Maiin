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
  onPage = false,
}: {
  accuracy: number | null;
  isTracking: boolean;
  pointCount: number;
  signalQuality: GPSSignalQuality;
  /** On the run setup screen's page rather than the map: the page's own
   *  muted fill, and words for a run not started yet ("GPS ready"). It
   *  announces itself, since the signal arriving is news there. */
  onPage?: boolean;
}) {
  if (!isTracking) return null;
  const quality: GPSSignalQuality =
    pointCount === 0 ? "searching" : signalQuality;
  const { lit, colour } = gpsSignalBars(quality);
  const label =
    quality === "searching"
      ? onPage
        ? "Finding GPS"
        : "Acquiring GPS"
      : quality === "weak"
        ? "Weak GPS"
        : onPage
          ? "GPS ready"
          : "GPS";
  const metres =
    quality === "weak" && accuracy !== null ? Math.round(accuracy) : null;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold",
        onPage ? "bg-muted text-foreground" : "text-white backdrop-blur"
      )}
      style={onPage ? undefined : { background: THEME.scrim }}
      role={onPage ? "status" : undefined}
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
            className={cn(
              "w-[3px] rounded-full",
              onPage && i >= lit && "bg-muted-foreground/40"
            )}
            style={{
              height,
              background:
                i < lit
                  ? colour
                  : onPage
                    ? undefined
                    : "rgba(255,255,255,0.25)",
            }}
          />
        ))}
      </span>
      <span>{label}</span>
      {metres !== null && (
        <span
          className={cn(
            "font-mono font-normal tabular-nums",
            onPage ? "text-muted-foreground" : "text-white/70"
          )}
        >
          {`±${metres} m`}
        </span>
      )}
    </div>
  );
}
