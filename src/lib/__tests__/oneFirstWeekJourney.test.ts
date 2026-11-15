/**
 * Every account takes the one first-week journey (App1, whole-app grill
 * Q27). The comparison group, the server's switch and the older journey
 * (Home's walk, the first meal and three weigh-ins) are gone, and an
 * account's stamped `activationJourneyVersion` (2, 1, or none) decides
 * nothing in the app: it stays on the profile for app builds from before
 * App1, which still read it.
 *
 * A screen that reads the marker again would bring a split back without a
 * decision, so no source reads it.
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

describe("the one first-week journey", () => {
  it("no screen reads a profile's journey version", () => {
    const readers = sourceFiles(SRC)
      .filter((file) =>
        /\.activationJourneyVersion\b/.test(readFileSync(file, "utf8"))
      )
      .map((file) => relative(SRC, file));
    expect(readers).toEqual([]);
  });
});
