import type { ReactNode } from "react";
import { AnimatePresence, m } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useMotionSafe } from "@/hooks/useMotionSafe";

/** How long a swap's crossfade takes, in seconds: the calorie wheel and
 *  the macros switch together, so they share it. */
export const SWAP_FADE_SEC = 0.2;

const SWAP_EASE = [0.4, 0, 0.2, 1] as [number, number, number, number];

/**
 * Words and a figure that change in place when `swapKey` changes: the old
 * fades out as the new fades in, in the same box, over `SWAP_FADE_SEC`.
 *
 * For a switch that changes what a figure means, not what it measures:
 * Food's left and logged. The figure is not counted from one meaning to
 * the other, since the values between them are untrue (0 logged counted
 * to 3,400 left passes 2,954 left). `children` is told whether a swap
 * has happened since this mounted (`swapped`), so a figure in it counts up
 * on its first draw and, after a swap, starts at its value; a real change
 * to it (a food logged) still counts.
 *
 * Both copies sit in one grid cell while they cross, so nothing around
 * them moves. Under Reduce Motion the fade is taken out: the new copy is
 * simply there and the old simply gone.
 */
export default function SwapFade({
  swapKey,
  as = "div",
  className,
  children,
}: {
  swapKey: string;
  /** "span" inside a line of text or a button's phrasing content. */
  as?: "div" | "span";
  className?: string;
  children: (swapped: boolean) => ReactNode;
}) {
  const motionSafe = useMotionSafe();
  const [firstKey] = useState(swapKey);
  const [swapped, setSwapped] = useState(false);
  if (!swapped && swapKey !== firstKey) setSwapped(true);

  const Cell = as === "span" ? m.span : m.div;
  const Grid = as;
  return (
    <Grid className={cn("grid", className)}>
      <AnimatePresence initial={false}>
        <Cell
          key={swapKey}
          data-swap-fade=""
          className="[grid-area:1/1] min-w-0"
          initial={motionSafe({ opacity: 0 })}
          animate={{ opacity: 1 }}
          exit={motionSafe({ opacity: 0 })}
          transition={{ duration: SWAP_FADE_SEC, ease: SWAP_EASE }}
        >
          {children(swapped)}
        </Cell>
      </AnimatePresence>
    </Grid>
  );
}
