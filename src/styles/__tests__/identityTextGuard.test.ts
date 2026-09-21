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
 *
 * AND THE CLASS IS NOT THE ONLY WAY TO SPELL IT. The scan below matched
 * `text-<token>` and nothing else, so `style={{ color: THEME.… }}` was
 * invisible to it — and that is where the worst text contrast in the app
 * was hiding. Home's "Log food" action and the nudge note above it both
 * painted themselves `THEME.semantic.nutrition`; measured on the rendered
 * card that is 2.77:1 at 14px semibold, against a 4.5:1 bar. A guard that
 * forces the look for only one of the two spellings forces it for
 * whichever half the next author does not use, so the inline form is
 * counted too.
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
  running: 47, // Calendar status icons now use the strong colour step.
  lifting: 19, // Redesign consolidates onboarding option icons.
  nutrition: 4,
  destructive: 0,
  success: 0,
  warning: 0,
  // +7 (palette-class sweep, 2026-08-22): six Trophy/Star ICONS that were
  // raw text-amber-500/yellow-500 (PRCard, PRsTab, ExerciseHistory,
  // RunSummary pace-trend, SessionCompleteScreen, FoodSuggestionsDropdown
  // pantry star x2) — all icon fills, none text.
  // 2026-09-09: 11 → 10. The RunSummary pace-trend Trophy named just
  // above lost its `text-achievement` and now INHERITS the badge, which
  // moved to --achievement-strong when that badge was taken from 1.66:1
  // to 4.82:1. The icon was legitimate under this ratchet (3:1 non-text),
  // so this is a free gain rather than a fix — locked in per the rule
  // that a count may fall freely.
  achievement: 10, // Companion finish removes the decorative trophy.
};

/**
 * The inline spelling of the same thing, per expression, as of
 * 2026-09-18. `color: THEME.<identity>` in a style prop or a style
 * object — the form the class scan cannot see.
 *
 * The three DOMAIN identities and the brand. An earlier version of this
 * comment left `THEME.brand` out on the grounds that the brand purple
 * "has no AA text step at all", because `--primary-strong` is the
 * white-on-fill step (3.26:1 on the dark card). That was looking at the
 * wrong token: the brand IS the lifting purple — `index.css` defines
 * `--lifting` as "the literal brand purple", and CLAUDE.md says "purple
 * always = brand/lifting" — so brand text takes `--lifting-strong`, the
 * step Analytics already used for its purple prose. See BRAND below for
 * the class form and the measurements.
 */
const EXPECTED_INLINE_USES = {
  // 2026-09-19: 18 → 17 and 7 → 6. The weekly-layout summary's Run and
  // Lift numerals are 18px bold — under the 18.66px large-text line by
  // two thirds of a pixel — so they took the strong steps with the
  // brand-coloured Double beside them.
  "THEME.running": 17,
  "THEME.lifting": 6,
  // The brand, inline. Icon tints (notification glyphs, the ProModal
  // feature tiles, the Home tiles' arrows), legend and ring fills, and
  // TrajectoryCard's 3xl score. The text uses — Home's rest-day eyebrow,
  // "Connect Health", the Coach badge, "Share your take" — moved to
  // `text-lifting-strong` / `hsl(var(--lifting-strong))`.
  // 41 → 40. The Performance Index chart's five-item band legend went
  // when the bands moved into the plot; its "Moderate" swatch was the
  // one brand fill among them.
  "THEME.brand": 40,
  // 2026-09-18: 21 → 19. Home's "Log food" action and the nudge note
  // above it were the two smallest-text uses and measured 2.77:1; both
  // moved to `text-nutrition-strong`. The rest are icons and fills.
  // 2026-09-20: 19 → 18. FoodProStrip (an icon tint on its camera tile)
  // was retired for the one-line FoodProHint, which paints no identity.
  "THEME.semantic.nutrition": 18,
} as const;

type InlineToken = keyof typeof EXPECTED_INLINE_USES;

function inlineUses(expr: string): string[] {
  const found: string[] = [];
  const pattern = new RegExp(
    `color:\\s*${expr.replace(/\./g, "\\.")}(?![\\w.])`,
    "g"
  );
  for (const file of sourceFiles()) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        const hits = line.match(pattern);
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

/**
 * The brand purple as a CLASS. `text-primary` is `--primary`, and as small
 * text it measured 3.83 / 3.62 / 3.25:1 on the light card, muted tile and
 * page, and 3.82 / 3.36 / 4.42:1 in dark — under 4.5:1 on every surface
 * in both themes. Forty-three small-text sites (links, "See more", chip
 * labels, the Login eyebrow, the day cell's number) moved to
 * `text-lifting-strong`, which clears 5.1:1 and up everywhere including a
 * 10% brand tint. What is left is icons — the Spinner's default glyph
 * among them — on the 3:1 non-text bar the identity clears
 * (`tokenContrast.test.ts` pins that), plus BadgeGrid's 30px extrabold
 * streak count, which is large text.
 *
 * `text-primary-strong` is NOT the redirect. It is the fill under white
 * text, and it measures 3.26:1 as text on the dark card.
 */
const BRAND = { token: "primary", step: "lifting-strong", bare: 52 } as const;

describe("identity colour usage is pinned", () => {
  it("text-primary has the pinned number of bare uses", () => {
    const uses = bareUses(BRAND.token);
    expect(
      uses.length,
      uses.length > BRAND.bare
        ? `A new bare text-${BRAND.token} appeared. If it is small text (under 24px, or under 18.66px bold) use text-${BRAND.step} — the brand purple is under 4.5:1 on every surface in both themes, and text-primary-strong is the fill step, not the text step. If it is an icon or a large numeral it is fine; raise the count.\n${uses.slice(BRAND.bare).join("\n")}`
        : `Bare text-${BRAND.token} dropped to ${uses.length} — lower the pinned count to lock the gain in.`
    ).toBe(BRAND.bare);
  });

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

  it.each(Object.keys(EXPECTED_INLINE_USES) as InlineToken[])(
    "inline `color: %s` has the pinned number of uses",
    (expr) => {
      const expected = EXPECTED_INLINE_USES[expr];
      const uses = inlineUses(expr);
      expect(
        uses.length,
        uses.length > expected
          ? `A new inline \`color: ${expr}\` appeared. Same rule as the ` +
              `class form: an icon or a 24px+ numeral is fine (raise the ` +
              `count), small text needs the \`-strong\` step — as a class ` +
              `where one fits, or \`hsl(var(--<token>-strong))\` where the ` +
              `value has to stay inline.\n${uses.slice(expected).join("\n")}`
          : `Inline \`color: ${expr}\` dropped to ${uses.length} — lower ` +
              `the pinned count to lock the gain in.`
      ).toBe(expected);
    }
  );

  it("the inline scan is looking at something", () => {
    /* The class scan has `expect(files.length).toBeGreaterThan(100)` for
       this reason; the inline one needs its own, because a regex that
       matched nothing would make every count above pass at zero. */
    expect(inlineUses("THEME.running").length).toBeGreaterThan(0);
    expect(inlineUses("THEME.semantic.nutrition").length).toBeGreaterThan(0);
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
    expect(css, `--${BRAND.step} is missing`).toMatch(
      new RegExp(`--${BRAND.step}:`)
    );
  });
});
