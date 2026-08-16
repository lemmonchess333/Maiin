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
const IDENTITY = [
  "running",
  "lifting",
  "nutrition",
  "destructive",
  "success",
  "warning",
  "achievement",
] as const;

/**
 * Bare identity-colour uses outside tests, per token, as of 2026-08-10 —
 * after the small-text sites were moved to the `-strong` steps.
 *
 * A count may go DOWN freely. It may only go UP with a reason: the new use
 * must be an icon (3:1 non-text bar) or text at 24px+ / 18.66px+ bold
 * (3:1 large-text bar). Anything smaller needs `text-<token>-strong`.
 *
 * The FOUR ZEROES are the valuable rows. `destructive`, `success` and
 * `warning` are now used exclusively through their `-strong` steps, so any
 * reappearance of the bare token is unambiguously a regression rather than
 * a judgement call. The remaining counts are icons and large numerals:
 * coral and purple headline stat numbers all over the app, gold stars and
 * trophies, and the four orange food icons.
 */
const EXPECTED_BARE_USES: Record<(typeof IDENTITY)[number], number> = {
  // 2026-08-10: running 54 → 53, lifting 25 → 23. Not a contrast pass —
  // four components that nothing rendered were deleted (PaceChart,
  // HybridBalanceCard, BarcodeScanner, CommentSection), and their bare
  // uses went with them. Locked in per the ratchet's own rule that a
  // count may fall freely.
  // 2026-08-11: 53 → 54. The Feather icon on AdjustWeekSheet's "this week
  // is already eased" row — an icon, which the 4.5:1 small-text bar does
  // not apply to; its label beside it is `text-foreground`.
  // 2026-08-16: 54 → 55. The Target icon on RunSummary's goal-time row.
  // Icon only — the guard caught the TIME beside it in the same commit
  // (`text-lg font-bold` is 18px, under the 18.66px bold bar), and that
  // one moved to `text-running-strong` rather than being pinned here.
  running: 55,
  lifting: 23,
  nutrition: 4,
  destructive: 0,
  success: 0,
  warning: 0,
  achievement: 5,
};

function sourceFiles(): string[] {
  return globSync("src/**/*.{ts,tsx}", { cwd: process.cwd() })
    .filter((f) => !f.includes("__tests__"))
    .map((f) => resolve(process.cwd(), f));
}

function bareUses(token: string): string[] {
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
        const hits = line.match(new RegExp(`text-${token}(?!-)\\b`, "g"));
        if (!hits) return;
        for (let n = 0; n < hits.length; n += 1) {
          found.push(
            `${file.replace(process.cwd() + "/", "")}:${i + 1}  ${line.trim()}`
          );
        }
      });
  }
  return found;
}

describe("identity colour usage is pinned", () => {
  it.each(IDENTITY)("text-%s has the pinned number of bare uses", (token) => {
    const expected = EXPECTED_BARE_USES[token];
    const uses = bareUses(token);
    expect(
      uses.length,
      uses.length > expected
        ? `A new bare text-${token} appeared. If it is small text (under 24px, or under 18.66px bold) use text-${token}-strong instead — the identity is under 4.5:1 on a card. If it is an icon or a large numeral it is fine; raise the count.\n${uses.slice(expected).join("\n")}`
        : `Bare text-${token} dropped to ${uses.length} — lower the pinned count to lock the gain in.`
    ).toBe(expected);
  });

  it("the -strong steps this redirects to actually exist", () => {
    /* A guard that points at a token nobody defined would fail people into
       a dead end, so the destination is asserted alongside the rule. */
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    for (const id of IDENTITY) {
      expect(css, `--${id}-strong is missing`).toMatch(
        new RegExp(`--${id}-strong:`)
      );
    }
  });
});
