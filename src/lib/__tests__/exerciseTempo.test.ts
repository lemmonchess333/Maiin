import { describe, it, expect } from "vitest";
import {
  parseTempo,
  repTimingFor,
  repSampleAt,
  repTotalMs,
  SET_BEAT_MS,
  DEFAULT_REP_TIMING,
} from "../exerciseTempo";

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

/* The rep phase timeline (form-animation pass): set lead-in → eccentric →
 * pause → drive → lockout beat → done. Pure elapsed-time → sample, so the
 * whole teaching sequence pins here without mocking rAF. */
describe("repSampleAt / repTotalMs", () => {
  const T = { downMs: 1000, holdMs: 400, upMs: 800 };
  // Timeline: set [0,600) → eccentric [600,1600) → pause [1600,2000)
  //           → drive [2000,2800) → lockout [2800,3200) → done.

  it("totals the set lead-in + all phases + the lockout beat", () => {
    expect(repTotalMs(T)).toBe(SET_BEAT_MS + 1000 + 400 + 800 + 400);
  });

  it("holds the lockout frame through the Set lead-in (no motion before the eye settles)", () => {
    expect(repSampleAt(0, T)).toMatchObject({ phase: "set", ecc: 0 });
    expect(repSampleAt(SET_BEAT_MS - 1, T).phase).toBe("set");
  });

  it("eccentric progresses 0→1 across downMs", () => {
    expect(repSampleAt(SET_BEAT_MS, T)).toMatchObject({
      phase: "eccentric",
      ecc: 0,
    });
    const mid = repSampleAt(SET_BEAT_MS + 500, T);
    expect(mid.phase).toBe("eccentric");
    expect(mid.ecc).toBeCloseTo(0.5, 5);
  });

  it("pauses at full depth, then drives back to lockout", () => {
    expect(repSampleAt(SET_BEAT_MS + 1000, T)).toMatchObject({
      phase: "pause",
      ecc: 1,
    });
    const midDrive = repSampleAt(SET_BEAT_MS + 1400 + 400, T);
    expect(midDrive.phase).toBe("drive");
    expect(midDrive.ecc).toBeCloseTo(0.5, 5);
  });

  it("cues Lockout after the drive completes (the old timeline kept cueing 'drive')", () => {
    expect(repSampleAt(SET_BEAT_MS + 1000 + 400 + 800, T).phase).toBe(
      "lockout"
    );
  });

  it("settles on done at calm effort past the total", () => {
    expect(repSampleAt(repTotalMs(T), T)).toMatchObject({
      phase: "done",
      ecc: 0,
      targetEffort: 0.7,
    });
    expect(repSampleAt(repTotalMs(T) + 99999, T).phase).toBe("done");
  });

  it("effort peaks through the drive and stays controlled on the eccentric", () => {
    const ecc = repSampleAt(SET_BEAT_MS + 500, T).targetEffort;
    const drive = repSampleAt(SET_BEAT_MS + 1400 + 400, T).targetEffort;
    expect(drive).toBe(1);
    expect(ecc).toBeLessThan(drive);
  });
});
