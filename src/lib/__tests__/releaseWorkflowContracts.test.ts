/** Release wiring that compiles green while changing what people receive:
 * the production route-planning flag and the screenshot comparison baseline. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function steps(workflow: string): string[] {
  return readFileSync(resolve(repoRoot, ".github/workflows", workflow), "utf8")
    .replace(/\r\n/g, "\n")
    .split(/^ {6}- /m)
    .slice(1);
}

function onlyStep(workflow: string, content: string): string {
  const found = steps(workflow).filter((step) => step.includes(content));
  expect(
    found,
    `${workflow}: expected one step containing ${content}`
  ).toHaveLength(1);
  return found[0];
}

/** These workflow conditions use the same boolean/string operators as JS.
 * Execute the actual scalar against Actions-style outcomes; a status check
 * function suppresses Actions' implicit success() prerequisite. */
function runs(step: string, outcome: string, status: string): boolean {
  const scalar = /^ {8}if: (.+)$/m.exec(step)?.[1] ?? "success()";
  const expression = scalar.replace(/^\$\{\{\s*|\s*\}\}$/g, "");
  const statusCheck = /\b(?:always|success|failure|cancelled)\s*\(/.test(
    expression
  );
  return (
    (statusCheck || status === "success") &&
    Boolean(
      runInNewContext(expression, {
        always: () => true,
        success: () => status === "success",
        failure: () => status === "failure",
        cancelled: () => status === "cancelled",
        steps: { capture: { outcome } },
      })
    )
  );
}

describe("road routing is enabled in every production build", () => {
  it.each([
    ["deploy-hosting.yml", "build:hosting"],
    ["deploy.yml", "build"],
    ["deploy-ios.yml", "build:ios"],
  ])("%s supplies the flag to its actual %s step", (workflow, script) => {
    const build = steps(workflow).filter((step) =>
      new RegExp(`(?:^|\\n)\\s*run: npm run ${script}$`, "m").test(step)
    );
    expect(build).toHaveLength(1);
    expect(build[0]).toMatch(/^ {10}VITE_ROUTE_PLANNING_ENABLED: "true"$/m);
  });
});

describe("screenshot baselines only come from complete successful runs", () => {
  const workflow = "app-screenshots.yml";

  it("identifies the capture whose outcome gates publication", () => {
    const capture = onlyStep(workflow, "id: capture");
    expect(capture).toContain("npm run test:e2e -- capture.spec.ts");
  });

  it.each([
    ["success", "success", true],
    ["failure", "failure", false],
    ["cancelled", "cancelled", false],
    ["skipped", "success", false],
    // A successful capture still cannot publish after a failed diff or
    // after a newer run has cancelled this one.
    ["success", "failure", false],
    ["success", "cancelled", false],
  ] as const)("capture=%s, job=%s publishes=%s", (outcome, status, publish) => {
    const commit = onlyStep(workflow, "git push -f origin app-screenshots");
    expect(runs(commit, outcome, status)).toBe(publish);
  });

  it.each([
    ["failure", "failure"],
    ["cancelled", "cancelled"],
    ["skipped", "failure"],
    ["success", "failure"],
  ])(
    "keeps capture=%s, job=%s available as a review artifact",
    (outcome, status) => {
      const artifact = onlyStep(workflow, "uses: actions/upload-artifact@");
      expect(runs(artifact, outcome, status)).toBe(true);
      expect(artifact).toMatch(/^ {12}screenshots\/$/m);
      expect(artifact).toMatch(/^ {12}screenshot-diff\/$/m);
      expect(artifact).toMatch(/^ {10}if-no-files-found: ignore$/m);
    }
  );
});
