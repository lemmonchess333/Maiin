import { useEffect, useRef } from "react";
import { useMotionValue, useTransform, animate, type MotionValue } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Animates a number from 0 to target on mount.
 * Only runs once per session (uses sessionStorage key).
 * Returns a MotionValue<string> that can be used with motion.span.
 */
export function useCountUp(
  target: number,
  options?: {
    sessionKey?: string;
    duration?: number;
    decimals?: number;
    suffix?: string;
  }
): MotionValue<string> {
  const { sessionKey, duration = 0.6, decimals = 0, suffix = "" } = options || {};
  const prefersReducedMotion = useReducedMotion();
  const motionValue = useMotionValue(0);
  const display = useTransform(motionValue, (v) => {
    const rounded = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString();
    return rounded + suffix;
  });
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (target === 0 || target == null) {
      motionValue.set(0);
      return;
    }

    // Skip animation if already played this session
    if (sessionKey) {
      const key = `tropos-countup-${sessionKey}`;
      if (sessionStorage.getItem(key)) {
        motionValue.set(target);
        return;
      }
      sessionStorage.setItem(key, "1");
    }

    if (hasAnimated.current || prefersReducedMotion) {
      motionValue.set(target);
      return;
    }

    hasAnimated.current = true;
    const controls = animate(motionValue, target, {
      duration,
      ease: [0.25, 0.1, 0.25, 1],
    });

    return () => controls.stop();
  }, [target, motionValue, duration, sessionKey, prefersReducedMotion]);

  return display;
}
