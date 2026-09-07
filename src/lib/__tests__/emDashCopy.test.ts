/**
 * Em-dash copy ratchet.
 *
 * The owner's report was that recent copy "reads more AI". Measured, the
 * count of em dashes in the app went DOWN slightly over the run of work
 * that prompted it (1,309 → 1,274 non-comment lines) — so the character
 * itself was never the problem. What changed is that nearly every string
 * ADDED in that run used the same "statement — explanation" shape, and six
 * of them landed on the two screens a user sees every day. One sentence
 * rhythm repeated at every beat is the tell.
 *
 * So this is a ratchet, not a ban. Em dashes are correct for a genuine
 * aside and 57 of the 88 files carrying them today have more than one;
 * rewriting those is copy work for its own PR, not a gate. What the gate
 * does is stop the number growing, and stop any single component becoming
 * a new worst case, so the next pass that reaches for the construction has
 * to pick a different one — the middot the app already uses for
 * "fact · fact", or a full stop for two independent statements.
 *
 * Lower both numbers when you rewrite copy; never raise either without
 * writing the reason here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "tinyglobby";

/** 240 across 88 files on 2026-09-07, after the purpose lines moved to
 *  middots (they were 6 of the count). */
const EM_DASH_COPY_BASELINE = 240;
/** CirclesSection and ProgrammeSettings, 13 each, on the same date. */
const WORST_FILE_BASELINE = 13;

const SRC = join(process.cwd(), "src");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * User-visible em-dash copy in one file.
 *
 * Deliberately approximate: quoted and template literals plus JSX text
 * nodes, after comments are stripped. It over-counts a non-rendered string
 * (a test id, a storage key) and under-counts a dash assembled at runtime
 * from parts. Both are fine for a ratchet — it only has to move the same
 * way the copy does.
 */
function emDashCopy(src: string): string[] {
  const body = stripComments(src);
  return [
    ...(body.match(/"[^"\n]*—[^"\n]*"/g) ?? []),
    ...(body.match(/`[^`]*—[^`]*`/g) ?? []),
    ...(body.match(/>[^<>{}\n]*—[^<>{}\n]*</g) ?? []),
  ];
}

function componentFiles(): string[] {
  return globSync("**/*.tsx", { cwd: SRC, absolute: true }).filter(
    (f) => !f.includes("__tests__")
  );
}

describe("em-dash copy ratchet", () => {
  it("the total does not grow", () => {
    const total = componentFiles().reduce(
      (sum, f) => sum + emDashCopy(readFileSync(f, "utf8")).length,
      0
    );
    expect(
      total,
      `${total} em-dash strings in user-visible copy, baseline ` +
        `${EM_DASH_COPY_BASELINE}. Prefer the "fact · fact" middot, or a ` +
        `full stop between two independent statements.`
    ).toBeLessThanOrEqual(EM_DASH_COPY_BASELINE);
    if (total < EM_DASH_COPY_BASELINE) {
      console.warn(
        `[em-dash ratchet] ${total} < baseline ${EM_DASH_COPY_BASELINE} — lower the baseline to ${total}.`
      );
    }
  });

  it("no single component becomes a new worst case", () => {
    const worst = componentFiles()
      .map((f) => ({
        file: `src/${f.slice(SRC.length + 1)}`,
        n: emDashCopy(readFileSync(f, "utf8")).length,
      }))
      .filter((r) => r.n > WORST_FILE_BASELINE)
      .map((r) => `${r.file}: ${r.n}`);
    expect(
      worst,
      `no component may carry more than ${WORST_FILE_BASELINE} em-dash strings`
    ).toEqual([]);
  });

  it("counts copy and ignores comments (the measure is not vacuous)", () => {
    expect(emDashCopy('const a = "Week 1 — building";')).toHaveLength(1);
    expect(emDashCopy("/* a comment — with a dash */")).toHaveLength(0);
    expect(emDashCopy("// a line comment — with a dash")).toHaveLength(0);
    expect(emDashCopy("<p>Rest day — you are adapting</p>")).toHaveLength(1);
    expect(emDashCopy('const a = "no dash here";')).toHaveLength(0);
  });
});
