/**
 * One unit treatment, server side — the sibling of
 * src/utils/__tests__/unitTreatment.test.ts.
 *
 * The app writes "60 kg" / "5.2 km" (a space before the unit). The client
 * guard scans src/ only, so copy that is COMPOSED HERE and shown to users
 * — feed summaries (`socialFanout.buildSummary`), notification messages,
 * challenge names and descriptions (`challengeDefs`) — had no gate, and
 * three sites shipped the unspaced form ("5.0km", "Quickest 5km",
 * "Together: 1,000km"). Same regex as the client guard: a digit OR a
 * closing `}` before the unit, so the template-literal form is caught too.
 *
 * Scope is every non-test .js under functions/ except node_modules; the
 * exempt set is empty and should stay that way — there is no compact
 * register on the server (nothing here is space-constrained the way the
 * rasterised share card is).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const FUNCTIONS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const p = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.js$/.test(entry.name) && !/\.test\./.test(entry.name))
      out.push(p);
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("one unit treatment in server-composed copy (spaced: '60 kg', '5.2 km')", () => {
  it("scans the deployed source, not an empty directory", () => {
    const files = walk(FUNCTIONS_ROOT).map((f) => relative(FUNCTIONS_ROOT, f));
    expect(files).toContain("index.js");
    expect(files.some((f) => f.startsWith("lib/"))).toBe(true);
  });

  it("no unspaced kg/km value+unit adjacency in functions/", () => {
    const hits = [];
    for (const file of walk(FUNCTIONS_ROOT)) {
      const rel = relative(FUNCTIONS_ROOT, file);
      const lines = stripComments(readFileSync(file, "utf8")).split("\n");
      lines.forEach((line, i) => {
        if (/[\d}](kg|km)\b/.test(line))
          hits.push(`${rel}:${i + 1} ${line.trim()}`);
      });
    }
    expect(
      hits,
      "unspaced unit in server copy — write '5.0 km' / '60 kg' (space before " +
        "the unit), matching the client guard in src/utils/__tests__/unitTreatment.test.ts:\n" +
        hits.join("\n")
    ).toEqual([]);
  });
});
