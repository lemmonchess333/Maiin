/**
 * Shift the process clock, for running the unit suite at a future date.
 *
 * Loaded through `--require`, so it reaches Vitest's worker processes the
 * same way `deny-unit-network.cjs` does. Absent or malformed configuration
 * is a no-op, which is what every ordinary run gets.
 *
 *   TROPOS_CLOCK_OFFSET_DAYS=90   shift forward (or back) by N days
 *   TROPOS_CLOCK_AT=2027-03-15    shift to an absolute instant
 *
 * Why an OFFSET is the one CI uses: an absolute date in a workflow file
 * is itself a literal that expires, which is the exact failure this
 * script exists to find. The offset is always relative to the run.
 *
 * What it is for: a test fixture carrying a date literal sits inside
 * whatever window the code under test applies — until the clock walks
 * past it. Then the test fails on a calendar date, with no commit, and
 * the failure names the assertion rather than the cause. Two of these
 * were live when this was written: `ExerciseHistory.test.tsx` opens the
 * page on its 3-month range pill against sessions dated 90 days before
 * the break. Running forward turns "will fail one morning" into "fails
 * now, with a quarter's notice".
 *
 * Only `new Date()` with no arguments and `Date.now()` move. Every
 * explicit construction — `new Date("2026-07-20")`, `new Date(ms)` — is
 * passed through untouched, so a fixture's literals still mean what they
 * say, and only the notion of "now" changes.
 */
const at = process.env.TROPOS_CLOCK_AT;
const days = process.env.TROPOS_CLOCK_OFFSET_DAYS;

let offset = 0;
if (at) {
  const parsed = Date.parse(at);
  if (!Number.isFinite(parsed)) {
    throw new Error(`fake-clock: TROPOS_CLOCK_AT is not a date: ${at}`);
  }
  offset = parsed - Date.now();
} else if (days) {
  const n = Number(days);
  if (!Number.isFinite(n)) {
    throw new Error(
      `fake-clock: TROPOS_CLOCK_OFFSET_DAYS is not a number: ${days}`
    );
  }
  offset = n * 86400000;
}

if (offset !== 0) {
  const RealDate = Date;
  class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }
    static now() {
      return RealDate.now() + offset;
    }
  }
  globalThis.Date = ShiftedDate;
}
