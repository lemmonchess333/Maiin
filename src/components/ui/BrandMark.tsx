import { cn } from "@/lib/utils";
import { MARK_BAR, MARK_STEM, MARK_VIEWBOX } from "@/lib/brandMark";

/**
 * The Tropos mark: the T whose stem rises into its bar, as on the app icon
 * (DS7). DS3 puts it in Home's header, where it signs the page; circles
 * carry the data, the mark signs the name. The launch animation ends by
 * setting its mark down on this one.
 *
 * Two filled shapes in the mark's own colour. The gap between them shows
 * whatever the mark sits on, so it needs no cut in the page's colour and
 * reads the same on any surface. It is decorative: the page title says
 * where you are.
 *
 * Sized by height; the width follows the mark's box.
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
      <path d={MARK_BAR} fill="currentColor" />
      <path d={MARK_STEM} fill="currentColor" />
    </svg>
  );
}
