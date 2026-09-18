import { StrictMode, createElement, useEffect, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SessionSegment } from "@/lib/runSegments";
import { useSessionPlayer } from "../useSessionPlayer";

const segments: SessionSegment[] = [
  { type: "warmup", label: "Warm-up", instruction: "", target: { kind: "duration", seconds: 300 } },
  { type: "hard", label: "Rep", instruction: "", rep: 1, totalReps: 1, paceTarget: 300, target: { kind: "distance", meters: 1000 } },
];
const wrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);

describe("session player evidence integration", () => {
  it("keeps nonzero measurements when Strict Mode replays state updaters", () => {
    const { result } = renderHook(() => useSessionPlayer(segments), { wrapper });
    act(() => { result.current.start(); result.current.start(); });
    act(() => result.current.tick(301, 500));
    expect(result.current.state.results[0]).toMatchObject({
      elapsedSeconds: 301, distanceMeters: 500, outcome: "completed",
    });
    act(() => result.current.skip(330, 650));
    expect(result.current.state.results[1]).toMatchObject({
      elapsedSeconds: 29, distanceMeters: 150, outcome: "skipped",
    });
  });

  it("settles when the page depends on the returned player object", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      if (++renders > 20) throw new Error("Player tick caused a render loop");
      const player = useSessionPlayer(segments);
      useEffect(() => { player.start(); player.tick(100, 200); }, [player]);
      return player;
    }, { wrapper });
    expect(result.current.state.phaseElapsed).toBe(100);
    expect(renders).toBeLessThan(20);
  });

  it("exposes partial evidence through the state that Run.tsx already saves", () => {
    const { result } = renderHook(() => useSessionPlayer(segments));
    act(() => result.current.start());
    act(() => result.current.tick(300, 500));
    act(() => result.current.tick(330, 650));
    expect(result.current.state.results[1]).toMatchObject({
      outcome: "in_progress", elapsedSeconds: 30, distanceMeters: 150,
    });
    act(() => result.current.tick(600, 1500));
    expect(result.current.state.results).toHaveLength(2);
    expect(result.current.state.results[1].outcome).toBe("completed");
  });
});
