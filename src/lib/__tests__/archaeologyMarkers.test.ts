/**
 * Archaeology-marker ratchet.
 *
 * A quarter of this codebase's source lines are comments, and the dominant
 * class is not explanation but HISTORY: which PR changed a line, on what
 * date, and what the code "used to" do. Readers use files far more than
 * blame, so the narrative belongs in CHANGELOG.md, an ADR, or the plan row
 * that owns the decision — with a one-line pointer left behind only when
 * the pointer is load-bearing. The policy (CLAUDE.md, app-improvement
 * prompt 3a): KEEP a comment that states an invariant, names a mirror or
 * cross-test, or explains a why the code cannot express; MOVE OUT one whose
 * content is what the code used to do, a PR or date narrative, or a
 * preserved old string.
 *
 * This ratchets three cheap, unambiguous MARKERS of the second kind inside
 * non-test comments: PR citations (`#1234`), ISO dates (`2026-08-22`), and
 * the phrase "used to". It deliberately does NOT ratchet total comment
 * share — a share ratchet rewards deleting the load-bearing ones.
 *
 * Baseline only goes down. A change that adds markers must either move the
 * narrative out or write, beside the number, why this one is load-bearing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

/** Non-test source under src/ and functions/ (functions/node_modules excluded). */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (
        ["node_modules", "__tests__", "test", "dist", "coverage"].includes(name)
      )
        continue;
      sourceFiles(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(name) && !/\.(test|spec)\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** Comment text only: block comments plus the tail of each `//` line. */
function commentText(src: string): string {
  const blocks = [...src.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => m[0]);
  const lines = src
    .split("\n")
    .map((l) => {
      const i = l.indexOf("//");
      return i >= 0 ? l.slice(i) : "";
    })
    .filter(Boolean);
  return [...blocks, ...lines].join("\n");
}

const MARKERS: { label: string; pattern: RegExp }[] = [
  { label: "PR citation", pattern: /#\d{3,4}\b/g },
  { label: "ISO date", pattern: /\b20\d\d-\d\d-\d\d\b/g },
  { label: '"used to"', pattern: /\bused to\b/gi },
];

function countMarkers() {
  const files = [
    ...sourceFiles(resolve(repoRoot, "src")),
    ...sourceFiles(resolve(repoRoot, "functions")),
  ];
  const byFile = new Map<string, number>();
  const byKind = new Map<string, number>();
  let total = 0;
  for (const file of files) {
    const comments = commentText(readFileSync(file, "utf8"));
    let n = 0;
    for (const { label, pattern } of MARKERS) {
      const hits = (comments.match(pattern) ?? []).length;
      n += hits;
      byKind.set(label, (byKind.get(label) ?? 0) + hits);
    }
    if (n) byFile.set(relative(repoRoot, file), n);
    total += n;
  }
  return { files: files.length, total, byFile, byKind };
}

/** 2026-09-05 survey. Lower it when you move narrative out; never raise it
 *  without the reason written here. */
const MARKER_BASELINE = 790;

describe("archaeology markers in non-test comments (ratchet)", () => {
  const { files, total, byFile, byKind } = countMarkers();

  it("scans a plausible number of files (guards a broken scan)", () => {
    expect(files).toBeGreaterThan(500);
  });

  it("PR citations + ISO dates + 'used to' do not increase", () => {
    const worst = [...byFile.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([f, n]) => `${f} (${n})`)
      .join("\n  ");
    const kinds = [...byKind.entries()]
      .map(([k, n]) => `${k}: ${n}`)
      .join(", ");
    expect(
      total,
      `${total} archaeology markers in comments (${kinds}), baseline ` +
        `${MARKER_BASELINE}. A change ADDED history to source. Move the ` +
        `narrative to CHANGELOG.md / the owning ADR or plan row and leave a ` +
        `pointer only if it is load-bearing.\n  Worst files:\n  ${worst}`
    ).toBeLessThanOrEqual(MARKER_BASELINE);
    if (total < MARKER_BASELINE) {
      console.info(
        `[archaeology ratchet] ${total} < baseline ${MARKER_BASELINE} — lower the baseline to ${total}.`
      );
    }
  });
});
