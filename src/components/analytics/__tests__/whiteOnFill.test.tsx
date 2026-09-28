import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PRCard from "../PRCard";

/**
 * White text needs a FILL step under it, not the identity.
 *
 * The identities are tuned to be recognisable at a glance as a colour, and
 * they are the wrong value to put white on: `--ds-orange-500` (#e87316)
 * measures 3.05:1 with white, and the coral identity 3.58:1 — which is
 * why `--nutrition-fill` (5.02:1) and `--running-fill` (4.51:1) exist and
 * say so in their own token comments.
 *
 * The badge this pins is the one element on the PRs tab whose entire job
 * is to catch the eye, so it was the least legible thing there.
 *
 * The eslint hex rule did not see either site because it matches SIX hex
 * digits and `#fff` is three. That gap is closed in the same change
 * (`{3,8}`, which is what the className selector beside it already used),
 * but lint only catches the HEX: a regression to the bare identity via
 * `var(--ds-orange-500)` plus a `text-white` class would carry no hex at
 * all. So the token is asserted here too.
 */
const prs = [
  { label: "Longest run", value: "21.1 km", date: "22 Aug", isNew: true },
  { label: "Fastest 5K", value: "24:10", date: "18 Aug" },
];

describe("the New chip is gold, the colour kept for new bests", () => {
  it("takes the achievement tokens, with its text on the -strong step", () => {
    /* DS3: gold means a new best and nothing else. The chip was
       white-on-orange, the FOOD colour, reading "NEW" in capitals the app
       retired; the fill-step rule above held its contrast, and the rule it
       now follows is the colour's meaning. Small text takes the -strong
       step, as the finish screen's and the workout's gold does. */
    render(<PRCard title="Running PRs" prs={prs} />);
    const chip = screen.getByText("New");
    expect(chip).toHaveClass("text-achievement-strong");
    expect(chip.className).toMatch(/\bbg-achievement\/\d+/);
    expect(chip.className).not.toMatch(/nutrition|text-white/);
    expect(chip.getAttribute("style")).toBeNull();
  });

  it("renders no chip on a row that is not new", () => {
    // Anchors the assertion above: if the chip stopped rendering
    // entirely, `getByText` would throw rather than pass — but a suite
    // that only ever renders `isNew` rows would not notice the flag
    // being ignored in the other direction.
    render(<PRCard title="Running PRs" prs={[prs[1]]} />);
    expect(screen.queryByText("New")).toBeNull();
  });
});
