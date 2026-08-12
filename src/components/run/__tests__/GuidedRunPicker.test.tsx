/**
 * The guided-run list is a single-select control whose selected item was
 * marked by colour and nothing else: a tinted background, a tinted border,
 * a glow ring, a coloured title. No icon, no text, no aria state.
 *
 * So a screen-reader user could operate the list but never learn which run
 * they had chosen — the picker announced seven identical-sounding buttons
 * before and after a tap.
 *
 * The neighbouring `RunSetupModal` activity chooser does convey it, via a
 * `Check` with `aria-label="Selected"`; this list had no equivalent, which
 * is what made it the outlier rather than a house style.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GuidedRunPicker from "@/components/run/GuidedRunPicker";
import { GUIDED_WORKOUTS } from "@/lib/guidedRun";

const nameOf = (i: number) => GUIDED_WORKOUTS[i].name;

describe("GuidedRunPicker — selection is announced, not just tinted", () => {
  it("has workouts to pick from", () => {
    // Guards every assertion below: an empty catalogue would make the
    // queries vacuous rather than failing.
    expect(GUIDED_WORKOUTS.length).toBeGreaterThan(1);
  });

  it("marks exactly the selected workout as pressed", () => {
    /* Asserted as a pair — "always pressed" is as useless as "never
       pressed", and only one of those is caught by checking the
       selected item alone. */
    render(
      <GuidedRunPicker selected={GUIDED_WORKOUTS[0]} onSelect={vi.fn()} />
    );
    const buttons = screen.getAllByRole("button");
    const pressed = buttons.filter(
      (b) => b.getAttribute("aria-pressed") === "true"
    );
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain(nameOf(0));
  });

  it("moves the pressed state when a different workout is selected", () => {
    const { rerender } = render(
      <GuidedRunPicker selected={GUIDED_WORKOUTS[0]} onSelect={vi.fn()} />
    );
    rerender(
      <GuidedRunPicker selected={GUIDED_WORKOUTS[1]} onSelect={vi.fn()} />
    );
    const pressed = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain(nameOf(1));
  });

  it("presses nothing before the user has chosen", () => {
    /* The picker opens with no selection, and that state has to be
       distinguishable too — otherwise the first item reads as chosen. */
    render(<GuidedRunPicker selected={null} onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(GUIDED_WORKOUTS.length);
    for (const b of buttons) {
      expect(b.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("names each workout in its accessible content", () => {
    // The state is only useful if the option it attaches to is identifiable.
    render(<GuidedRunPicker selected={null} onSelect={vi.fn()} />);
    for (const w of GUIDED_WORKOUTS) {
      expect(screen.getByText(w.name)).toBeTruthy();
    }
  });
});
