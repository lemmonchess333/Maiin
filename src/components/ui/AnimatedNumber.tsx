import { useEffect } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface Props {
  value: number;
  className?: string;
  format?: (n: number) => string;
  /** Animation duration in seconds. Default 1.2. */
  duration?: number;
  /** Easing curve. Default [0.32, 0.72, 0, 1]. */
  ease?: [number, number, number, number];
}

const DEFAULT_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export function AnimatedNumber({
  value,
  className,
  format,
  duration = 1.2,
  ease = DEFAULT_EASE,
}: Props) {
  const reduce = useReducedMotion();
  const count = useMotionValue(0);
  const display = useTransform(count, (v) =>
    format ? format(v) : Math.round(v).toLocaleString()
  );

  useEffect(() => {
    if (reduce) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, { duration, ease });
    return () => controls.stop();
  }, [value, reduce, count, duration, ease]);

  return <motion.span className={className}>{display}</motion.span>;
}
