import { useEffect, useSyncExternalStore } from "react";
import { useMotionValue, useTransform, animate } from "framer-motion";
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

  // Render the live formatted value as plain text by SUBSCRIBING to the
  // derived MotionValue, rather than passing it as a <motion.span> child.
  // The child-MotionValue render path needs the full motion feature set; under
  // LazyMotion (perf: features stream in after first paint) the lightweight
  // `m` can't drive it, so the number would flash "0" until features loaded.
  // `useMotionValue` / `useTransform` / `animate` are plain hooks — no
  // LazyMotion dependency. useSyncExternalStore reads the live value on every
  // render (no setState-in-effect, no flash).
  const text = useSyncExternalStore(
    (onChange) => display.on("change", onChange),
    () => display.get()
  );

  useEffect(() => {
    if (reduce) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, { duration, ease });
    return () => controls.stop();
  }, [value, reduce, count, duration, ease]);

  return <span className={className}>{text}</span>;
}
