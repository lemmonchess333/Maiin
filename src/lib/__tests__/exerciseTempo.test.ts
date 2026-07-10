import { describe, it, expect } from "vitest";
import { parseTempo, repTimingFor, DEFAULT_REP_TIMING } from "../exerciseTempo";

/* Demo1 — authored "down-pause-up" tempo drives the rig teaching-rep's phase
 * durations, bounded to a calm readable band; anything unparseable falls back
 * to the pre-Demo1 defaults. */
describe("parseTempo", () => {
  it("parses D-P-U seconds into phase ms", () => {
    expect(parseTempo("2-1-1")).toEqual({
      downMs: 2000,
      holdMs: 1000,
      upMs: 1000,
    });
  });

  it("clamps a 0-second pause up to a visible beat and long phases down", () => {
    const t = parseTempo("9-0-9")!;
    expect(t.downMs).toBe(5000); // MAX_MOVE
    expect(t.holdMs).toBe(200); // MIN_HOLD — a 0s pause still reads as a beat
    expect(t.upMs).toBe(5000);
  });

  it("clamps a sub-half-second move up to readable speed", () => {
    expect(parseTempo("0-1-0")!.downMs).toBe(500);
  });

  it("rejects malformed strings", () => {
    expect(parseTempo("")).toBeNull();
    expect(parseTempo(undefined)).toBeNull();
    expect(parseTempo("2-1")).toBeNull();
    expect(parseTempo("2-1-1-1")).toBeNull();
    expect(parseTempo("a-b-c")).toBeNull();
    expect(parseTempo("2--1")).toBeNull();
    expect(parseTempo("-2-1-1")).toBeNull(); // negative
  });

  it("repTimingFor falls back to the pre-Demo1 defaults", () => {
    expect(repTimingFor(undefined)).toEqual(DEFAULT_REP_TIMING);
    expect(repTimingFor("junk")).toEqual(DEFAULT_REP_TIMING);
    expect(repTimingFor("3-1-1").downMs).toBe(3000);
  });
});
