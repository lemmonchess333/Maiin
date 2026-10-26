/**
 * The signed-in shell's chunks load side by side, not one after another.
 *
 * The motion root, three providers, the layout and Home are lazy and
 * nested, and React starts a lazy component's import only when it renders,
 * so a cold start would wait on six round trips in series before Home
 * painted. App.tsx starts all six once the session is known.
 *
 * Pinned at the source: App.tsx mounts every provider and route, and
 * nothing renders it whole in jsdom. What is pinned is what keeps the
 * prefetch useful: each lazy layer imports through the same loader the
 * prefetch calls (so the module map hands both one promise), and the
 * prefetch waits for a uid or for a device that has signed in before (so a
 * first visit never loads Firestore for it, which the eager-graph test
 * exists to stop).
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
    loader: "loadMotionRoot",
    module: "@/components/MotionRoot",
    lazy: "MotionRoot",
  },
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

  it("runs at module load on a device that has signed in, and on sign-in", () => {
    // Module load: only behind the device's signed-in-before mark, so a
    // first visit loads none of it (returningDevicePrefetch.test.ts runs
    // both cases).
    expect(code).toMatch(
      /^if \(hasSignedInOnThisDevice\(\)\) prefetchSignedInShell\(\);$/m
    );
    // The first sign-in on a device: once a session is known.
    expect(code).toMatch(
      /useEffect\(\(\) => \{\s*if \(uid\) prefetchSignedInShell\(\);\s*\}, \[uid\]\);/
    );
    const calls = code.match(/(?<!function )prefetchSignedInShell\(\)/g) ?? [];
    expect(calls).toHaveLength(2);
  });
});
