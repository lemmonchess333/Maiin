/**
 * RouteScene — the run card's hero art (Social uplift v1, 2026-07-11;
 * extracted move-only in Spc1 PR3 so space posts with attached runs
 * reuse the exact same art as the feed's ActivityCard).
 *
 * Draws a GPS preview as layered STATIC strokes (wide soft underglow →
 * mid bloom → crisp core; opacity layering only, never a blur filter —
 * the WKWebView glow rule) plus start/finish markers.
 *
 * A caller's numbers (the distance numeral, a pace) go in `footer`, a row
 * of its own under the drawing, never laid over it. Laid over it, they
 * met the route: the drawing scales to fit its box while the numeral
 * grows with the text size, and the ground the drawing left for it in its
 * own units was not where the numeral was. A route that started
 * bottom-left drew its start ring on the number (`routeSceneGeometry.ts`).
 */
import type { ReactNode } from "react";
import type { RouteCoordinate } from "@/lib/routeSegments";
import {
  ROUTE_SCENE_VIEWBOX,
  routeSceneGeometry,
} from "@/lib/routeSceneGeometry";
import { THEME } from "../../lib/theme";

export default function RouteScene({
  preview,
  footer,
}: {
  preview: RouteCoordinate[];
  /** What the card says beside the art, in a row under the drawing. */
  footer?: ReactNode;
}) {
  const { paths, start, finish } = routeSceneGeometry(preview);
  const [sx, sy] = start;
  const [fx, fy] = finish;
  const layers: { w: number; o: number }[] = [
    { w: 7, o: 0.16 },
    { w: 4, o: 0.35 },
    { w: 2, o: 1 },
  ];
  return (
    <div className="flex size-full flex-col">
      {/* The drawing takes what the footer leaves. Absolutely placed in
          its band so its own aspect ratio never sets the band's height. */}
      <div className="relative min-h-0 flex-1">
        <svg
          viewBox={`0 0 ${ROUTE_SCENE_VIEWBOX.width} ${ROUTE_SCENE_VIEWBOX.height}`}
          className="absolute inset-0 size-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Run route map"
        >
          {layers.flatMap(({ w, o }) =>
            paths.map((pts, index) => (
              <polyline
                key={`${w}-${index}`}
                fill="none"
                stroke={THEME.running}
                strokeOpacity={o}
                strokeWidth={w}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pts}
              />
            ))
          )}
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
      </div>
      {footer}
    </div>
  );
}
