import { cn } from "@/lib/utils";
import {
  MARK_CHEVRON,
  MARK_CHEVRON_WIDTH,
  MARK_CORNER,
  MARK_HEXAGON,
  MARK_VIEWBOX,
} from "@/lib/brandMark";

/**
 * The Tropos mark: the rounded hexagon with the chevron cut out of it, as
 * on the app icon. DS3 puts it in Home's header, where it signs the page;
 * circles carry the data, the hexagon signs the name. The launch animation
 * ends by setting its mark down on this one.
 *
 * The chevron is drawn in the page's own colour rather than masked out,
 * which needs no document-unique id and reads identically on the page,
 * the only surface the mark sits on. The colour is a CSS class, not a
 * `stroke="hsl(var(…))"` attribute: WKWebView does not reliably
 * substitute var() in an SVG presentation attribute, and the chevron
 * would vanish on the platform that matters (see WaterContainerIcon).
 * It is decorative: the page title says where you are.
 *
 * Sized by height; the width follows the hexagon's box.
 */
export default function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      aria-hidden="true"
      focusable="false"
      data-brand-mark=""
      className={cn("h-4 w-auto shrink-0 text-lifting", className)}
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
        className="stroke-background"
        strokeWidth={MARK_CHEVRON_WIDTH}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
