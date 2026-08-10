/**
 * Every npm script must name a binary that exists, and every file it
 * points at must be on disk.
 *
 * WHY THIS EXISTS (2026-08-10). `seed:fellbehind` ran `vite-node
 * scripts/seed-fellbehind-capture.ts`. `vite-node` was never a dependency
 * of this repo — it used to arrive transitively under `vitest`, and
 * vitest 4 stopped shipping it as a separate package. The vitest 4 bump
 * (#1838) landed BEFORE the script (#1881), so the script never worked
 * here at all.
 *
 * The consequence was quiet and expensive. That script is a step in
 * `app-screenshots.yml`, the design-review capture channel — the one
 * CLAUDE.md mandates for any visual PR ("no visual churn without
 * screenshots", the D15 lesson). The step failed with `sh: 1: vite-node:
 * not found`, the capture aborted before taking a single frame, and the
 * commit step's `no screenshots produced; exit 0` branch swallowed the
 * rest. So the channel had been dead since #1881 and the only signal was
 * a red job on a workflow nobody runs unless they are already mid-review.
 *
 * Neither `tsc` nor ESLint nor the test suite looks at the `scripts`
 * block. Nothing did. This does.
 *
 * It is deliberately shallow — it does not run anything. It answers the
 * one question that was unanswered: does the thing this script invokes
 * actually exist in a fresh `npm ci` tree?
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, globSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

/**
 * Commands that come from the OS or from npm itself rather than from
 * `node_modules/.bin`. Anything NOT on this list has to be a real local
 * binary — which is the check that matters.
 */
const SYSTEM = new Set([
  "node",
  "npm",
  "npx",
  "echo",
  "exit",
  "cd",
  "rm",
  "mkdir",
  "cp",
  "mv",
  "true",
  "false",
  // Installed GLOBALLY, not as a dependency. This exemption is not taken
  // on trust — the test below asserts a workflow actually installs it, so
  // removing `npm install -g firebase-tools` from CI turns the exemption
  // back into a failure instead of leaving a script that resolves nowhere.
  "firebase",
]);

/** Commands exempted above because CI installs them globally. */
const GLOBALLY_INSTALLED = [["firebase", "firebase-tools"]] as const;

/** `FOO=bar cmd` — strip leading env assignments to find the real command. */
function commandsIn(script: string): string[] {
  return script
    .split(/&&|\|\||;/)
    .map((segment) => {
      const words = segment.trim().split(/\s+/).filter(Boolean);
      while (words.length && /^[A-Z_][A-Z0-9_]*=/.test(words[0])) words.shift();
      return words[0] ?? "";
    })
    .filter(Boolean);
}

describe("globally-installed exemptions are earned", () => {
  it.each(GLOBALLY_INSTALLED)(
    "%s is installed by at least one workflow",
    (_cmd, pkgName) => {
      const workflows = globSync(".github/workflows/*.yml", { cwd: ROOT }).map(
        (f) => readFileSync(resolve(ROOT, f), "utf8")
      );
      expect(workflows.length).toBeGreaterThan(0);
      expect(
        workflows.some((w) => w.includes(`npm install -g ${pkgName}`)),
        `no workflow installs ${pkgName}, so exempting it from the binary check is unfounded`
      ).toBe(true);
    }
  );
});

describe("npm scripts point at things that exist", () => {
  const entries = Object.entries(pkg.scripts);

  it("there are scripts to check", () => {
    // Guard the guard — an empty list would make every case below vacuous.
    expect(entries.length).toBeGreaterThan(10);
  });

  it.each(entries)("%s — its binary is installed", (_name, script) => {
    for (const cmd of commandsIn(script)) {
      if (SYSTEM.has(cmd)) continue;
      // A script may delegate to another script via `npm run x`, which the
      // `npm` entry above already covers.
      expect(
        existsSync(resolve(ROOT, "node_modules/.bin", cmd)),
        `"${cmd}" is not in node_modules/.bin — it is neither a dependency nor a system command, so this script fails on a fresh npm ci. (This is exactly how the screenshot capture channel broke: vite-node stopped shipping with vitest 4.)`
      ).toBe(true);
    }
  });

  it.each(entries)("%s — the files it names exist", (_name, script) => {
    // Any repo-relative path under scripts/, e2e/ or src/ that a script
    // hands to a runner. A typo'd path fails at run time only.
    // (Illustrative example paths are deliberately NOT written here —
    // deadPathReferences.test.ts scans comments for file citations and
    // correctly flags invented ones, which is how this line got rewritten.)
    const paths =
      script.match(/(?:^|\s)((?:scripts|e2e|src)\/[\w./-]+)/g) ?? [];
    for (const raw of paths) {
      const path = raw.trim();
      expect(
        existsSync(resolve(ROOT, path)),
        `"${path}" does not exist but is named by an npm script`
      ).toBe(true);
    }
  });
});
