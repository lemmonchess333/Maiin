/**
 * CLAUDE.md freshness gate.
 *
 * CLAUDE.md is the first thing every agent reads, and its claims override
 * default behaviour — so a stale claim there is worse than a stale comment
 * in a file nobody opens. By 2026-07-25 it had drifted badly: every file
 * count was 3–7× low (87 components → 319, 31 hooks → 75, 46 lib modules →
 * 198, 31 lib tests → 215), it still described `crews` as a live feature
 * two weeks after #1700 retired them, it listed 3 of 7 feature modules, and
 * it named none of the 9 ADRs.
 *
 * The fix was not to re-count. A number nothing checks is a claim that rots,
 * and re-counting just relines it up to lie again. So the counts were
 * removed, and what remains are claims that CAN be checked — checked here.
 *
 * Deliberately narrow. This does not police prose, and it must not become a
 * spell-checker for a 900-line document. It pins the handful of facts that
 * (a) an agent acts on, and (b) go wrong silently when the codebase moves:
 * the directory inventory, the ADR index, and the absence of retired
 * features. Everything else is judgement, and judgement belongs to review.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const claudeMd = readFileSync(resolve(repoRoot, "CLAUDE.md"), "utf8");

describe("CLAUDE.md — feature module inventory", () => {
  it("names every module in src/features/", () => {
    const modules = readdirSync(resolve(repoRoot, "src/features"), {
      withFileTypes: true,
    })
      .filter((e) => e.isDirectory() && e.name !== "__tests__")
      .map((e) => e.name)
      .sort();

    const missing = modules.filter((m) => !claudeMd.includes(`${m}/`));
    expect(
      missing,
      `New feature modules that CLAUDE.md doesn't mention. An agent reading ` +
        `it will not know these exist — add a line under "Feature Modules".`
    ).toEqual([]);
  });
});

describe("CLAUDE.md — ADR index", () => {
  const adrDir = resolve(repoRoot, "docs/adr");

  it("lists every ADR by number", () => {
    const numbers = readdirSync(adrDir)
      .filter((f) => /^\d{4}-.*\.md$/.test(f))
      .map((f) => f.slice(0, 4))
      .sort();
    expect(numbers.length).toBeGreaterThan(0);

    const missing = numbers.filter(
      (n) => !new RegExp(`\\|\\s*${n}\\s*\\|`).test(claudeMd)
    );
    expect(
      missing,
      `ADRs missing from the CLAUDE.md index. The index exists so an audit ` +
        `doesn't re-derive a decision that's already settled — an ADR nobody ` +
        `is pointed at may as well not have been written.`
    ).toEqual([]);
  });

  it("indexes no ADR that doesn't exist", () => {
    const indexed = [...claudeMd.matchAll(/^\|\s*(\d{4})\s*\|/gm)].map(
      (m) => m[1]
    );
    expect(indexed.length).toBeGreaterThan(0);
    const phantom = indexed.filter(
      (n) => !readdirSync(adrDir).some((f) => f.startsWith(n))
    );
    expect(phantom, `Indexed ADRs with no file in docs/adr/`).toEqual([]);
  });
});

describe("CLAUDE.md — retired features", () => {
  /**
   * Features removed from the codebase whose names must not survive in
   * CLAUDE.md as if they were live. Add a row when you retire something;
   * the point is that removal and documentation happen in one change.
   *
   * `probe` proves the retirement is real, so this can't pass vacuously by
   * describing a feature that still exists.
   */
  const RETIRED = [
    {
      name: "crews",
      probe: "src/hooks/useCrews.ts",
      retiredIn: "#1700 (Spaces/Challenges/Circles own their jobs)",
      // The QA-backlog row is a historical record, explicitly marked
      // SUPERSEDED rather than rewritten — matching the append-only
      // discipline the plan-file lock rule uses.
      allowedMentions: 2,
    },
  ];

  for (const entry of RETIRED) {
    it(`\`${entry.name}\` is really gone from the codebase`, () => {
      expect(
        existsSync(join(repoRoot, entry.probe)),
        `${entry.probe} still exists — ${entry.name} is not retired, so the ` +
          `assertion below would be policing a live feature.`
      ).toBe(false);
    });

    it(`CLAUDE.md doesn't describe \`${entry.name}\` as live (retired in ${entry.retiredIn})`, () => {
      const hits = (claudeMd.match(new RegExp(entry.name, "gi")) ?? []).length;
      expect(
        hits,
        `CLAUDE.md mentions "${entry.name}" ${hits}× but it was retired in ` +
          `${entry.retiredIn}. Historical rows are fine when marked ` +
          `SUPERSEDED; raise allowedMentions only for those.`
      ).toBeLessThanOrEqual(entry.allowedMentions);
    });
  }
});

describe("CLAUDE.md — no volatile file counts", () => {
  it("doesn't restate the app version (read it from package.json)", () => {
    // It claimed 1.1.0 while package.json said 1.2.0.
    const version = JSON.parse(
      readFileSync(resolve(repoRoot, "package.json"), "utf8")
    ).version as string;
    const stale = /currently \d+\.\d+\.\d+/.exec(claudeMd);
    expect(
      stale?.[0] ?? null,
      `Don't pin the version in prose; it drifts (package.json is ${version}).`
    ).toBeNull();
  });

  it("doesn't claim a file count for the directories that grow", () => {
    // "(31 hooks)", "(46 modules)", "(87 files total)" — every one of these
    // was wrong by 2026-07-25. Describe the shape instead.
    const offenders = [
      ...claudeMd.matchAll(
        /\((\d+)\s+(hooks|modules|pages|components|files[^)]*)\)/g
      ),
    ].map((m) => m[0]);
    expect(
      offenders,
      `Hard-coded inventory counts rot silently — every one of these was ` +
        `3–7× off before. Describe the directory instead, or pin the number ` +
        `with a test that fails when it changes.`
    ).toEqual([]);
  });
});
