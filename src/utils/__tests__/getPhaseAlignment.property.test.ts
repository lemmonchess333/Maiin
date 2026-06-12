/**
 * Property-based guard for getPhaseAlignment — the goal-vs-energy-balance
 * "are you on track?" framing on the Progress page.
 *
 * `avgBalance` is expenditure − intake (positive = a deficit). The alignment is
 * GOAL-DIRECTIONAL: a deficit is on-track for a cut but at-odds for a lean bulk,
 * and vice-versa; within ±NEAR_MAINTENANCE_THRESHOLD it's "maintaining". A
 * flipped sign or a wrong threshold would tell a user they're on track when
 * they're sabotaging their goal. Example tests pin specific points; this fuzzes
 * the whole balance range and asserts the directional contract for every value.
 *
 * Deterministic (seeded PRNG).
 */
import { describe, it, expect } from "vitest";
import {
  getPhaseAlignment,
  NEAR_MAINTENANCE_THRESHOLD,
} from "../calorieBalance";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const T = NEAR_MAINTENANCE_THRESHOLD; // 200

describe("getPhaseAlignment directional contract (property-based)", () => {
  it("cut: a deficit (>T) is on-track, a surplus (<-T) is at-odds, near-maintenance holds", () => {
    const rnd = mulberry32(701);
    for (let i = 0; i < 4000; i++) {
      const bal = Math.round((rnd() - 0.5) * 6000); // −3000..3000
      const a = getPhaseAlignment("cut", bal);
      expect(a).not.toBeNull();
      if (bal > T) expect(a!.state).toBe("on-track");
      else if (bal < -T) expect(a!.state).toBe("at-odds");
      else expect(a!.state).toBe("maintaining");
    }
  });

  it("lean bulk: a surplus (<-T) is on-track, a deficit (>T) is at-odds — the mirror of cut", () => {
    const rnd = mulberry32(702);
    for (let i = 0; i < 4000; i++) {
      const bal = Math.round((rnd() - 0.5) * 6000);
      const a = getPhaseAlignment("lean bulk", bal);
      expect(a).not.toBeNull();
      if (bal < -T) expect(a!.state).toBe("on-track");
      else if (bal > T) expect(a!.state).toBe("at-odds");
      else expect(a!.state).toBe("maintaining");
    }
  });

  it("cut and lean bulk disagree on every NON-maintenance balance (truly directional)", () => {
    const rnd = mulberry32(703);
    for (let i = 0; i < 2000; i++) {
      // A balance comfortably outside the maintenance band.
      const bal = (rnd() < 0.5 ? 1 : -1) * (T + 1 + Math.round(rnd() * 2000));
      const cut = getPhaseAlignment("cut", bal)!.state;
      const bulk = getPhaseAlignment("lean bulk", bal)!.state;
      // One is on-track, the other at-odds — never the same.
      expect(new Set([cut, bulk])).toEqual(new Set(["on-track", "at-odds"]));
    }
  });

  it("recomp is always 'maintaining'; an unset/maintain goal yields no framing", () => {
    const rnd = mulberry32(704);
    for (let i = 0; i < 1000; i++) {
      const bal = Math.round((rnd() - 0.5) * 6000);
      expect(getPhaseAlignment("recomp", bal)!.state).toBe("maintaining");
      expect(getPhaseAlignment(undefined, bal)).toBeNull();
      expect(getPhaseAlignment("maintain", bal)).toBeNull();
    }
  });
});
