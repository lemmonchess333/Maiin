import { cn } from "@/lib/utils";
import {
  MARK_CHEVRON,
  MARK_CHEVRON_WIDTH,
  MARK_CORNER,
  MARK_HEXAGON,
  MARK_VIEWBOX,
} from "@/lib/brandMark";

/**
 * The guide's face: the Tropos mark, as Home's header draws it (FV1 chose
 * the mark over a character, so the guide has the logo and the app's own
 * voice). Its chevron is drawn in the colour of the surface it sits on,
 * `cutClass`, as BrandMark draws its chevron in the page's colour.
 *
 * Deliberately not `BrandMark`: that one carries `data-brand-mark`, which
 * is how the launch animation and the guide find Home's header mark, and
 * a second one on screen would be found instead.
 */
export default function GuideMark({
  className,
  cutClass = "stroke-card",
}: {
  className?: string;
  /** The stroke class matching the surface behind the mark. */
  cutClass?: string;
}) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      aria-hidden="true"
      focusable="false"
      className={cn("h-5 w-auto shrink-0 text-lifting", className)}
    >
      <polygon
        points={MARK_HEXAGON}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={MARK_CORNER}
        strokeLinejoin="round"
      />
      <polyline
        points={MARK_CHEVRON}
        fill="none"
        className={cutClass}
        strokeWidth={MARK_CHEVRON_WIDTH}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
