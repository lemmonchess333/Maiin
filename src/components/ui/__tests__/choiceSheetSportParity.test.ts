import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * `ChoiceSheet` and `buttonClasses` both spell the sport CTA, and they
 * must spell it with the same token.
 *
 * Two maps rather than one is deliberate — the sheet sizes its own rows,
 * so it cannot simply call `buttonClasses` — but "the same rule written
 * twice" is this repo's most-repeated mistake, and the copy nobody tests
 * is the one that drifts. What matters here is the FILL: both use
 * `--running-fill` rather than the bare identity, because white on the
 * identity coral is 3.58:1. A future edit that "simplifies" either to
 * `bg-running` would pass every other test in the suite and quietly ship
 * sub-AA white text.
 */
const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const sheet = read("../ChoiceSheet.tsx");
const button = read("../buttonClasses.ts");

describe("sport CTA — sheet ↔ button parity", () => {
  it("both fill with --running-fill, not the bare identity", () => {
    expect(sheet).toMatch(/sport:\s*"bg-running-fill text-white/);
    expect(button).toMatch(/sport:\s*"bg-running-fill text-white"/);
  });

  it("neither fills with the bare identity under white text", () => {
    /* The specific regression this exists for. `bg-running` is the
       identity, and it is 3.58:1 under white — the reason both maps use
       the fill step. Matched with a word boundary so `bg-running-fill`
       and `bg-running/10` (the tinted variant, which carries dark text)
       do not trip it. */
    const bareUnderWhite = /bg-running(?![-/\w])[^"]*text-white/;
    expect(sheet).not.toMatch(bareUnderWhite);
    expect(button).not.toMatch(bareUnderWhite);
  });

  it("the pattern would catch the thing it is looking for", () => {
    /* A negative assertion that nothing anchors is satisfied by a typo in
       the pattern. This one is anchored. */
    const bareUnderWhite = /bg-running(?![-/\w])[^"]*text-white/;
    expect(bareUnderWhite.test('sport: "bg-running text-white"')).toBe(true);
    expect(bareUnderWhite.test('sport: "bg-running-fill text-white"')).toBe(
      false
    );
    expect(bareUnderWhite.test('"sport-tinted": "bg-running/10 text-x"')).toBe(
      false
    );
  });
});
