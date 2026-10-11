/**
 * The one seeded random-number generator for tests, property suites, the
 * simulator and seed scripts. Thirteen files used to carry their own copy of
 * this function; a seeded run is only reproducible if every caller draws the
 * same sequence from the same seed, so there is one copy, and
 * `prng.test.ts` pins its first draws.
 *
 * mulberry32: a 32-bit state, fast, and good enough for picking test
 * inputs. Not for anything that needs to be unpredictable.
 */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
