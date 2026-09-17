/**
 * Every emulator-gated rules suite is actually run by a rules command.
 *
 * Two lists describe the same set and are maintained separately:
 *
 *   vitest.config.ts   collects them by GLOB — "firestore.*.test.ts",
 *                      "storage.rules.test.ts"
 *   package.json       runs them by NAME — `test:rules` passes seven
 *                      files to vitest explicitly, `test:rules:storage`
 *                      one more
 *
 * A glob grows on its own; an explicit list does not. So a new rules
 * suite is collected by the project, finds no `FIRESTORE_EMULATOR_HOST`
 * in an ordinary run, and self-skips — landing silently among the eight
 * skips every unit run already reports — while never being passed to the
 * one command that boots an emulator. It would be green everywhere and
 * executed nowhere, which for a security rule is the difference between
 * a test and a comment.
 *
 * The config already carries half of this warning, from the other
 * direction: "a project must include them or that command runs zero
 * tests and passes vacuously". This is the same hazard with the lists
 * swapped, and the same shape as `captureSeedChain.test.ts`, which pins
 * the two capture seed chains identical for the same reason.
 *
 * The lists agree today. This keeps them agreeing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));

/** Root-level suites the vitest "node" project picks up by glob. */
function emulatorGatedSuites(): string[] {
  return readdirSync(repoRoot)
    .filter(
      (f) =>
        (/^firestore\..*\.test\.ts$/.test(f) ||
          f === "storage.rules.test.ts") &&
        readFileSync(resolve(repoRoot, f), "utf8").includes(
          "FIRESTORE_EMULATOR_HOST"
        )
    )
    .sort();
}

/** Filenames named by any `test:rules*` script. */
function suitesRunByScripts(): string[] {
  const scripts: Record<string, string> = pkg.scripts ?? {};
  const named = Object.entries(scripts)
    .filter(([name]) => name.startsWith("test:rules"))
    .flatMap(([, cmd]) => cmd.match(/[\w.]+\.test\.ts/g) ?? []);
  return [...new Set(named)].sort();
}

describe("rules suites are run, not merely collected", () => {
  it("finds the suites and the scripts at all", () => {
    /* Both halves anchored, so the comparison below cannot pass by
       comparing two empty lists — the failure mode that makes a guard
       look present while holding nothing. */
    expect(emulatorGatedSuites().length).toBeGreaterThan(4);
    expect(suitesRunByScripts().length).toBeGreaterThan(4);
  });

  it("every emulator-gated suite is named by a test:rules* script", () => {
    const onDisk = emulatorGatedSuites();
    const run = new Set(suitesRunByScripts());
    const orphaned = onDisk.filter((f) => !run.has(f));
    expect(
      orphaned,
      `${orphaned.join(", ")} self-skip without an emulator and are not ` +
        `passed to any test:rules* script, so they run nowhere. Add them ` +
        `to the command that boots the emulator they need.`
    ).toEqual([]);
  });

  it("no script names a suite that no longer exists", () => {
    /* The reverse rot: a renamed or deleted suite left in the command
       means vitest is handed a path it cannot resolve, and the failure
       reads as a tooling problem rather than a stale script. */
    const onDisk = new Set(emulatorGatedSuites());
    const missing = suitesRunByScripts().filter((f) => !onDisk.has(f));
    expect(
      missing,
      `test:rules* names ${missing.join(", ")}, which is not an ` +
        `emulator-gated suite at the repo root.`
    ).toEqual([]);
  });
});
