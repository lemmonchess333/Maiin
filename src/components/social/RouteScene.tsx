/**
 * RouteScene — the run card's hero art (Social uplift v1, 2026-07-11;
 * extracted move-only in Spc1 PR3 so space posts with attached runs
 * reuse the exact same art as the feed's ActivityCard).
 *
 * Draws a GPS preview as layered STATIC strokes (wide soft underglow →
 * mid bloom → crisp core; opacity layering only, never a blur filter —
 * the WKWebView glow rule) plus start/finish markers. The trace sits
 * in the upper band of the viewBox so a caller's overlaid distance
 * numeral has clear ground bottom-left.
 */
import { THEME } from "../../lib/theme";

export default function RouteScene({
  preview,
}: {
  preview: { lat: number; lon: number }[];
}) {
  const lats = preview.map((p) => p.lat);
  const lons = preview.map((p) => p.lon);
  const minLat = Math.min(...lats),
    maxLat = Math.max(...lats);
  const minLon = Math.min(...lons),
    maxLon = Math.max(...lons);
  const rLat = maxLat - minLat || 0.001;
  const rLon = maxLon - minLon || 0.001;
  const toXY = (p: { lat: number; lon: number }): [number, number] => [
    ((p.lon - minLon) / rLon) * 180 + 10,
    (1 - (p.lat - minLat) / rLat) * 46 + 8,
  ];
  const pts = preview.map((p) => toXY(p).join(",")).join(" ");
  const [sx, sy] = toXY(preview[0]);
  const [fx, fy] = toXY(preview[preview.length - 1]);
  const layers: { w: number; o: number }[] = [
    { w: 7, o: 0.16 },
    { w: 4, o: 0.35 },
    { w: 2, o: 1 },
  ];
  return (
    <svg
      viewBox="0 0 200 92"
      className="size-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Run route map"
    >
      {layers.map(({ w, o }) => (
        <polyline
          key={w}
          fill="none"
          stroke={THEME.running}
          strokeOpacity={o}
          strokeWidth={w}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={pts}
        />
      ))}
      {/* Start = hollow ring, finish = solid dot (Strava's grammar —
          readable without a legend). */}
      <circle
        cx={sx}
        cy={sy}
        r="3.2"
        fill="var(--color-card)"
        stroke={THEME.running}
        strokeWidth="1.6"
      />
      <circle
        cx={fx}
        cy={fy}
        r="2.8"
        fill={THEME.running}
        stroke="var(--color-card)"
        strokeWidth="1.2"
      />
    </svg>
  );
}
