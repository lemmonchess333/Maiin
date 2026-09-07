import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "vite";

const sentinel = "synthetic-debug-token-must-never-be-published";
let envDir: string;

beforeEach(() => {
  envDir = mkdtempSync(resolve(tmpdir(), "tropos-build-env-"));
  vi.stubEnv("VITE_APP_CHECK_DEBUG_TOKEN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(envDir, { recursive: true, force: true });
});

function config(command: "build" | "serve", mode = "production") {
  return resolveConfig(
    { configFile: resolve("vite.config.ts"), envDir, mode, logLevel: "silent" },
    command
  );
}

describe("release App Check debug-token guard", () => {
  it("refuses an environment token without printing its value", async () => {
    vi.stubEnv("VITE_APP_CHECK_DEBUG_TOKEN", sentinel);
    const result = await config("build").then(
      () => "BUILD_ACCEPTED",
      (error: Error) => error.message
    );
    expect(result).toContain(
      "Refusing to build with VITE_APP_CHECK_DEBUG_TOKEN"
    );
    expect(result).not.toContain(sentinel);
  });

  it.each(["production", "staging", "test"])(
    "refuses a token loaded from .env.local in %s mode",
    async (mode) => {
      delete process.env.VITE_APP_CHECK_DEBUG_TOKEN;
      writeFileSync(
        resolve(envDir, ".env.local"),
        `VITE_APP_CHECK_DEBUG_TOKEN=${sentinel}\n`
      );
      const result = await config("build", mode).then(
        () => "BUILD_ACCEPTED",
        (error: Error) => error.message
      );
      expect(result).toContain(
        "Refusing to build with VITE_APP_CHECK_DEBUG_TOKEN"
      );
      expect(result).not.toContain(sentinel);
    }
  );

  it("allows a release without a debug token", async () => {
    await expect(config("build")).resolves.toMatchObject({ command: "build" });
  });

  it("keeps local development with a debug token available", async () => {
    vi.stubEnv("VITE_APP_CHECK_DEBUG_TOKEN", sentinel);
    await expect(config("serve", "development")).resolves.toMatchObject({
      command: "serve",
    });
  });
});
