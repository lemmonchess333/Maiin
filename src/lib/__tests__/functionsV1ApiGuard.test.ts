/**
 * 1st-gen API + no-functions.config() enforcement (CLAUDE.md v7 gotcha).
 *
 * As of firebase-functions v7: the bare `require("firebase-functions")` resolves
 * to the 2nd-gen API, but every export here is 1st-gen — they import from
 * `firebase-functions/v1` or silently become `undefined` triggers. And
 * `functions.config()` THROWS (the Cloud Runtime Config API was shut down
 * 2025-12-31); secrets now come from Secret Manager via `defineSecret`.
 *
 * A stray `functions.config()` in a rarely-hit code path would throw only when
 * that path runs — lurking past deploy. This guard catches it at CI:
 *   1. no LIVE `functions.config(` call anywhere in `functions/` (comments that
 *      document its removal are excluded), and
 *   2. `functions/index.js` imports the 1st-gen builder from
 *      `firebase-functions/v1`, never the bare 2nd-gen entrypoint.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const functionsRoot = resolve(repoRoot, "functions");

/** Every .js under functions/, skipping node_modules + tests. */
function jsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      out.push(...jsFiles(full));
      continue;
    }
    if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

describe("functions v1 API + no functions.config()", () => {
  it("no live functions.config() call (it throws under v7 — use defineSecret)", () => {
    const offenders: string[] = [];
    for (const file of jsFiles(functionsRoot)) {
      const rel = relative(repoRoot, file);
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const trimmed = line.trim();
          // Exclude comment lines — the codebase documents the removal of
          // functions.config() in several comments; those aren't calls.
          if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
          if (/functions\.config\(/.test(line))
            offenders.push(`${rel}:${i + 1}`);
        });
    }
    expect(
      offenders,
      `functions.config() is removed in firebase-functions v7 and THROWS at ` +
        `runtime. Use defineSecret(...) from firebase-functions/params + ` +
        `runWith({ secrets }) and read process.env.<NAME> (CLAUDE.md).\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("index.js imports the 1st-gen builder from firebase-functions/v1", () => {
    const src = readFileSync(resolve(functionsRoot, "index.js"), "utf8");
    // The 1st-gen builder must come from /v1. The bare require resolves to the
    // 2nd-gen API, under which every .runWith().https.onCall(...) export here
    // becomes an undefined trigger.
    expect(src).toMatch(/require\(\s*["']firebase-functions\/v1["']\s*\)/);
    // And it must NOT bind the top-level `functions` to the bare 2nd-gen entry.
    expect(src).not.toMatch(
      /const\s+functions\s*=\s*require\(\s*["']firebase-functions["']\s*\)/
    );
  });
});
