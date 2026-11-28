/**
 * Keeps Framer Motion tree-shaken behind `LazyMotion` (#1049).
 *
 * Importing `motion` from `"framer-motion"` anywhere in the production
 * graph pulls the full feature set (including drag + layout projection)
 * back into every signed-in startup route. All production components
 * must import `m` instead, relying on `MotionRoot` (`domAnimation`) and
 * opting into `domMax` only through `MotionMaxRoot` for surfaces that
 * genuinely use `drag` or `layout`.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const ROOT = process.cwd();
const SRC = resolve(ROOT, "src");

function collectProductionFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "test") continue;
      collectProductionFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const FRAMER_IMPORT_RE =
  /import\s+(?!type\b)\{([\s\S]*?)\}\s*from\s+["']framer-motion["']/g;

function importedNames(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(FRAMER_IMPORT_RE)) {
    const specifiers = match[1].split(",");
    for (const raw of specifiers) {
      const cleaned = raw.replace(/\/\/[^\n]*/g, "").trim();
      if (!cleaned || cleaned.startsWith("type ")) continue;
      const [imported] = cleaned.split(/\s+as\s+/);
      if (imported) names.push(imported.trim());
    }
  }
  return names;
}

describe("LazyMotion bundle invariant", () => {
  const prodFiles = collectProductionFiles(SRC);

  it("scans production source files so the guard cannot pass vacuously", () => {
    expect(prodFiles.length).toBeGreaterThan(100);
  });

  it("never imports full `motion` from framer-motion in production code", () => {
    const offenders: string[] = [];
    for (const file of prodFiles) {
      const names = importedNames(readFileSync(file, "utf8"));
      if (names.includes("motion")) {
        offenders.push(relative(ROOT, file));
      }
    }
    expect(
      offenders,
      "Use `m` from framer-motion (paired with MotionRoot's LazyMotion) instead of `motion`."
    ).toEqual([]);
  });

  it("confines `domMax` to MotionMaxRoot.tsx", () => {
    const importers: string[] = [];
    for (const file of prodFiles) {
      const names = importedNames(readFileSync(file, "utf8"));
      if (names.includes("domMax")) {
        importers.push(relative(ROOT, file));
      }
    }
    expect(importers).toEqual(["src/components/MotionMaxRoot.tsx"]);
  });
});
