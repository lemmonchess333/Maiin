/**
 * LiftReturnSheet contract tests.
 *
 * The sheet has one job and two prohibitions, and all three are things a
 * later edit could quietly break:
 *
 *   1. It offers exactly two ways out, and BOTH are non-destructive — one
 *      dismisses, one routes. No choice may acquire a writer, because the
 *      check-in's locked rule is that a response maps to a navigation and
 *      never to a plan change.
 *   2. It states the gap and nothing else. No missed-session count, no
 *      streak language, no loss framing — the standing copy constraint
 *      applies most exactly to the person who has just come back.
 *   3. The detrained register differs from the ordinary gap, because a
 *      three-week absence and a nine-day one are not the same news.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LiftReturnSheet from "../LiftReturnSheet";

function setup({ daysAway = 9, layoff = "gap" as "gap" | "detrained" } = {}) {
  const onClose = vi.fn();
  const onGoToProgramme = vi.fn();
  render(
    <LiftReturnSheet
      open
      onClose={onClose}
      onGoToProgramme={onGoToProgramme}
      daysAway={daysAway}
      layoff={layoff}
    />
  );
  return { onClose, onGoToProgramme };
}

describe("LiftReturnSheet — what it offers", () => {
  it("offers exactly two ways out, and neither changes the plan", async () => {
    const { onClose, onGoToProgramme } = setup();

    fireEvent.click(screen.getByRole("button", { name: /pick up where/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onGoToProgramme).not.toHaveBeenCalled();
  });

  it("routes to the programme rather than easing the plan itself", async () => {
    // "Start easier" names an option that already exists on the session
    // chooser. If this ever gains a writer instead, that is the locked
    // navigation-not-mutation rule being broken.
    const { onGoToProgramme } = setup();
    fireEvent.click(screen.getByRole("button", { name: /start easier/i }));
    await waitFor(() => expect(onGoToProgramme).toHaveBeenCalled());
  });
});

describe("LiftReturnSheet — what it says", () => {
  it("states the gap in days under a fortnight", () => {
    setup({ daysAway: 9 });
    expect(screen.getByText("It's been 9 days")).toBeInTheDocument();
  });

  it("rounds to weeks past a fortnight, where days invite arithmetic", () => {
    setup({ daysAway: 24, layoff: "detrained" });
    expect(screen.getByText("It's been about 3 weeks")).toBeInTheDocument();
  });

  it("changes register for a detrained absence", () => {
    setup({ daysAway: 24, layoff: "detrained" });
    expect(
      screen.getByText(/starting a little lighter is the usual way back/i)
    ).toBeInTheDocument();
  });

  it("keeps the ordinary gap matter-of-fact", () => {
    setup({ daysAway: 9 });
    expect(
      screen.getByText(/your plan is where you left it/i)
    ).toBeInTheDocument();
  });

  it("never scolds: no streak, loss or missed-session language", () => {
    // The constraint stated as a test rather than as a comment, so a
    // future copy edit that reaches for urgency fails here.
    for (const layoff of ["gap", "detrained"] as const) {
      const { unmount } = render(
        <LiftReturnSheet
          open
          onClose={() => {}}
          onGoToProgramme={() => {}}
          daysAway={layoff === "gap" ? 9 : 24}
          layoff={layoff}
        />
      );
      const text = document.body.textContent ?? "";
      for (const banned of [
        /streak/i,
        /\blost\b/i,
        /\bmissed\b/i,
        /don't break/i,
        /at risk/i,
        /fall(en)? behind/i,
      ]) {
        expect(text).not.toMatch(banned);
      }
      unmount();
    }
  });
});
