import type { ReactElement } from "react";
import { THEME } from "@/lib/theme";

/**
 * Water container silhouettes for the size picker — a drinking glass,
 * a slim bottle and a wider sports bottle — so each preset reads as
 * its actual container instead of an identical water drop. Filled in
 * the hydration teal; the caller scales `size` up with the volume so
 * the visual reinforces the amount.
 */
export type WaterContainerType = "glass" | "bottle" | "large";

// All paths authored on a 24×24 grid.
const GLYPHS: Record<WaterContainerType, ReactElement> = {
  // Tapered tumbler, wider at the rim.
  glass: (
    <path d="M6.4 4h11.2l-1.4 15.9a1.5 1.5 0 0 1-1.5 1.35H9.3a1.5 1.5 0 0 1-1.5-1.35L6.4 4z" />
  ),
  // Slim bottle: cap + narrowed shoulder + rounded body.
  bottle: (
    <>
      <rect x="9.8" y="2" width="4.4" height="2.8" rx="0.7" />
      <path d="M8 8c0-1.5 1-2 1-3.5V4.5h6v0c0 1.5 1 2 1 3.5v11.7A1.8 1.8 0 0 1 14.2 21.5H9.8A1.8 1.8 0 0 1 8 19.7V8z" />
    </>
  ),
  // Wider sports bottle: bigger flat cap + broader body.
  large: (
    <>
      <rect x="8.6" y="2" width="6.8" height="2.9" rx="0.8" />
      <path d="M6.4 8c0-1.5 1.4-2 1.4-3.4V4.9h8.4v-.3c0 1.4 1.4 1.9 1.4 3.4v11.6A1.9 1.9 0 0 1 15.7 21.5H8.3A1.9 1.9 0 0 1 6.4 19.6V8z" />
    </>
  ),
};

export default function WaterContainerIcon({
  type,
  size = 26,
}: {
  type: WaterContainerType;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={THEME.semantic.hydration}
      aria-hidden="true"
    >
      {GLYPHS[type]}
    </svg>
  );
}
