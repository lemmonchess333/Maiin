import { cn } from "@/lib/utils";

/**
 * A finish screen's drawing: the session's figure, as wide as the screen
 * allows, standing on a short shadow (`.figure-floor`) so it sits on the
 * page rather than floating. The drawings are trimmed to the figure, so
 * the shadow under the box is under the feet.
 */
export default function FinishFigure({
  src,
  className,
  leadDrawing,
}: {
  src: string;
  /** Extra classes for the drawing, such as `exercise-drawing`. */
  className?: string;
  /** The exercise the drawing shows, for `data-lead-drawing`. */
  leadDrawing?: string;
}) {
  return (
    <div className="relative w-[min(88%,22rem)]" data-finish-drawing>
      <div aria-hidden="true" className="figure-floor" />
      <img
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        data-lead-drawing={leadDrawing}
        className={cn(
          "relative h-auto max-h-[22rem] w-full object-contain",
          className
        )}
      />
    </div>
  );
}
