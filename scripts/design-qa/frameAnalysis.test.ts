import { describe, it, expect } from "vitest";
import { analyzeFrameDiffs } from "./frameAnalysis";

/**
 * Synthetic change-ratio series stand in for real captures so the jank
 * judgement is pinned deterministically (the browser layer is what produces
 * these numbers in CI; the logic that grades them is proven here).
 */
describe("analyzeFrameDiffs", () => {
  it("passes a smooth transition that settles", () => {
    // Bell curve of motion that decays to rest.
    const r = analyzeFrameDiffs([
      0, 0.05, 0.15, 0.25, 0.3, 0.25, 0.15, 0.05, 0.005, 0.002, 0.001,
    ]);
    expect(r.ok).toBe(true);
    expect(r.hasMotion).toBe(true);
    expect(r.settled).toBe(true);
    expect(r.pops).toEqual([]);
    expect(r.stalls).toEqual([]);
    expect(r.smoothness).toBeGreaterThan(0.7);
  });

  it("flags a POP — an isolated spike (UI jumped instead of tweening)", () => {
    const r = analyzeFrameDiffs([
      0, 0.05, 0.05, 0.5, 0.05, 0.05, 0.005, 0.002, 0.001,
    ]);
    expect(r.ok).toBe(false);
    expect(r.pops).toContain(3);
    expect(r.jankFlags.join(" ")).toMatch(/pop\/hitch/);
  });

  it("flags a STALL — a frozen frame between two moving ones", () => {
    const r = analyzeFrameDiffs([
      0, 0.05, 0.08, 0.002, 0.08, 0.05, 0.005, 0.001, 0.0005,
    ]);
    expect(r.ok).toBe(false);
    expect(r.stalls).toContain(3);
    expect(r.jankFlags.join(" ")).toMatch(/stall/);
  });

  it("flags a transition that never settles (still moving at the tail)", () => {
    const r = analyzeFrameDiffs([0, 0.05, 0.1, 0.15, 0.2, 0.2, 0.2, 0.2]);
    expect(r.settled).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.jankFlags.join(" ")).toMatch(/never settles/);
  });

  it("flags a capture with no motion (the trigger didn't animate)", () => {
    const r = analyzeFrameDiffs([0, 0.001, 0.002, 0.001, 0]);
    expect(r.hasMotion).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.jankFlags.join(" ")).toMatch(/no motion/);
  });

  it("a smooth curve scores smoother than a poppy one", () => {
    const smooth = analyzeFrameDiffs([
      0, 0.05, 0.15, 0.25, 0.3, 0.25, 0.15, 0.05, 0.005, 0.001,
    ]);
    const poppy = analyzeFrameDiffs([
      0, 0.05, 0.05, 0.5, 0.05, 0.05, 0.005, 0.001,
    ]);
    expect(smooth.smoothness).toBeGreaterThan(poppy.smoothness);
  });
});
