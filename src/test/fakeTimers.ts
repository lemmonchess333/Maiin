/**
 * Put the real clock back after a test that faked it, without leaving
 * framer-motion's frame loop shut for the rest of the file.
 *
 * Unmounting under a fake clock while an animation runs strands jsdom's
 * animation-frame counter and motion-dom's frame batcher, and every later
 * entrance animation in the file then stays at `opacity: 0`
 * (`WorkoutSessionCompletion.test.tsx` has the full mechanism). Unmount,
 * let one frame fire on the fake clock, then restore. `src/test/setup.ts`
 * cannot do this for a suite: by the time its afterEach runs, the suite has
 * already restored the clock.
 *
 * Call it where the suite would call `vi.useRealTimers()`. It does nothing
 * when the clock is already real.
 */
import { act, cleanup } from "@testing-library/react";
import { vi } from "vitest";

export async function restoreRealTimers(): Promise<void> {
  if (!vi.isFakeTimers()) return;
  cleanup();
  await act(async () => {
    vi.advanceTimersByTime(100);
  });
  vi.useRealTimers();
}
