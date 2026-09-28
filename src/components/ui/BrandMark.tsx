import { cn } from "@/lib/utils";

/* The app icon's own geometry (src/assets/brand/app-icon.svg), in its
   1024 space: the viewBox is the hexagon's box, so the mark fills the
   element with no inset to guess at. */
const HEXAGON = "512,212 772,362 772,662 512,812 252,662 252,362";
const CHEVRON = "356,600 512,400 668,600";

/**
 * The Tropos mark: the solid hexagon with the chevron cut out of it, as
 * on the app icon and the splash. DS3 puts it in Home's header, where it
 * signs the page; circles carry the data, the hexagon signs the name.
 *
 * The chevron is drawn in the page's own colour rather than masked out,
 * which needs no document-unique id and reads identically on the page,
 * the only surface the mark sits on. The colour is a CSS class, not a
 * `stroke="hsl(var(…))"` attribute: WKWebView does not reliably
 * substitute var() in an SVG presentation attribute, and the chevron
 * would vanish on the platform that matters (see WaterContainerIcon).
 * It is decorative: the page title says where you are.
 *
 * Sized by height; the width follows the hexagon's 520 by 600 box.
 */
export default function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="252 212 520 600"
      aria-hidden="true"
      focusable="false"
      data-brand-mark=""
      className={cn("h-4 w-auto shrink-0 text-lifting", className)}
    >
      <polygon points={HEXAGON} fill="currentColor" />
      <polyline
        points={CHEVRON}
        fill="none"
        className="stroke-background"
        strokeWidth={86}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
