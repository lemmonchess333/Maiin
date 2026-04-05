import { useEffect } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface Props {
  value: number;
  className?: string;
  format?: (n: number) => string;
}

export function AnimatedNumber({ value, className, format }: Props) {
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
    const controls = animate(count, value, {
      duration: 1.2,
      ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
    });
    return () => controls.stop();
  }, [value, reduce, count]);

  return <motion.span className={className}>{display}</motion.span>;
}
