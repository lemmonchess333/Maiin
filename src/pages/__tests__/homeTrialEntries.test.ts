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
    const start = home.indexOf("{showTrialStrip && (");
    expect(start).toBeGreaterThan(0);
    const block = home.slice(start, home.indexOf("</button>", start));
    expect(block).toMatch(/navigate\("\/upgrade\?from=trial_strip"\)/);
  });

  it("a billed trial's strip manages the live subscription rather than selling one", () => {
    const start = home.indexOf("{showTrialStrip && (");
    const block = home.slice(start, home.indexOf("</button>", start));
    // The billed branch is checked FIRST: a live subscription must never
    // reach the sheet or the offer page.
    const billed = block.indexOf('trialKind === "billed"');
    const sell = block.indexOf("trialDaysLeft <= 2");
    expect(billed).toBeGreaterThan(-1);
    expect(billed).toBeLessThan(sell);
    expect(block).toMatch(/navigate\("\/settings\/subscription"\)/);
    expect(block).toMatch(/"Manage" : "Subscribe"/);
  });

  it("the countdown strip stays quiet for a billed trial the user has already cancelled", () => {
    expect(home).toMatch(
      /const showTrialStrip =\s*isInTrial && !\(trialKind === "billed" && autoRenew === false\)/
    );
  });

  it("nothing on Home reaches the offer page untagged", () => {
    expect(home).not.toMatch(/navigate\("\/upgrade"\)/);
    expect(home).not.toMatch(/to="\/upgrade"/);
  });
});
