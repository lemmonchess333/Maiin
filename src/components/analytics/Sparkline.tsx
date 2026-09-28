import { sparklineDomain } from "@/lib/sparklineDomain";

/**
 * A small trend line with no axis: the SHAPE of a series, for a row that
 * already states its figure in words and numbers (DS3's Trends rows, the
 * overview's Performance card).
 *
 * Inline SVG rather than a Recharts chart. Each Recharts chart mounts a
 * ResizeObserver and a tab stop (`role="application"`, which then needs a
 * name); a row of five of them is five focusable regions announcing the
 * same thing the row's text already says. This is decoration, so it is
 * hidden from assistive technology and costs nothing to lay out.
 *
 * The band comes from `sparklineDomain`, so a flat series sits mid-height
 * instead of pinned to the top edge.
 */
export default function Sparkline({
  values,
  color,
  width = 56,
  height = 20,
  fluid = false,
  endDot = false,
  className,
}: {
  values: readonly number[];
  color: string;
  width?: number;
  height?: number;
  /** Fill the container's width, keeping the drawing's proportions. */
  fluid?: boolean;
  /** Mark the latest value, where the line ends. */
  endDot?: boolean;
  className?: string;
}) {
  const finite = values.filter((v) => Number.isFinite(v));
  // One point has no shape to draw.
  if (finite.length < 2) return null;
  const [lo, hi] = sparklineDomain(finite);
  const span = hi - lo || 1;
  // Inset by the stroke's half-width (or the dot's radius) so nothing is
  // clipped at the edges.
  const inset = endDot ? 4 : 1.5;
  const step = (width - inset * 2) / (finite.length - 1);
  const xy = finite.map((v, i) => [
    inset + i * step,
    inset + (1 - (v - lo) / span) * (height - inset * 2),
  ]);
  const points = xy
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const [lastX, lastY] = xy[xy.length - 1];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={fluid ? "100%" : width}
      height={fluid ? undefined : height}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {endDot && <circle cx={lastX} cy={lastY} r={3.5} fill={color} />}
    </svg>
  );
}
