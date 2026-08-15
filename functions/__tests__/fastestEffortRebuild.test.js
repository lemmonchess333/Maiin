/**
 * fastestEffortRebuild.rebuildNeeded — the gate that decides whether a
 * deleted run's fastest_effort marker warrants the rebuild scan.
 *
 * The rebuild itself is exercised end-to-end (real triggers, emulator) in
 * integration/activityDeleteReversal.test.js; this pins the pure
 * predicate's edges, because a wrong answer here fails silently in one of
 * two opposite ways — a stale best left standing (skip when needed) or a
 * wasted scan on every ordinary delete (rebuild when not).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { rebuildNeeded } = require("../lib/fastestEffortRebuild");

describe("rebuildNeeded", () => {
  it("true when the deleted run's time equals the standing best (the driver)", () => {
    expect(
      rebuildNeeded({ metric: "fastest_effort", runSeconds: 1400 }, 1400)
    ).toBe(true);
  });

  it("true when the marker time is somehow BELOW the best (repaired data)", () => {
    expect(
      rebuildNeeded({ metric: "fastest_effort", runSeconds: 1200 }, 1400)
    ).toBe(true);
  });

  it("false when the deleted run was slower than the best (cannot be the driver)", () => {
    expect(
      rebuildNeeded({ metric: "fastest_effort", runSeconds: 1600 }, 1400)
    ).toBe(false);
  });

  it("false for SUM markers regardless of values", () => {
    expect(rebuildNeeded({ metric: "total_km", incrementBy: 5 }, 1400)).toBe(
      false
    );
    expect(rebuildNeeded({ incrementBy: 5 }, 1400)).toBe(false);
  });

  it("false when nothing is standing to correct", () => {
    expect(
      rebuildNeeded({ metric: "fastest_effort", runSeconds: 1400 }, 0)
    ).toBe(false);
    expect(
      rebuildNeeded({ metric: "fastest_effort", runSeconds: 1400 }, undefined)
    ).toBe(false);
  });

  it("errs toward rebuilding when the marker's time is missing or malformed", () => {
    // The apply path has always stamped runSeconds; this covers
    // hand-repaired data. A wasted rebuild converges; a skipped one
    // strands a stale best.
    expect(rebuildNeeded({ metric: "fastest_effort" }, 1400)).toBe(true);
    expect(
      rebuildNeeded({ metric: "fastest_effort", runSeconds: "x" }, 1400)
    ).toBe(true);
  });

  it("false for a missing marker", () => {
    expect(rebuildNeeded(null, 1400)).toBe(false);
    expect(rebuildNeeded(undefined, 1400)).toBe(false);
  });
});
