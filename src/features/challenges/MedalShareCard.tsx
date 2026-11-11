import type { Ref } from "react";
import { THEME } from "@/lib/theme";
import {
  MARK_CHEVRON,
  MARK_CHEVRON_WIDTH,
  MARK_CORNER,
  MARK_HEXAGON,
  MARK_VIEWBOX,
} from "@/lib/brandMark";
import type { DistanceUnit } from "@/lib/distanceUnits";
import type { LiftUnit } from "@/lib/liftLoad";
import MedalArt from "./MedalArt";
import {
  medalEditionDates,
  medalFace,
  medalTitle,
  medalValueParts,
  type Medal,
} from "./medals";

const ARCHIVO = "'Archivo Variable', ui-sans-serif, system-ui, sans-serif";
const JAKARTA =
  "'Plus Jakarta Sans Variable', ui-sans-serif, system-ui, sans-serif";
const SIDE = 1080;

/**
 * The square image a medal's Share hands over (Soc15): the medal, its
 * title, the figure and the edition's dates on the dark page colour, with
 * the Tropos mark small in a corner, as the session share cards carry it.
 *
 * Inline-styled and drawn at its full 1080 px, offscreen, for the same
 * reason ShareCardRenderer is: html-to-image rasterises the node, and its
 * clone does not reliably resolve the app's classes or variables. The
 * figure is in the sharer's units, as every share card's is: an image
 * cannot change its units for whoever opens it.
 */
export default function MedalShareCard({
  medal,
  liftUnit,
  distanceUnit,
  ref,
}: {
  medal: Medal;
  liftUnit: LiftUnit;
  distanceUnit: DistanceUnit;
  ref?: Ref<HTMLDivElement>;
}) {
  const tier = THEME.tier[medal.tier];
  const value = medalValueParts(medal, liftUnit, distanceUnit);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: "absolute",
        left: -99999,
        top: -99999,
        width: SIDE,
        height: SIDE,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: 80,
        boxSizing: "border-box",
        color: "white",
        fontFamily: JAKARTA,
        backgroundColor: THEME.bg,
        backgroundImage: `radial-gradient(circle at 50% 38%, ${tier}40, transparent 62%)`,
      }}
    >
      <MedalArt {...medalFace(medal, liftUnit, distanceUnit)} size={420} />
      <div
        style={{
          fontSize: 58,
          fontWeight: 800,
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        {medalTitle(medal)}
      </div>
      <div
        style={{
          fontFamily: ARCHIVO,
          fontSize: 96,
          fontWeight: 800,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value.figure}
        {value.unit && (
          <span style={{ fontFamily: JAKARTA, fontSize: 44, fontWeight: 700 }}>
            {" "}
            {value.unit}
          </span>
        )}
      </div>
      <div style={{ fontSize: 34, fontWeight: 600, opacity: 0.7 }}>
        {medalEditionDates(medal)}
      </div>
      <svg
        viewBox={MARK_VIEWBOX}
        aria-hidden="true"
        style={{ position: "absolute", left: 64, bottom: 64, height: 56 }}
      >
        <polygon
          points={MARK_HEXAGON}
          fill={THEME.brand}
          stroke={THEME.brand}
          strokeWidth={MARK_CORNER}
          strokeLinejoin="round"
        />
        <polyline
          points={MARK_CHEVRON}
          fill="none"
          stroke={THEME.bg}
          strokeWidth={MARK_CHEVRON_WIDTH}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
