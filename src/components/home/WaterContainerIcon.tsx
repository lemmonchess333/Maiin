import type { ReactElement } from "react";
import { THEME } from "@/lib/theme";

/**
 * Water container illustrations for the size picker — a drinking glass,
 * a ribbed bottle and a wider sports bottle. Drawn as clear outlined
 * containers (cap + threads, side grip lines, a water level inside)
 * rather than flat silhouettes, all in the hydration teal. The caller
 * scales `size` up with the volume so the visual reinforces the amount.
 */
export type WaterContainerType = "glass" | "bottle" | "large";

// Single colour token drives every stroke/fill (no hex literals).
const C = THEME.semantic.hydration;

// All glyphs authored on a 32×32 grid, filling the container with water
// to ~55% and drawing grip/measurement lines up the sides.
const GLYPHS: Record<WaterContainerType, ReactElement> = {
  glass: (
    <>
      {/* water */}
      <path
        d="M9.4 16 H22.6 L21.7 27.4 A2 2 0 0 1 19.7 29.2 H12.3 A2 2 0 0 1 10.3 27.4 Z"
        fill={C}
        fillOpacity={0.2}
      />
      {/* tumbler outline */}
      <path
        d="M8 5.5 H24 L22 27.5 A2.2 2.2 0 0 1 19.8 29.5 H12.2 A2.2 2.2 0 0 1 10 27.5 Z"
        fill="none"
        stroke={C}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      {/* rim + water surface + faint facets */}
      <line
        x1="8"
        y1="5.5"
        x2="24"
        y2="5.5"
        stroke={C}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <line
        x1="9.6"
        y1="16"
        x2="22.4"
        y2="16"
        stroke={C}
        strokeWidth={1.3}
        strokeOpacity={0.65}
        strokeLinecap="round"
      />
      <line
        x1="13.5"
        y1="9"
        x2="12.9"
        y2="26"
        stroke={C}
        strokeWidth={1}
        strokeOpacity={0.3}
        strokeLinecap="round"
      />
      <line
        x1="18.5"
        y1="9"
        x2="19.1"
        y2="26"
        stroke={C}
        strokeWidth={1}
        strokeOpacity={0.3}
        strokeLinecap="round"
      />
    </>
  ),
  bottle: (
    <>
      {/* water */}
      <path
        d="M9 17 H23 V26.4 A3 3 0 0 1 20 29.4 H12 A3 3 0 0 1 9 26.4 Z"
        fill={C}
        fillOpacity={0.2}
      />
      {/* body outline (shoulder → rounded base) */}
      <path
        d="M12.5 6.6 V8.1 A3.6 3.6 0 0 1 11.3 10.8 A5.2 5.2 0 0 0 9 15.1 V26.4 A3 3 0 0 0 12 29.4 H20 A3 3 0 0 0 23 26.4 V15.1 A5.2 5.2 0 0 0 20.7 10.8 A3.6 3.6 0 0 1 19.5 8.1 V6.6 Z"
        fill="none"
        stroke={C}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      {/* cap + threads */}
      <rect
        x="12"
        y="2.4"
        width="8"
        height="4.4"
        rx="1"
        fill={C}
        fillOpacity={0.3}
        stroke={C}
        strokeWidth={1.4}
      />
      <line
        x1="12.9"
        y1="4"
        x2="19.1"
        y2="4"
        stroke={C}
        strokeWidth={1}
        strokeOpacity={0.7}
      />
      <line
        x1="12.9"
        y1="5.3"
        x2="19.1"
        y2="5.3"
        stroke={C}
        strokeWidth={1}
        strokeOpacity={0.7}
      />
      {/* water surface */}
      <line
        x1="9"
        y1="17"
        x2="23"
        y2="17"
        stroke={C}
        strokeWidth={1.2}
        strokeOpacity={0.65}
      />
      {/* side grip lines */}
      <line
        x1="12.8"
        y1="16.5"
        x2="12.8"
        y2="26"
        stroke={C}
        strokeWidth={1.1}
        strokeOpacity={0.42}
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="15.6"
        x2="16"
        y2="26.6"
        stroke={C}
        strokeWidth={1.1}
        strokeOpacity={0.42}
        strokeLinecap="round"
      />
      <line
        x1="19.2"
        y1="16.5"
        x2="19.2"
        y2="26"
        stroke={C}
        strokeWidth={1.1}
        strokeOpacity={0.42}
        strokeLinecap="round"
      />
    </>
  ),
  large: (
    <>
      {/* water */}
      <path
        d="M7.6 17 H24.4 V26.4 A3 3 0 0 1 21.4 29.4 H10.6 A3 3 0 0 1 7.6 26.4 Z"
        fill={C}
        fillOpacity={0.2}
      />
      {/* wider body outline */}
      <path
        d="M9.2 8 A6 6 0 0 0 7.6 12.3 V26.4 A3 3 0 0 0 10.6 29.4 H21.4 A3 3 0 0 0 24.4 26.4 V12.3 A6 6 0 0 0 22.8 8 Z"
        fill="none"
        stroke={C}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      {/* sports cap base + spout */}
      <rect
        x="9.2"
        y="4.4"
        width="13.6"
        height="3.6"
        rx="1.2"
        fill={C}
        fillOpacity={0.3}
        stroke={C}
        strokeWidth={1.4}
      />
      <path
        d="M14.2 4.4 V2.4 A1 1 0 0 1 15.2 1.4 H16.8 A1 1 0 0 1 17.8 2.4 V4.4 Z"
        fill={C}
      />
      {/* water surface */}
      <line
        x1="7.6"
        y1="17"
        x2="24.4"
        y2="17"
        stroke={C}
        strokeWidth={1.2}
        strokeOpacity={0.65}
      />
      {/* side grip lines */}
      <line
        x1="10.6"
        y1="16.5"
        x2="10.6"
        y2="27"
        stroke={C}
        strokeWidth={1.1}
        strokeOpacity={0.42}
        strokeLinecap="round"
      />
      <line
        x1="14.2"
        y1="15.8"
        x2="14.2"
        y2="27.4"
        stroke={C}
        strokeWidth={1.1}
        strokeOpacity={0.42}
        strokeLinecap="round"
      />
      <line
        x1="17.8"
        y1="15.8"
        x2="17.8"
        y2="27.4"
        stroke={C}
        strokeWidth={1.1}
        strokeOpacity={0.42}
        strokeLinecap="round"
      />
      <line
        x1="21.4"
        y1="16.5"
        x2="21.4"
        y2="27"
        stroke={C}
        strokeWidth={1.1}
        strokeOpacity={0.42}
        strokeLinecap="round"
      />
      {/* measurement ticks */}
      <line
        x1="22.2"
        y1="20"
        x2="24.4"
        y2="20"
        stroke={C}
        strokeWidth={1}
        strokeOpacity={0.5}
        strokeLinecap="round"
      />
      <line
        x1="22.8"
        y1="23"
        x2="24.4"
        y2="23"
        stroke={C}
        strokeWidth={1}
        strokeOpacity={0.5}
        strokeLinecap="round"
      />
    </>
  ),
};

export default function WaterContainerIcon({
  type,
  size = 34,
}: {
  type: WaterContainerType;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      {GLYPHS[type]}
    </svg>
  );
}
