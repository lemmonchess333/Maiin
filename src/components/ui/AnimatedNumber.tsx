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

/**
 * A number that counts to its value: from zero when it first appears,
 * then from wherever it was when the value changes.
 *
 * Under Reduce Motion it is plain text from the first paint. A motion
 * value only reaches the screen a frame after it is set, so the counter
 * showed "0" for a frame even with motion off, and a test reading the
 * figure had to wait for a number that never moved.
 */
export function AnimatedNumber({
  value,
  className,
  format,
  duration = 1.2,
  ease = DEFAULT_EASE,
}: Props) {
  const reduce = useReducedMotion();
  const count = useMotionValue(0);
  const formatted = (v: number) =>
    format ? format(v) : Math.round(v).toLocaleString();
  const display = useTransform(count, formatted);

  useEffect(() => {
    if (reduce) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, { duration, ease });
    return () => controls.stop();
  }, [value, reduce, count, duration, ease]);

  if (reduce) return <span className={className}>{formatted(value)}</span>;
  return <motion.span className={className}>{display}</motion.span>;
}
