/**
 * The activation journey has a release switch (`ACTIVATION_JOURNEY_V2_ENABLED`),
 * and a profile's version marker means v2 only while it is on. A screen that
 * compares the marker itself keeps the v2 journey running with the switch
 * off, so every reader goes through `isActivationJourneyV2`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === "__tests__" || name === "test" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the activation journey's release switch", () => {
  it("governs every reader of a profile's journey version", () => {
    const readers = sourceFiles(SRC)
      .filter((file) =>
        /\bprofile\??\.activationJourneyVersion\s*===/.test(
          readFileSync(file, "utf8")
        )
      )
      .map((file) => relative(SRC, file));
    expect(readers).toEqual(["lib/activationJourney.ts"]);
  });
});
