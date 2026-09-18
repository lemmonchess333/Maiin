/**
 * `unit` is the job the repository ruleset requires, so what that job
 * runs is what gates a merge.
 *
 * Measured 2026-09-18 from the API rather than from the settings page —
 * a squash-merge attempted while the checks were still running was
 * refused with:
 *
 *   405 Repository rule violations found
 *   Required status check "unit" is queued.
 *
 * Three documents said the opposite. `ci.yml`'s own header ("Until then
 * this runs and reports red but does not block auto-merge"), the
 * operator checklist in `docs/agents/app-improvement-prompt.md`, and
 * CLAUDE.md's `firebase` row, which built an argument on it: that a
 * `firebase` minor carrying +62 kB gzip could ride a red
 * `check:dist-size` straight past auto-merge, because the ratchet runs
 * in a job nothing required. It cannot. The ratchet is a STEP of `unit`.
 *
 * That composition is the half this file can hold, and it is the half
 * worth holding. A test cannot read a GitHub ruleset, and a guard that
 * banned the prose would be pinning an unobservable external fact —
 * worse than no guard, because it would still read as authoritative if
 * the setting were ever removed. What IS observable here is which steps
 * sit inside the required job: move the size ratchet, the suite or lint
 * out of `unit` and into a job nothing requires, and the gate is gone
 * with nothing else to say so.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ci = readFileSync(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8");

/** The job name the ruleset requires, exactly as the API reports it. */
const REQUIRED_JOB = "unit";

/**
 * The body of one top-level job: everything from its key to the next
 * key at the same indent. Job keys are two-space indented and end the
 * line; the comment blocks between jobs start with `#`, so they cannot
 * be mistaken for one.
 */
function jobBody(name: string): string {
  const lines = ci.split("\n");
  const start = lines.findIndex((l) => l === `  ${name}:`);
  expect(start, `ci.yml has no job named "${name}"`).toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}[a-z][\w-]*:\s*$/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

describe("what the required check actually runs", () => {
  const body = jobBody(REQUIRED_JOB);

  it("extracts one job and stops at the next — not the whole file", () => {
    /* Anti-vacuity. Every assertion below is `toContain` on this string,
       so an extractor that ran to EOF would pass them all while
       examining nothing. `unit-timezone` is the next job and the only
       one that sets TZ from a matrix; seeing that here means the
       boundary was missed. */
    expect(body).toContain("runs-on: ubuntu-latest");
    expect(body).not.toContain("TZ: ${{ matrix.tz }}");
    expect(body).not.toContain("strategy:");
    expect(body.length).toBeLessThan(ci.length / 2);
  });

  it("runs the dist-size ratchet, so a bundle regression blocks a merge", () => {
    expect(body).toContain("npm run check:dist-size");
  });

  it("runs the unit suite", () => {
    expect(body).toContain("npm run test -- --run");
  });

  it("runs lint", () => {
    expect(body).toContain("npm run lint");
  });
});
