import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The legend's recovery chip, which said "~ 1 d".
 *
 * The chip is an `inline-flex` with `gap-1`, and `~` and `d` sat either
 * side of the number as bare text. Contiguous text in a flex container
 * becomes an anonymous flex ITEM, so the gap applied between all three:
 * the tilde came away from the figure it qualifies and the unit came away
 * from both. It is one element now, so the gap only separates the status
 * dot from the token.
 *
 * The second half is that the chip's only explanation was `title`, a
 * hover affordance on a surface people touch. A screen reader was
 * announced "tilde one d"; a phone user got the same characters and no
 * way to reach the sentence. The sentence is an `aria-label` now — which
 * does not help a sighted touch user, but the word "recovery" in the
 * footnote below the legend and the "ready" chip beside it are what carry
 * that reading, and both already ship.
 */
vi.mock("react-body-highlighter", () => ({
  default: () => null,
}));
vi.mock("@/components/BodyMapGlow", () => ({ default: () => null }));

import MuscleHeatMap from "../MuscleHeatMap";

function renderMap() {
  return render(
    <MuscleHeatMap
      data={{ Chest: 4, Back: 6 }}
      recovery={{
        Chest: { status: "recovering", readyInDays: 1 },
        Back: { status: "ready", readyInDays: 0 },
      }}
    />
  );
}

describe("recovery chip", () => {
  it("keeps the tilde, the number and the unit as one token", () => {
    renderMap();
    // Exact text, with no whitespace anywhere inside it. `getByText`
    // normalises whitespace by default, which would make "~ 1 d" match a
    // query for "~1d" — the very defect this pins. So read the node's
    // own textContent instead.
    const token = screen.getByText(/^~\d+d$/);
    expect(token.textContent).toBe("~1d");
    expect(screen.queryByText("~")).toBeNull();
    expect(screen.queryByText("d")).toBeNull();
  });

  it("announces the sentence, not the glyphs", () => {
    renderMap();
    expect(screen.getByLabelText("Chest ready in ~1d")).toBeInTheDocument();
    expect(screen.getByLabelText("Back is recovered")).toBeInTheDocument();
  });

  it("still renders the recovered chip as a word", () => {
    // The pair is what makes the compact form readable: "ready" beside
    // "~1d" is why a countdown needs no label of its own.
    renderMap();
    expect(screen.getByText("ready")).toBeInTheDocument();
  });
});
