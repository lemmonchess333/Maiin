import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

/**
 * Every Recharts ResponsiveContainer is given its height as a number.
 *
 * With `height="100%"` the container starts at Recharts' initial size of
 * -1 by -1 and only measures its parent in an effect after the first
 * paint, so the first render of every such chart logged "The width(-1) and
 * height(-1) of chart should be greater than 0" to the console. A numeric
 * height passes Recharts' check on that first render (it asks for either
 * side to be positive), and the width still follows the parent. The
 * wrappers keep their Tailwind height beside it (h-44 is 176).
 */
const root = resolve(__dirname, "../../..");

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__") continue;
      tsxFiles(full, out);
    } else if (name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("ResponsiveContainer heights", () => {
  const containers = tsxFiles(root).flatMap((file) => {
    const src = readFileSync(file, "utf8");
    return [...src.matchAll(/<ResponsiveContainer\b[^>]*>/g)].map((m) => ({
      file: relative(root, file),
      tag: m[0],
    }));
  });

  it("finds the charts it pins", () => {
    // Anchor: the absence check below is vacuous if nothing matched.
    // 9 → 8: the run pages' splits bar chart went, for a table
    // (`components/run/SplitsTable`) with no container of its own.
    expect(containers.length).toBeGreaterThanOrEqual(8);
  });

  it("gives every container a numeric height, not a percentage", () => {
    const percentage = containers.filter(({ tag }) =>
      /height=["']\d+%["']/.test(tag)
    );
    expect(percentage).toEqual([]);
  });
});
