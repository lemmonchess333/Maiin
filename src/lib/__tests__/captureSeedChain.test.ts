/**
 * The two capture workflows must seed the same users.
 *
 * `emulator-tests.yml`'s `capture-specs` job is the PR gate; the
 * `app-screenshots.yml` job is what commits frames to the
 * `app-screenshots` branch. They run the SAME specs against SEPARATE
 * copies of the seed chain, and a spec's fixture user is staged by
 * exactly one seed.
 *
 * So a seed added to one list and not the other fails in a way that is
 * hard to read from either end. Missing from the gate, the spec runs
 * against an account that does not exist and reports a login timeout —
 * which looks like a broken helper rather than a missing seed. Missing
 * from the screenshot job, the spec is skipped there and its frame comes
 * back as `removed` in the diff report — the signal CLAUDE.md already
 * warns is usually a truncated run, so the real cause is the one thing a
 * reader has been told to discount.
 *
 * Nothing checked this. The chains were kept in step by hand across every
 * seed the rig has, and the parity held only because each author happened
 * to remember the second file.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

/**
 * The seeds a workflow runs before the capture specs, in order.
 *
 * Scoped to the line that invokes the capture specs: `emulator-tests.yml`
 * runs several other `emulators:exec` commands (rules suites, functions
 * suites) whose seeds are their own business.
 */
function captureSeedChain(workflow: string): string[] {
  const src = readFileSync(
    resolve(ROOT, ".github/workflows", workflow),
    "utf8"
  );
  const lines = src
    .split("\n")
    .filter(
      (l) => l.includes("capture.spec.ts") && l.includes("npm run seed:")
    );
  expect(
    lines,
    `${workflow} should invoke the capture specs on exactly one line ` +
      `alongside its seeds; found ${lines.length}`
  ).toHaveLength(1);
  return [...lines[0].matchAll(/npm run (seed:[A-Za-z0-9:_-]+)/g)].map(
    (m) => m[1]
  );
}

describe("capture workflows — one seed chain, two files", () => {
  const gate = captureSeedChain("emulator-tests.yml");
  const shots = captureSeedChain("app-screenshots.yml");

  it("the PR gate and the screenshot job seed identically", () => {
    expect(
      gate,
      "emulator-tests.yml (the PR gate) and app-screenshots.yml (the " +
        "frame source) must run the same seeds in the same order — a spec " +
        "whose user is staged by only one of them fails in the other, and " +
        "neither failure names the missing seed"
    ).toEqual(shots);
  });

  it("seeds the chain actually has, so this is not vacuous", () => {
    /* An empty extraction would satisfy the equality above. */
    expect(gate.length).toBeGreaterThan(3);
    expect(gate).toContain("seed:e2e");
  });

  it("every seed in the chain is a real npm script", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(ROOT, "package.json"), "utf8")
    ) as { scripts: Record<string, string> };
    for (const seed of gate) {
      expect(
        pkg.scripts[seed],
        `${seed} is run by the capture workflows but is not in package.json`
      ).toBeTruthy();
    }
  });
});
