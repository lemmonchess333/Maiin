/**
 * Confetti leaves with the screen that threw it.
 *
 * On a phone, a finish screen left a second or two after its reward kept
 * raining on the Train tab and then on Food: the library draws on one
 * canvas over the whole window and lets each particle live out its ticks.
 * `throwConfetti` hands back a stop, and these pin what it does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const confetti = vi.hoisted(() => Object.assign(vi.fn(), { reset: vi.fn() }));
vi.mock("canvas-confetti", () => ({ default: confetti }));

import { throwConfetti } from "../confetti";

/** Let the lazy import of the library resolve. */
async function loaded() {
  await vi.dynamicImportSettled();
}

beforeEach(() => {
  vi.useFakeTimers();
  confetti.mockClear();
  confetti.reset.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("throwConfetti", () => {
  it("throws the first burst at once and the later ones on their delay", async () => {
    throwConfetti([
      { particleCount: 110 },
      { particleCount: 40, after: 160 },
      { particleCount: 40, after: 320 },
    ]);
    await loaded();
    expect(confetti).toHaveBeenCalledTimes(1);
    expect(confetti).toHaveBeenLastCalledWith({ particleCount: 110 });

    vi.advanceTimersByTime(160);
    expect(confetti).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(160);
    expect(confetti).toHaveBeenCalledTimes(3);
    // `after` is the helper's own; the library never sees it.
    expect(confetti).toHaveBeenLastCalledWith({ particleCount: 40 });
  });

  it("clears what is in the air when stopped", async () => {
    const stop = throwConfetti([{ particleCount: 90 }]);
    await loaded();
    expect(confetti.reset).not.toHaveBeenCalled();
    stop();
    expect(confetti.reset).toHaveBeenCalledTimes(1);
  });

  it("throws no later burst once stopped", async () => {
    const stop = throwConfetti([
      { particleCount: 110 },
      { particleCount: 40, after: 160 },
    ]);
    await loaded();
    stop();
    vi.advanceTimersByTime(1000);
    expect(confetti).toHaveBeenCalledTimes(1);
  });

  it("throws nothing, and clears nothing, when stopped before the library loads", async () => {
    const stop = throwConfetti([{ particleCount: 90 }]);
    stop();
    await loaded();
    vi.advanceTimersByTime(1000);
    expect(confetti).not.toHaveBeenCalled();
    expect(confetti.reset).not.toHaveBeenCalled();
  });

  it("stops once: a second call does not clear another screen's confetti", async () => {
    const stop = throwConfetti([{ particleCount: 90 }]);
    await loaded();
    stop();
    stop();
    expect(confetti.reset).toHaveBeenCalledTimes(1);
  });
});
