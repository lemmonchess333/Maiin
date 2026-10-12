import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Content taking its placeholder's place fades in over 200 ms where the
 * placeholder was (Pol1), rather than popping in. The placeholder holds
 * the content's shape, so this is the only movement there is.
 *
 * `arrived` and `onArrived` come from `useArrivedAfterLoading` in the
 * component that rendered the placeholder. Content that was ready when it
 * mounted just shows, as does content shown again after its arrival, and
 * everything under Reduce Motion, since opacity is not one of the values
 * `MotionConfig` settles.
 */
export default function ArrivalFade({
  arrived,
  onArrived,
  className,
  children,
}: {
  arrived: boolean;
  onArrived: () => void;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const fade = arrived && !reduce;
  return (
    <motion.div
      initial={fade ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      onAnimationComplete={fade ? onArrived : undefined}
      className={className}
    >
      {children}
    </motion.div>
  );
}
