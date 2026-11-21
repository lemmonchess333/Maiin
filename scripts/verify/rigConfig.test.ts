/**
 * The rig builds what the capture job builds. The feature map's anchors
 * are the ones the capture specs wait on in CI; served a differently built
 * bundle, the rig would be checking another app.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs } from "./cli";
import {
  BUILD_ENV_REMOVED,
  buildEnv,
  buildHash,
  localDate,
  ours,
  seedKey,
} from "./rig";
import {
  ACCOUNTS,
  BUILD_ENV,
  FIREBASE_TOOLS,
  PROJECT,
  REWRITES_OUTPUT,
} from "./rigConfig";

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

  it("signs in as the season athlete with the seed's own credentials", () => {
    const seed = readFileSync(
      resolve(process.cwd(), "scripts/seed-season-athlete.ts"),
      "utf8"
    );
    const block = seed.slice(seed.indexOf("export const SEASON_USER"));
    expect(block).toContain(`email: "${ACCOUNTS.season.email}"`);
    expect(block).toContain(`password: "${ACCOUNTS.season.password}"`);
  });

  it("leaves out the plugin that rewrites the output, by its real name", () => {
    const config = readFileSync(
      resolve(process.cwd(), "vite.config.ts"),
      "utf8"
    );
    expect(config).toContain(`name: "${REWRITES_OUTPUT}"`);
  });
});

describe("the verify build's environment and cache key", () => {
  it("drops what would make another build, and sets the emulator values", () => {
    const env = buildEnv({
      PATH: "/bin",
      HOSTING_TARGET: "firebase",
      CAPACITOR_BUILD: "true",
      VITE_APP_CHECK_DEBUG_TOKEN: "secret",
      VITE_USE_EMULATORS: "false",
    });
    for (const k of BUILD_ENV_REMOVED) expect(env[k], k).toBeUndefined();
    expect(env.VITE_USE_EMULATORS).toBe("true");
    expect(env.PATH).toBe("/bin");
  });

  it("changes with a VITE_ value the build would see", () => {
    const a = buildHash(buildEnv({ VITE_SOMETHING: "1" }));
    const b = buildHash(buildEnv({ VITE_SOMETHING: "2" }));
    expect(a).not.toBe(b);
    expect(buildHash(buildEnv({ OTHER: "1" }))).toBe(
      buildHash(buildEnv({ OTHER: "2" }))
    );
  });

  it("reseeds on a new day: the seeds write today", () => {
    const today = new Date(2026, 10, 21, 23, 59);
    const tomorrow = new Date(2026, 10, 22, 0, 1);
    expect(localDate(today)).toBe("2026-11-21");
    expect(seedKey(today)).not.toBe(seedKey(tomorrow));
    expect(seedKey(today)).toBe(seedKey(new Date(2026, 10, 21, 8, 0)));
  });

  it("kills a stored pid only while it still runs the rig's command", () => {
    expect(ours(process.pid, /emulators:start/)).toBe(false);
    expect(ours(process.pid, /node|vitest/)).toBe(true);
    expect(ours(2 ** 22 + 1, /./)).toBe(false);
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

  it("refuses an empty feature list, which would pass having driven nothing", () => {
    expect(() => parseArgs(["--features", ""])).toThrow(/at least one/);
    expect(() => parseArgs(["--features", " , "])).toThrow(/at least one/);
  });

  it("seeds emulators it did not start only when asked", () => {
    expect(parseArgs([]).seedExternal).toBe(false);
    expect(parseArgs(["--seed"]).seedExternal).toBe(true);
  });

  it("refuses an unknown flag or a bad round count", () => {
    expect(() => parseArgs(["--feature", "home"])).toThrow(/Unknown flag/);
    expect(() => parseArgs(["--repeat", "0"])).toThrow(/whole number/);
    expect(() => parseArgs(["--out"])).toThrow(/needs a value/);
  });
});
