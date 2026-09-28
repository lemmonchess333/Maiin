/**
 * Every Recharts chart takes its axis ticks and its tooltip from
 * `chartStyles.ts`.
 *
 * The shared tokens exist because the same styling kept being copied into
 * each chart and then drifting. They were adopted chart by chart, and the
 * two charts that live outside `analytics/` never heard: the weight trend
 * and the calorie balance kept their own ticks (11px on one of them, where
 * every other chart is 10px) and their own tooltips (a bordered card, where
 * every other chart has the dark one). Seen side by side on the Analytics
 * pages, they read as two different apps.
 *
 * So the rule is executable rather than a note: a tick is the shared object
 * (or `false`, when the axis shows no numbers), and a file that renders a
 * Recharts `<Tooltip>` styles it with `CHART_TOOLTIP_STYLE`, through
 * `contentStyle` or on its own content's container.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "../../..");

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      tsxFiles(full, out);
    } else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Files that import from Recharts, by src-relative path. */
function rechartsFiles(): string[] {
  return tsxFiles(srcRoot)
    .filter((f) => /from\s+"recharts"/.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(srcRoot.length + 1));
}

/** The expression inside each `tick={…}` prop, brace-matched. */
function tickExpressions(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/\btick=\{/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < body.length && depth > 0; i++) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}") depth--;
    }
    out.push(body.slice(start, i - 1).trim());
  }
  return out;
}

describe("Recharts charts share one tick and one tooltip", () => {
  const files = rechartsFiles();

  it("finds the chart files (a scan that matches nothing proves nothing)", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
    expect(files).toContain("components/progress/TrendWeight.tsx");
    expect(files).toContain("components/progress/CalorieBalanceChart.tsx");
  });

  it("reads each tick prop whole, nested braces included", () => {
    expect(
      tickExpressions('<XAxis tick={{ fontSize: 11, fill: "x" }} />')
    ).toEqual(['{ fontSize: 11, fill: "x" }']);
    expect(
      tickExpressions("<YAxis tick={hide ? false : CHART_AXIS_TICK} />")
    ).toEqual(["hide ? false : CHART_AXIS_TICK"]);
  });

  it("every axis tick is the shared tick, or false", () => {
    const own: string[] = [];
    for (const file of files) {
      const body = readFileSync(join(srcRoot, file), "utf8");
      for (const expr of tickExpressions(body)) {
        const parts = expr
          .split(/[?:]/)
          .map((p) => p.trim())
          .filter(Boolean);
        const ok = parts.every(
          (p, i) =>
            // A ternary's condition, then its two branches.
            (parts.length === 3 && i === 0) ||
            p === "CHART_AXIS_TICK" ||
            p === "false"
        );
        if (!ok) own.push(`${file}: tick={${expr.replace(/\s+/g, " ")}}`);
      }
    }
    expect(
      own,
      "A chart declares its own tick. Use CHART_AXIS_TICK from " +
        "components/analytics/chartStyles.ts."
    ).toEqual([]);
  });

  it("every Recharts tooltip uses the shared tooltip style", () => {
    const own: string[] = [];
    for (const file of files) {
      const body = readFileSync(join(srcRoot, file), "utf8");
      if (!/<Tooltip[\s\n>]/.test(body)) continue;
      if (!/CHART_TOOLTIP_STYLE/.test(body)) own.push(file);
    }
    expect(
      own,
      "A chart styles its tooltip itself. Use CHART_TOOLTIP_STYLE, as " +
        "contentStyle or on the custom content's container."
    ).toEqual([]);
  });
});
