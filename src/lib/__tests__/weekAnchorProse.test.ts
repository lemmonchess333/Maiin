/**
 * The week anchor is Monday, and the prose has to say so.
 *
 * `WEEK_STARTS_ON` moved to Monday with schema v4 (RunWk2). The CODE was
 * migrated; ten comments and type docs across seven files were not, and
 * they read as authoritative — two of them are the field docs for the
 * two `weekKey` fields a reader consults to learn what a persisted value
 * means, and each was contradicted by code in its own file or a direct
 * sibling. `ScheduledRunDay.weekKey` said "Sunday-start week key" 340
 * lines above the `programSchemaVersion` doc explaining that v4
 * re-anchors every stored key to Monday.
 *
 * Nothing catches a wrong comment, so this bans the two phrasings that
 * can ONLY be an assertion about the current anchor. It is deliberately
 * narrow. "Sunday-first" is usually right (`Date.getDay()` numbering IS
 * Sunday-first, whatever the anchor), and "the Sunday anchor" is usually
 * the legacy one being described on purpose — `dateHelpers.reanchor`,
 * `runScheduler`'s coincidence note and `programSchemaVersion` all say it
 * correctly. A ban wide enough to catch those would be suppressed rather
 * than obeyed, which is the failure mode `copyCasing`'s header records.
 *
 * Both halves of every mirror are scanned: the server said the same two
 * wrong things the client did (`runReschedule.js`, `programStateSanitizer.js`),
 * which is the standing "the tested copy does not prove the running copy"
 * rule showing up in prose.
 *
 * ALLOWED is empty on purpose. If a future comment genuinely needs one of
 * these phrases, add the file with the reason rather than widening the
 * pattern.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Phrasings that can only assert that the CURRENT anchor is Sunday. */
const BANNED: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  {
    pattern: /Sunday[- ]start/i,
    why: "the week starts on Monday (WEEK_STARTS_ON = 1)",
  },
  {
    pattern: /Sunday week key/i,
    why: "a week key is the week's first day, which is Monday",
  },
];

/** Files permitted to use a banned phrase, each with its reason. */
const ALLOWED: Readonly<Record<string, string>> = {};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (["node_modules", "__tests__", "dist", "coverage"].includes(name))
        continue;
      sourceFiles(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(name) && !/\.(test|spec)\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const files = [
  ...sourceFiles(resolve(repoRoot, "src")),
  ...sourceFiles(resolve(repoRoot, "functions/lib")),
  resolve(repoRoot, "functions/index.js"),
];

describe("week-anchor prose", () => {
  it("scans both sides of the mirror, and a non-trivial number of files", () => {
    // Anti-vacuity: a broken walk would report zero offenders forever.
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.includes("/functions/"))).toBe(true);
    expect(files.some((f) => f.endsWith("programTypes.ts"))).toBe(true);
  });

  it("never tells a reader the week starts on Sunday", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(repoRoot, file);
      if (rel in ALLOWED) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const { pattern, why } of BANNED) {
          if (pattern.test(line))
            offenders.push(`${rel}:${i + 1} — ${line.trim()}  [${why}]`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
