/**
 * Identity colours may not quietly grow new uses.
 *
 * `--running` and `--lifting` are fixed sport identities — CLAUDE.md bars
 * changing them, and they are correct for icons (the 3:1 non-text bar) and
 * for the large numerals they headline (the 3:1 large-text bar). They are
 * NOT correct for small text: coral measures 3.20:1 on a card and 2.74:1
 * on a 10% tint over the page canvas, purple 3.45:1 / 2.96:1.
 * `--running-strong` and `--lifting-strong` exist for exactly that case.
 *
 * Why a test and not a review note: CLAUDE.md's design-system section says
 * the colour invariants "regress constantly and keep getting swept up
 * after the fact", and this one proved it twice. PR #1903 (18 sites) and
 * PR #1905 (11 sites) each swept and each left small-text uses behind —
 * every `SectionLabel className="text-running"` (the 11px RUNNING /
 * LIFTING headers on History and PRs), the SegmentedControl selected
 * label, the Banner accent, and the "Couldn't save your run" error title.
 * A sweep cannot prevent the next drift.
 *
 * WHY A COUNT, AND NOT SOMETHING SMARTER. The obvious guard is "no element
 * pairs a bare identity colour with a small-text size class". That was
 * written first, it passed, and it was WORTHLESS: it looked at one line,
 * and the size class almost never shares a line with the colour. In
 * `RunSummary` the size sits on the parent `<div>`; in `SegmentedControl`
 * it lives in an `OPTION_BASE` constant in another part of the file. The
 * clean "zero offenders" result meant "the two classes are rarely
 * co-located", not "the codebase is clean" — it was mutation-checking that
 * exposed it, when re-breaking both fixed sites still passed. Deciding
 * icon-vs-text properly needs a JSX+CSS resolve, which is a lot of
 * machinery to buy.
 *
 * So this pins the COUNT instead. It cannot tell an icon from a label —
 * but it cannot be fooled either: any new bare use fails, and the author
 * has to look at the site and either redirect it to the `-strong` step or
 * consciously raise the number. Forcing the look is the whole job.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";
import { resolve } from "node:path";

/** Identity tokens that have an AA text step to redirect to. */
const IDENTITY = ["running", "lifting"] as const;

/**
 * Bare identity-colour uses outside tests, as of 2026-08-10 — after the
 * small-text sites were moved to the `-strong` steps.
 *
 * This number may go DOWN freely. It may only go up with a reason: the new
 * use must be an icon or text at 24px+ (or 18.66px+ bold). If it is
 * smaller than that, use `text-running-strong` / `text-lifting-strong`.
 */
const EXPECTED_BARE_USES = 79;

function sourceFiles(): string[] {
  return globSync("src/**/*.{ts,tsx}", { cwd: process.cwd() })
    .filter((f) => !f.includes("__tests__"))
    .map((f) => resolve(process.cwd(), f));
}

function bareUses(): string[] {
  const found: string[] = [];
  const files = sourceFiles();
  // Guard the guard: a glob that silently matched nothing would make every
  // assertion below vacuous, which is the failure mode this file exists to
  // avoid repeating.
  expect(files.length).toBeGreaterThan(100);
  for (const file of files) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const id of IDENTITY) {
          const re = new RegExp(`text-${id}(?!-strong)\\b`, "g");
          const hits = line.match(re);
          if (hits) {
            for (let n = 0; n < hits.length; n += 1) {
              found.push(
                `${file.replace(process.cwd() + "/", "")}:${i + 1}  ${line.trim()}`
              );
            }
          }
        }
      });
  }
  return found;
}

describe("identity colour usage is pinned", () => {
  it(`has exactly ${EXPECTED_BARE_USES} bare text-running / text-lifting uses`, () => {
    const uses = bareUses();
    expect(
      uses.length,
      uses.length > EXPECTED_BARE_USES
        ? `A new bare identity colour appeared. If it is small text (under 24px, or under 18.66px bold) use text-running-strong / text-lifting-strong instead — the identity is 3.20:1 / 3.45:1 on a card. If it is an icon or a large numeral it is fine; raise EXPECTED_BARE_USES.\n${uses.slice(EXPECTED_BARE_USES).join("\n")}`
        : `Bare uses dropped to ${uses.length} — lower EXPECTED_BARE_USES to lock the gain in.`
    ).toBe(EXPECTED_BARE_USES);
  });

  it("the -strong steps this redirects to actually exist", () => {
    /* A guard that points at a token nobody defined would fail people into
       a dead end, so the destination is asserted alongside the rule. */
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    for (const id of IDENTITY) {
      expect(css).toMatch(new RegExp(`--${id}-strong:`));
    }
  });
});
