/**
 * Every dynamic import in the app goes through `lazyRetry`.
 *
 * `lazyRetry` exists because a deploy changes chunk hashes, and a client
 * holding a cached `index.html` then asks for a chunk that no longer
 * exists. The import rejects, the enclosing `<Suspense>` never resolves,
 * and the user sits on the fallback forever — "Loading analytics..." with
 * no way out but a manual hard-reload they have no reason to know about.
 *
 * The wrapper was extracted from App.tsx for exactly this reason and its
 * own header says so. But it was only ever applied at the ROUTE level plus
 * two Social sub-imports; ten more sub-component imports on History alone
 * kept using bare `lazy`, so the page with the largest lazy surface in the
 * app had the least protection. `React.lazy` also caches the rejection, so
 * a failed chunk stays failed for the life of the tab.
 *
 * This is a source-text check rather than a runtime one on purpose: the
 * failure only reproduces against a server that has deleted a chunk the
 * client still remembers, which is not a state a unit test can stage. What
 * IS checkable — and what actually regressed — is whether the call sites
 * use the wrapper at all.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "test") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** `= lazy(` at a call site, not the `lazyRetry` definition itself. */
const BARE_LAZY = /=\s*lazy\s*\(/g;

describe("lazyRetry coverage", () => {
  it("no source file calls React.lazy directly", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      // The wrapper is the one legitimate caller — it IS the retry.
      if (file.endsWith(join("lib", "lazyRetry.ts"))) continue;
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(BARE_LAZY)) {
        const line = text.slice(0, m.index).split("\n").length;
        offenders.push(`${file.replace(SRC, "src")}:${line}`);
      }
    }
    expect(
      offenders,
      `these dynamic imports have no stale-chunk recovery — use lazyRetry from @/lib/lazyRetry:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("the wrapper still recovers, so the rule above is worth enforcing", () => {
    // Guards against the rule outliving its reason: if lazyRetry ever
    // stopped handling chunk errors, the coverage check would be
    // enforcing a no-op.
    const text = readFileSync(join(SRC, "lib", "lazyRetry.ts"), "utf8");
    expect(text).toContain("Failed to fetch dynamically imported module");
    expect(text).toContain("window.location.reload");
  });
});
