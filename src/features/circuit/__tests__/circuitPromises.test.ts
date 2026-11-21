/**
 * What circuit mode promises and what it is never sold as (Circ1 (1),
 * (3)): it is free, and it is fitness in less time or with no kit, never
 * fat burning. Every file of the feature is read, so a new one is held to
 * the same.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../..");

function sources(dir: string): string[] {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory())
      return name === "__tests__" ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const FILES = [
  ...sources("src/features/circuit"),
  ...sources("src/components/circuit"),
  ...["src/pages/Circuit.tsx"].filter((path) => existsSync(join(root, path))),
];

describe("circuit mode's promises (Circ1 (1), (3))", () => {
  it("reads the feature's files", () => {
    expect(FILES).toContain("src/features/circuit/circuitMoves.ts");
  });

  it("is free: no file of it reaches for Pro (Circ1 (3))", () => {
    const pro =
      /from\s+["'][^"']*(subscription|proPlans|useProCheckout|ProGate|Upgrade)[^"']*["']/;
    const reaching = FILES.filter((path) =>
      pro.test(readFileSync(join(root, path), "utf8"))
    );
    expect(reaching).toEqual([]);
  });

  it("never sells itself as fat burning (Circ1 (1))", () => {
    const fatBurning = /fat[\s-]*(burn|loss|melt|torch)|burn(s|ing)?\s+fat/i;
    const saying = FILES.filter((path) =>
      fatBurning.test(readFileSync(join(root, path), "utf8"))
    );
    expect(saying).toEqual([]);
  });
});
