import type { ReactNode } from "react";
import { domMax, LazyMotion } from "framer-motion";

/**
 * Upgrades a subtree from MotionRoot's `domAnimation` bundle to `domMax` for
 * the few surfaces that use Framer Motion `drag` or `layout` projection
 * (FoodRow swipe-to-delete, MealMacroBar segment sizing, ActivityCommentRows
 * reflow).
 *
 * Kept out of MotionRoot so signed-in startup and non-drag routes never
 * download the drag/layout projection engine (`motion-max` chunk).
 */
export default function MotionMaxRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      {children}
    </LazyMotion>
  );
}
