import { useReducedMotion } from "./useReducedMotion";

/**
 * Framer targets with their fade taken out under Reduce Motion.
 *
 * `MotionConfig reducedMotion="user"` (App.tsx) settles framer's
 * positional values, x, y, scale, width and height, and nothing else, so
 * an enter or exit that fades still fades for someone who has asked for
 * less motion. A component wraps the targets that fade:
 *
 *   const motionSafe = useMotionSafe();
 *   <motion.div
 *     initial={motionSafe({ opacity: 0, height: 0 })}
 *     animate={{ opacity: 1, height: "auto" }}
 *     exit={motionSafe({ opacity: 0, height: 0 })}
 *   />
 *
 * and `motionSafe.variants({...})` for a variants object, functions
 * (custom variants) included. With motion allowed the targets pass
 * through untouched; under Reduce Motion they lose `opacity`, so the
 * element is simply there, or simply gone, while the positions settle
 * as `MotionConfig` already settles them. An exit that had only a fade
 * becomes an empty target, which finishes at once.
 */
export interface MotionSafe {
  <T>(target: T): T;
  variants<V extends object>(variants: V): V;
}

/** The target as it moves under Reduce Motion: without its fade. */
export function withoutFade<T>(target: T): T {
  if (
    target === null ||
    typeof target !== "object" ||
    Array.isArray(target) ||
    !("opacity" in target)
  )
    return target;
  const { opacity: _fade, ...still } = target as Record<string, unknown>;
  return still as T;
}

/** Each variant without its fade, a custom variant's function included. */
export function variantsWithoutFade<V extends object>(variants: V): V {
  return Object.fromEntries(
    Object.entries(variants).map(([label, variant]) => [
      label,
      typeof variant === "function"
        ? (...args: unknown[]) => withoutFade(variant(...args))
        : withoutFade(variant),
    ])
  ) as V;
}

const asWritten: MotionSafe = Object.assign(<T>(target: T) => target, {
  variants: <V extends object>(variants: V) => variants,
});

const still: MotionSafe = Object.assign(<T>(target: T) => withoutFade(target), {
  variants: variantsWithoutFade,
});

export function useMotionSafe(): MotionSafe {
  return useReducedMotion() ? still : asWritten;
}
