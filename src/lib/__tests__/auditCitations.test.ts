/**
 * The visual-audit reports cite the code that closed each finding. Those
 * citations have to resolve.
 *
 * `docs/visual-audit/` works by striking a finding through and naming the file
 * or test that fixed it. That makes a citation load-bearing: it is the only
 * thing connecting "this bug is gone" to evidence, and a reader who cannot
 * follow it has to re-derive the whole finding.
 *
 * The failure is not hypothetical. One of the PRs that marked these items
 * resolved cited a test assertion — "composer body is exactly the input
 * surface … no extra CTA shapes" — that was never written under that name.
 * The tests it meant do exist and do assert the right thing, so the claim was
 * true and the pointer was fiction. That PR sat open for three months; had it
 * merged, the report would have pointed at nothing.
 *
 * Same shape as the `useClaimMap` header CLAUDE.md records: a "covered by X"
 * claim that outlived X, steering people away from writing the test for
 * months. Cheap to assert, so it is asserted.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const auditDir = resolve(repoRoot, "docs/visual-audit");

const reports = readdirSync(auditDir).filter((f) => f.endsWith(".md"));

/** Backticked repo-relative paths: `src/lib/activeTab.ts`. */
const PATH_RE =
  /`((?:src|functions|e2e|scripts|docs)\/[A-Za-z0-9_./-]+\.[a-z]+)`/g;
/** Backticked bare spec filenames: `FoodComposerCard.test.tsx`. */
const BARE_SPEC_RE = /`([A-Za-z0-9_-]+\.(?:test|spec)\.[a-z]+)`/g;

function citations(file: string, re: RegExp): string[] {
  const body = readFileSync(join(auditDir, file), "utf8");
  return [...new Set([...body.matchAll(re)].map((m) => m[1]))];
}

describe("visual-audit reports — cited code exists", () => {
  it("scans every report in the directory", () => {
    /* A directory-driven sweep is the point: a new report joins the guard by
       existing, rather than by someone remembering to list it here. */
    expect(reports.length).toBeGreaterThan(0);
    expect(reports).toContain("REPORT.md");
  });

  reports.forEach((file) => {
    it(`${file} — every cited repo path resolves`, () => {
      const missing = citations(file, PATH_RE).filter(
        (p) => !existsSync(resolve(repoRoot, p))
      );
      expect(missing, `${file} cites files that do not exist`).toEqual([]);
    });

    it(`${file} — every cited spec filename exists somewhere`, () => {
      /* Reports often name a spec without its directory. Resolve by filename
         so a test moving between folders does not fail this, while a test
         that was never written (or has been deleted) still does. */
      const missing = citations(file, BARE_SPEC_RE).filter((name) => {
        const hits = execFileSync("git", ["ls-files", `*/${name}`, name], {
          cwd: repoRoot,
          encoding: "utf8",
        }).trim();
        return hits.length === 0;
      });
      expect(missing, `${file} cites specs that do not exist`).toEqual([]);
    });
  });
});
