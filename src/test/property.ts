import fc, { type IProperty, type Parameters } from "fast-check";

/**
 * Property tests through fast-check, seeded so a run is reproducible.
 *
 * fast-check draws inputs at random and, when a property fails, shrinks
 * the input to the smallest counterexample it can find, which
 * `mulberry32` (`prng.ts`) does not do. The seed is fixed for the same
 * reason `prng.ts`'s callers fix theirs and CI's `unit-shuffle` fixes its
 * order: a property that found a new counterexample on an unrelated pull
 * request's run would redden it for a reason that pull request did not
 * cause. Explore with another seed locally:
 *
 *   FC_SEED=7 FC_RUNS=2000 npx vitest run src/lib/__tests__/gps.property.test.ts
 *
 * and turn what it finds into an example test with that input.
 *
 * Every call passes its own `{ seed, numRuns }`, never
 * `fc.configureGlobal`: global settings are mutable state shared by every
 * file a worker runs, the shape `unit-shuffle` caught three times.
 */

/** The seed every property runs with unless `FC_SEED` names another. */
export const PROPERTY_SEED = 20_261_118;

/** Runs per property unless `FC_RUNS` says otherwise. The suite runs about
 *  eight times in CI (one job per timezone, locale, clock and order), so a
 *  property is kept to a hundred inputs. */
export const PROPERTY_RUNS = 100;

function envInt(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

/** The seed and the number of runs for one property. */
export function propertyOptions(): { seed: number; numRuns: number } {
  return {
    seed: envInt("FC_SEED") ?? PROPERTY_SEED,
    numRuns: Math.max(1, envInt("FC_RUNS") ?? PROPERTY_RUNS),
  };
}

/**
 * `fc.assert` with the seed and the number of runs. `extra` may lower
 * `numRuns` for a costly property; it may not change the seed.
 */
export function assertProperty<Ts>(
  property: IProperty<Ts>,
  extra: Omit<Parameters<Ts>, "seed"> = {}
): void {
  const options = propertyOptions();
  fc.assert(property, {
    ...options,
    ...extra,
    numRuns: Math.min(options.numRuns, extra.numRuns ?? options.numRuns),
    seed: options.seed,
  });
}
