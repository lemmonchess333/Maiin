/**
 * LiftReturnSheet contract tests (Lift4 (11)).
 *
 * The sheet is the one way back in after a break, and the things a later
 * edit could quietly break:
 *
 *   1. It offers exactly two choices. Only "Ease back in" changes the
 *      plan, on the person's yes; "Keep my old weights" changes nothing.
 *   2. Easing back is the choice put first from three weeks away, and it
 *      says what it will do (10% or 20%, a set fewer this week, a step
 *      back a session) before it does it.
 *   3. It states the gap and nothing else. No missed-session count, no
 *      streak language, no loss framing — the standing copy constraint
 *      applies most exactly to the person who has just come back.
 */
import { describe, it, expect, vi } from "vitest";
import { WELCOME_BACK } from "@/test/journeyScreens";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LiftReturnSheet from "../LiftReturnSheet";

function setup({
  daysAway = 24,
  easeBackFirst = true,
  easeBackShare = 0.1,
  onEaseBack = vi.fn(async () => {}),
} = {}) {
  const onClose = vi.fn();
  render(
    <LiftReturnSheet
      open
      onClose={onClose}
      onEaseBack={onEaseBack}
      daysAway={daysAway}
      easeBackFirst={easeBackFirst}
      easeBackShare={easeBackShare}
    />
  );
  return { onClose, onEaseBack };
}

const buttons = () =>
  screen
    .getAllByRole("button")
    .map((b) => b.textContent ?? "")
    .filter((t) => /ease back in|keep my old weights/i.test(t));

describe("LiftReturnSheet — what it offers", () => {
  it("eases the plan back on the person's yes, then closes", async () => {
    const { onClose, onEaseBack } = setup();
    // The E2E journeys find the sheet and its choices by these
    // (src/test/journeyScreens.ts).
    expect(
      screen.getByRole("dialog", { name: WELCOME_BACK.sheet })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: WELCOME_BACK.easeBack })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onEaseBack).toHaveBeenCalledTimes(1);
  });

  it("keeps the old weights without touching the plan", async () => {
    const { onClose, onEaseBack } = setup();
    fireEvent.click(screen.getByRole("button", { name: WELCOME_BACK.keep }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onEaseBack).not.toHaveBeenCalled();
  });

  it("stays open when easing back couldn't be saved", async () => {
    const onEaseBack = vi.fn(async () => {
      throw new Error("offline");
    });
    const { onClose } = setup({ onEaseBack });
    fireEvent.click(screen.getByRole("button", { name: /ease back in/i }));
    await waitFor(() => expect(onEaseBack).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /ease back in/i })
    ).not.toBeDisabled();
  });

  it("puts easing back first from three weeks, and keeping first before", () => {
    const { unmount } = render(
      <LiftReturnSheet
        open
        onClose={() => {}}
        onEaseBack={async () => {}}
        daysAway={24}
        easeBackFirst
        easeBackShare={0.1}
      />
    );
    expect(buttons()[0]).toMatch(/ease back in/i);
    unmount();
    setup({ daysAway: 16, easeBackFirst: false });
    expect(buttons()[0]).toMatch(/keep my old weights/i);
  });
});

describe("LiftReturnSheet — what it says", () => {
  it("rounds the gap to weeks, where days invite arithmetic", () => {
    setup({ daysAway: 24 });
    expect(screen.getByText("It's been about 3 weeks")).toBeInTheDocument();
  });

  it("says what easing back does before it does it", () => {
    setup({ easeBackShare: 0.2, daysAway: 70 });
    expect(
      screen.getByText(/takes 20% off each lift and a set off this week/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/climbs back a step a session to where it was/i)
    ).toBeInTheDocument();
  });

  it("changes register once the old weights are no longer the person's", () => {
    setup({ easeBackFirst: true });
    expect(
      screen.getByText(/your plan still has the weights you left on/i)
    ).toBeInTheDocument();
  });

  it("keeps a shorter break matter-of-fact", () => {
    setup({ daysAway: 16, easeBackFirst: false });
    expect(
      screen.getByText(/your plan is where you left it/i)
    ).toBeInTheDocument();
  });

  it("never scolds: no streak, loss or missed-session language", () => {
    // The constraint stated as a test rather than as a comment, so a
    // future copy edit that reaches for urgency fails here.
    for (const easeBackFirst of [false, true]) {
      const { unmount } = render(
        <LiftReturnSheet
          open
          onClose={() => {}}
          onEaseBack={async () => {}}
          daysAway={easeBackFirst ? 24 : 16}
          easeBackFirst={easeBackFirst}
          easeBackShare={0.1}
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
