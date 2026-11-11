import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";

/* The full scrim runs behind the words themselves and fades out over the
   2.5rem above them, so it is as tall as the caption is, at any text size
   and however many lines the name takes. White on the 55% scrim holds
   4.5:1 even over a white photo; a scrim fixed to a share of the card
   thinned out behind a two-line name, which is where the bright bridge
   lights showed through. */
const SCRIM = `linear-gradient(to top, ${THEME.scrim} 0%, ${THEME.scrim} calc(100% - 2.5rem), transparent 100%)`;

/**
 * The words at the foot of a photo card (a challenge's hero, a Space or a
 * race in the directory), on the one scrim every such card uses. Without
 * a photo it draws no scrim, and the words sit on the card's tinted band.
 */
export default function PhotoCaption({
  onPhoto,
  className,
  children,
}: {
  onPhoto: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-photo-caption={onPhoto ? "scrim" : "plain"}
      className={cn(
        "absolute inset-x-0 bottom-0 min-w-0 pb-3",
        onPhoto && "pt-10",
        className
      )}
      style={onPhoto ? { background: SCRIM } : undefined}
    >
      {children}
    </div>
  );
}
