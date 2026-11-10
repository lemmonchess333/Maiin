import type { Options } from "canvas-confetti";

const load = () => import("canvas-confetti").then((m) => m.default);

/** One burst. `after` is its delay from the first, in milliseconds. */
export type ConfettiBurst = Options & { after?: number };

/**
 * Confetti belongs to the screen that threw it.
 *
 * canvas-confetti draws on one canvas over the whole window and lets every
 * particle live out its ticks, close to four seconds at the settings the
 * rewards use. A reward left before then kept raining on whatever came
 * next: the Train tab, then Food. So a throw hands back the way to stop it,
 * and the screen calls that as it goes.
 *
 * Stopping clears the shared canvas, so it also ends another screen's
 * confetti if two rewards are in the air at once. They are not: a badge or
 * a medal opens over a finished reward, and both leave together.
 *
 * The caller decides whether to throw at all (never under Reduce Motion).
 */
export function throwConfetti(bursts: ConfettiBurst[]): () => void {
  let stopped = false;
  let clear: (() => void) | null = null;
  const timers: ReturnType<typeof setTimeout>[] = [];

  load().then(
    (confetti) => {
      if (stopped) return;
      clear = () => confetti.reset();
      const fire = (options: Options) => {
        try {
          void confetti(options);
        } catch {
          // No canvas: the reward stands on its own.
        }
      };
      for (const { after = 0, ...options } of bursts) {
        if (after <= 0) fire(options);
        else {
          timers.push(
            setTimeout(() => {
              if (!stopped) fire(options);
            }, after)
          );
        }
      }
    },
    () => {
      // The library did not load: the reward stands on its own.
    }
  );

  return () => {
    if (stopped) return;
    stopped = true;
    timers.forEach((timer) => clearTimeout(timer));
    clear?.();
  };
}
