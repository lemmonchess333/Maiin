/**
 * Every route from Home into the offer page carries its entry tag.
 *
 * No Home suite stages the trial surfaces (the countdown strip, the
 * trial-ended prompt), so the destinations are pinned at source: an
 * untagged `/upgrade` from Home would land on the plans with the funnel
 * unable to tell a trial-countdown tap from any other entry.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const home = readFileSync(resolve(__dirname, "../Home.tsx"), "utf8");

describe("Home → offer page entries", () => {
  it("the trial countdown strip is tagged as the strip", () => {
    const start = home.indexOf("{isInTrial && (");
    expect(start).toBeGreaterThan(0);
    const block = home.slice(start, home.indexOf("</button>", start));
    expect(block).toMatch(/navigate\("\/upgrade\?from=trial_strip"\)/);
  });

  it("the Pro strip for free accounts is gated by the shared predicate and tagged as the strip", () => {
    const start = home.indexOf("{showProStrip && (");
    expect(start).toBeGreaterThan(0);
    const block = home.slice(start, home.indexOf("</button>", start));
    expect(block).toMatch(/navigate\("\/upgrade\?from=home_strip"\)/);
    expect(home).toMatch(
      /shouldShowHomeProStrip\(\{[\s\S]*hadFreeWeek: !!profile\?\.trialExpiresAt/
    );
  });

  it("nothing on Home reaches the offer page untagged", () => {
    expect(home).not.toMatch(/navigate\("\/upgrade"\)/);
    expect(home).not.toMatch(/to="\/upgrade"/);
  });
});
