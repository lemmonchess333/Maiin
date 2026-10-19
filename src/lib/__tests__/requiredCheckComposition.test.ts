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
 * the QA backlog's `firebase` row, which built an argument on it: that a
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
 *
 * The second half holds `npm run verify` to the same job. CLAUDE.md tells
 * every contributor to run it before pushing, as "everything CI's unit
 * job blocks a merge on", and it was not that: the job ran the deploy
 * verifiers' offline tests, which verify did not, and verify ran
 * `check:form-drafts`, which no workflow ran at all. A push that passed
 * verify could still go red at the gate.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ci = readFileSync(
  resolve(repoRoot, ".github/workflows/ci.yml"),
  "utf8"
).replace(/\r\n/g, "\n");

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

  it("runs both offline production verifier suites before a merge", () => {
    const verifierStep = body
      .split(/\n {6}- /)
      .find((step) =>
        step.includes("name: Test production deploy verifiers (offline)")
      );
    expect(
      verifierStep,
      "required unit verifier step is missing"
    ).toBeDefined();
    expect(verifierStep).toContain(
      "python3 -m unittest discover -s scripts -p 'test_verify*.py' -v"
    );
    expect(verifierStep).toContain(
      "node --test scripts/rollover-deployed-challenges.test.mjs"
    );
    expect(verifierStep).not.toContain("continue-on-error");
  });
});

const pkg = JSON.parse(
  readFileSync(resolve(repoRoot, "package.json"), "utf8")
) as { scripts: Record<string, string> };

/** The scripts a block of workflow text runs with `npm run`, comment
 *  lines skipped. */
function npmRunNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    for (const m of trimmed.matchAll(/npm run ([\w:-]+)/g)) names.add(m[1]);
  }
  return names;
}

/** The shell commands inside the verifier step's `run: |` block. */
function verifierCommands(body: string): string[] {
  const step = body
    .split(/\n {6}- /)
    .find((s) =>
      s.includes("name: Test production deploy verifiers (offline)")
    );
  expect(step, "required unit verifier step is missing").toBeDefined();
  const lines = step!.split("\n");
  const start = lines.findIndex((l) => /^ {8}run: \|\s*$/.test(l));
  expect(
    start,
    "the verifier step's run block is not a `run: |`"
  ).toBeGreaterThan(-1);
  return lines
    .slice(start + 1)
    .filter((l) => l.startsWith(" ".repeat(10)))
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

describe("`npm run verify` runs what the required check runs", () => {
  const body = jobBody(REQUIRED_JOB);
  const verify = pkg.scripts.verify.split("&&").map((part) => part.trim());

  it("is made only of npm scripts, so every part of it is counted below", () => {
    expect(verify.length).toBeGreaterThan(4);
    for (const part of verify) expect(part).toMatch(/^npm run [\w:-]+$/);
  });

  it("runs the verifier step's commands through `test:verifiers`, exactly", () => {
    const commands = verifierCommands(body);
    expect(commands.length).toBe(2);
    expect(
      pkg.scripts["test:verifiers"].split("&&").map((part) => part.trim())
    ).toEqual(commands);
  });

  it("runs every check the required job runs, and none it does not", () => {
    // The verifier step runs its commands directly (other guards read
    // them there), and the test above proves `test:verifiers` is them.
    const job = new Set([...npmRunNames(body), "test:verifiers"]);
    const local = new Set(verify.map((part) => part.replace(/^npm run /, "")));
    expect([...local].sort()).toEqual([...job].sort());
  });
});
