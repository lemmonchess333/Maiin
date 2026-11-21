/**
 * The one vertical area-fill fade every analytics chart uses (top stop →
 * transparent bottom): StatCard, PerformanceIndexChart and ElevationProfile
 * share this one <defs><linearGradient> rather than a copy each, so the
 * gradient family is held by code, not by copy-paste. Opacities are
 * parametrised so each chart keeps its own rendering.
 *
 * Rendered INSIDE a Recharts chart element — Recharts passes unrecognised
 * children through to the SVG, which is the documented way to ship defs.
 */
interface Props {
  /** SVG gradient id — referenced by the Area's `fill="url(#id)"`. */
  id: string;
  color: string;
  topOpacity?: number;
  bottomOpacity?: number;
}

export default function ChartAreaGradient({
  id,
  color,
  topOpacity = 0.35,
  bottomOpacity = 0,
}: Props) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={topOpacity} />
        <stop offset="100%" stopColor={color} stopOpacity={bottomOpacity} />
      </linearGradient>
    </defs>
  );
}
