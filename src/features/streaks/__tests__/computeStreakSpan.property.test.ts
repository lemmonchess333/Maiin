/**
 * Property-based guard for the streak grace-forgiveness invariants (Streak1).
 *
 * The calm forgiveness model: a single off-day inside a run is BRIDGED, but
 * "never miss twice" and "≤1 forgiven day per rolling 7" must hold. The example
 * tests in computeCurrentStreak.test.ts pin crafted cases; this fuzzes ~3000
 * random active-date sets and asserts the structural invariants on the returned
 * `bridgedDates` for EVERY one — so a subtle walk-order or spacing regression
 * can't slip past hand-picked fixtures.
 *
 * Deterministic: seeded PRNG, fixed `now` (mid-May, clear of DST).
 */
import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { computeStreakSpan } from "../useStreaks";

const NOW = new Date("2026-05-15T12:00:00");
const GRACE_MIN_SPACING_DAYS = 7; // mirror of the engine constant
const WINDOW = 45; // generate active days within the last 45 days

const dayKey = (offset: number) =>
  format(new Date(NOW.getTime() - offset * 86400000), "yyyy-MM-dd");

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

/** A random active-date set: each of the last WINDOW days is active with prob p. */
function genActiveSet(rnd: () => number, p: number): Set<string> {
  const set = new Set<string>();
  for (let off = 0; off <= WINDOW; off++) {
    if (rnd() < p) set.add(dayKey(off));
  }
  return set;
}

/** Calendar-day distance between two YYYY-MM-DD keys. */
function daysApart(a: string, b: string): number {
  const ms =
    new Date(a + "T12:00:00").getTime() - new Date(b + "T12:00:00").getTime();
  return Math.abs(Math.round(ms / 86400000));
}

describe("computeStreakSpan grace invariants (property-based)", () => {
  it("every bridged day is a genuine GAP (never an active day)", () => {
    const rnd = mulberry32(11);
    for (let i = 0; i < 3000; i++) {
      const active = genActiveSet(rnd, 0.3 + rnd() * 0.6);
      const { bridgedDates } = computeStreakSpan(active, NOW);
      for (const b of bridgedDates) {
        expect(active.has(b)).toBe(false);
      }
    }
  });

  it("bridged days are ≥7 calendar days apart (never miss twice / ≤1 per rolling 7)", () => {
    const rnd = mulberry32(22);
    for (let i = 0; i < 3000; i++) {
      const active = genActiveSet(rnd, 0.3 + rnd() * 0.6);
      const { bridgedDates } = computeStreakSpan(active, NOW);
      const sorted = [...bridgedDates].sort();
      for (let k = 1; k < sorted.length; k++) {
        expect(daysApart(sorted[k], sorted[k - 1])).toBeGreaterThanOrEqual(
          GRACE_MIN_SPACING_DAYS
        );
      }
    }
  });

  it("streak ≥ 0, includes the bridged days, and is deterministic", () => {
    const rnd = mulberry32(33);
    for (let i = 0; i < 3000; i++) {
      const active = genActiveSet(rnd, 0.2 + rnd() * 0.7);
      const a = computeStreakSpan(active, NOW);
      const b = computeStreakSpan(active, NOW);
      expect(a.streak).toBeGreaterThanOrEqual(0);
      // A non-zero streak counts at least its bridged (forgiven) days.
      if (a.streak > 0)
        expect(a.streak).toBeGreaterThanOrEqual(a.bridgedDates.length);
      // Same input → same output (no hidden clock / order dependence).
      expect(b).toEqual(a);
    }
  });

  it("an all-inactive window yields a zero streak with no bridges", () => {
    // Sanity anchor: nothing today/yesterday → broken, nothing bridged.
    const old = new Set([dayKey(20), dayKey(25)]); // both well before yesterday
    const { streak, bridgedDates } = computeStreakSpan(old, NOW);
    expect(streak).toBe(0);
    expect(bridgedDates).toEqual([]);
  });
});
