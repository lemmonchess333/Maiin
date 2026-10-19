/**
 * The signed-in shell's chunks load side by side, not one after another.
 *
 * Three providers, the layout and Home are lazy and nested, and React
 * starts a lazy component's import only when it renders, so a cold start
 * waited on five round trips in series before Home painted. App.tsx now
 * starts all five once the session is known.
 *
 * Pinned at the source: App.tsx mounts every provider and route, and
 * nothing renders it whole in jsdom. What is pinned is what keeps the
 * prefetch useful: each lazy layer imports through the same loader the
 * prefetch calls (so the module map hands both one promise), and the
 * prefetch waits for a uid (so a signed-out visitor never loads Firestore
 * for it, which the eager-graph test exists to stop).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const code = readFileSync(resolve(repoRoot, "src/App.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ");

const LAYERS = [
  {
    loader: "loadStreaks",
    module: "@/features/streaks/useStreaks",
    lazy: "StreaksProvider",
  },
  {
    loader: "loadReminders",
    module: "@/hooks/RemindersProvider",
    lazy: "RemindersProvider",
  },
  {
    loader: "loadDailyLogs",
    module: "@/hooks/DailyLogsProvider",
    lazy: "DailyLogsProvider",
  },
  { loader: "loadLayout", module: "@/components/Layout", lazy: "Layout" },
  { loader: "loadHome", module: "@/pages/Home", lazy: "Home" },
];

describe("the signed-in shell's prefetch", () => {
  const prefetch = code.slice(
    code.indexOf("function prefetchSignedInShell"),
    code.indexOf("}", code.indexOf("void load()"))
  );

  for (const { loader, module, lazy } of LAYERS) {
    it(`prefetches ${lazy}, through the loader its lazy() uses`, () => {
      expect(code).toContain(`const ${loader} = () => import("${module}");`);
      expect(prefetch).toContain(loader);
      const lazyAt = code.indexOf(`const ${lazy} = lazyRetry(`);
      expect(lazyAt, `${lazy} is lazy`).toBeGreaterThan(-1);
      const decl = code.slice(lazyAt, code.indexOf(";", lazyAt));
      expect(decl).toContain(loader);
      // A second, inline import of the module would be a second request
      // path the prefetch does not warm.
      expect(code.split(`import("${module}")`).length - 1).toBe(1);
    });
  }

  it("runs once a session is known, never at module load", () => {
    expect(code).toMatch(
      /useEffect\(\(\) => \{\s*if \(uid\) prefetchSignedInShell\(\);\s*\}, \[uid\]\);/
    );
    const calls = code.match(/(?<!function )prefetchSignedInShell\(\)/g) ?? [];
    expect(calls).toHaveLength(1);
  });
});
