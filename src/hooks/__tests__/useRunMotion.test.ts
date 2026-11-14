import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { MotionSample } from "@/lib/runAutoPause";

const source = vi.hoisted(() => ({
  native: true,
  onSample: null as ((sample: MotionSample) => void) | null,
  starts: 0,
  stops: 0,
}));

vi.mock("@/lib/platform", () => ({ isNativePlatform: () => source.native }));

vi.mock("@/lib/runMotionSource", () => ({
  startRunMotion: async (onSample: (sample: MotionSample) => void) => {
    source.starts += 1;
    source.onSample = onSample;
    return () => {
      source.stops += 1;
    };
  },
}));

import { useRunMotion } from "../useRunMotion";

const AT = 1_700_000_000_000;

// Before, not after: the last test's hook unmounts in the library's own
// cleanup, which runs after this file's afterEach.
beforeEach(() => {
  source.native = true;
  source.onSample = null;
  source.starts = 0;
  source.stops = 0;
});

describe("useRunMotion", () => {
  it("starts nothing without a run", () => {
    const { result } = renderHook(() => useRunMotion(null));
    expect(result.current).toBeNull();
    expect(source.starts).toBe(0);
  });

  it("loads nothing on the web, where GPS alone decides", async () => {
    source.native = false;
    const { result } = renderHook(() => useRunMotion("run-1"));
    await act(async () => {});
    expect(source.starts).toBe(0);
    expect(result.current).toBeNull();
  });

  it("folds a run's samples into one reading", async () => {
    const { result } = renderHook(() => useRunMotion("run-1"));
    await act(async () => {});
    expect(result.current).toBeNull();
    act(() => {
      source.onSample!({ kind: "stepEvent", at: AT, moving: true });
      source.onSample!({
        kind: "steps",
        at: AT + 2500,
        steps: 7,
        cadence: 2.8,
      });
    });
    expect(result.current).toMatchObject({
      stepEvent: { at: AT, moving: true },
      steps: 7,
      stepAt: AT + 2500,
    });
  });

  it("stops the sensors when the run ends, and carries nothing into the next", async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useRunMotion(id),
      { initialProps: { id: "run-1" as string | null } }
    );
    await act(async () => {});
    act(() => source.onSample!({ kind: "stepEvent", at: AT, moving: true }));
    expect(result.current).not.toBeNull();

    rerender({ id: null });
    expect(source.stops).toBe(1);
    expect(result.current).toBeNull();

    rerender({ id: "run-2" });
    await act(async () => {});
    expect(source.starts).toBe(2);
    expect(result.current).toBeNull();
  });
});
