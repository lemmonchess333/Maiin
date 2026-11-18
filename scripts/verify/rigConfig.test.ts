/**
 * The rig builds what the capture job builds. The feature map's anchors
 * are the ones the capture specs wait on in CI; served a differently built
 * bundle, the rig would be checking another app.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs } from "./cli";
import { BUILD_ENV, FIREBASE_TOOLS, PROJECT } from "./rigConfig";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/emulator-tests.yml"),
  "utf8"
);

/** The env block of the capture job's emulator build step. */
function captureBuildEnv(): Record<string, string> {
  const job = workflow.slice(workflow.indexOf("capture-specs:"));
  const step = job.slice(job.indexOf("run: npm run build:e2e"));
  const env: Record<string, string> = {};
  for (const line of step.split("\n").slice(2)) {
    const m = /^\s+(VITE_[A-Z_]+):\s*"?([^"]*)"?\s*$/.exec(line);
    if (!m) break;
    env[m[1]] = m[2];
  }
  return env;
}

describe("the verify rig's configuration", () => {
  it("builds with the capture job's environment", () => {
    const ci = captureBuildEnv();
    expect(Object.keys(ci).length).toBeGreaterThan(4);
    expect(BUILD_ENV).toEqual(ci);
  });

  it("uses the firebase-tools release CI installs", () => {
    expect(workflow).toContain(`npm install -g ${FIREBASE_TOOLS}`);
  });

  it("targets a demo project, which never reaches a real one", () => {
    expect(PROJECT.startsWith("demo-")).toBe(true);
  });
});

describe("verify:app's flags", () => {
  it("defaults to the branch's changes against origin/main", () => {
    expect(parseArgs([])).toMatchObject({
      mode: "diff",
      base: "origin/main",
      repeat: 1,
    });
  });

  it("reads features, rounds and a base", () => {
    expect(
      parseArgs(["--features", "home, food", "--repeat", "3"])
    ).toMatchObject({ mode: "features", ids: ["home", "food"], repeat: 3 });
    expect(parseArgs(["--diff", "abc123"]).base).toBe("abc123");
    expect(parseArgs(["--diff", "--rebuild"]).base).toBe("origin/main");
  });

  it("refuses an unknown flag or a bad round count", () => {
    expect(() => parseArgs(["--feature", "home"])).toThrow(/Unknown flag/);
    expect(() => parseArgs(["--repeat", "0"])).toThrow(/whole number/);
    expect(() => parseArgs(["--out"])).toThrow(/needs a value/);
  });
});
