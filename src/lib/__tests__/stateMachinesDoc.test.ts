/**
 * docs/state-machines.md is the inventory of the app's flows: which ones
 * have their states written down as a type or a graph, and which exist only
 * as flags. It names the file each one lives in, and for a written-down
 * flow the type that names its states.
 *
 * A row pointing at a file since moved, or at a type since deleted, sends
 * the next reader to nothing, and "explicit" is then a claim nothing holds.
 * This fails when a named file is gone or a named type is no longer in the
 * file it is said to be in. It does not judge the prose.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const doc = readFileSync(resolve(repoRoot, "docs/state-machines.md"), "utf8");

/** Every repo path the document puts in backticks. */
const PATH = /`((?:src|functions)\/[A-Za-z0-9_./-]+|firestore\.rules)`/g;
const paths = [...new Set([...doc.matchAll(PATH)].map((m) => m[1]))];

/** The table of written-down flows: `| flow | where | states |`. */
const explicitRows = doc
  .slice(
    doc.indexOf("## Written down (explicit)"),
    doc.indexOf("## Not written down (implicit)")
  )
  .split("\n")
  .filter((line) => line.startsWith("| ") && !/^\| -+/.test(line))
  .slice(1)
  .map((line) => line.split("|")[2] ?? "");

/** `path` (`Name`, `Other`) pairs in one "where" cell. */
function namedTypes(cell: string): { path: string; names: string[] }[] {
  return [...cell.matchAll(/`([^`]+)`\s*\(([^)]*)\)/g)]
    .filter((m) => /^(src|functions)\/|^firestore\.rules$/.test(m[1]))
    .map((m) => ({
      path: m[1],
      names: [...m[2].matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)].map((n) => n[1]),
    }));
}

describe("docs/state-machines.md", () => {
  it("scans a plausible number of files (guards a broken scan)", () => {
    expect(paths.length).toBeGreaterThanOrEqual(25);
    expect(explicitRows.length).toBeGreaterThanOrEqual(12);
  });

  it.each(paths)("%s exists", (path) => {
    expect(existsSync(resolve(repoRoot, path))).toBe(true);
  });

  it("every written-down flow's type is still in the file it names", () => {
    const missing: string[] = [];
    let checked = 0;
    for (const cell of explicitRows) {
      for (const { path, names } of namedTypes(cell)) {
        const file = resolve(repoRoot, path);
        if (!existsSync(file)) continue; // reported by the test above
        const source = readFileSync(file, "utf8");
        for (const name of names) {
          checked++;
          if (!new RegExp(`\\b${name}\\b`).test(source))
            missing.push(`${name} in ${path}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(12);
  });
});
