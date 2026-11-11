import { cn } from "@/lib/utils";
import { MARK_BAR, MARK_STEM, MARK_VIEWBOX } from "@/lib/brandMark";

/**
 * The guide's face: the Tropos mark, as Home's header draws it (FV1 chose
 * the mark over a character, so the guide has the logo and the app's own
 * voice).
 *
 * Deliberately not `BrandMark`: that one carries `data-brand-mark`, which
 * is how the launch animation and the guide find Home's header mark, and
 * a second one on screen would be found instead.
 */
export default function GuideMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      aria-hidden="true"
      focusable="false"
      className={cn("h-5 w-auto shrink-0 text-lifting", className)}
    >
      <path d={MARK_BAR} fill="currentColor" />
      <path d={MARK_STEM} fill="currentColor" />
    </svg>
  );
}
