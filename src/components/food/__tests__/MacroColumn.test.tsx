/**
 * MacroColumn — pin the `onTap` contract.
 *
 * The component is rendered as a `<button>` and the comment in the
 * source declares onTap as a "forward-compat tap hook (no-op for
 * phase 1)". Q1 of the verifier walkthrough surfaced that the tap
 * was wired but no caller passed a handler, so the macro tiles felt
 * dead. This test pins the contract: when the caller DOES pass
 * onTap, clicking the button must fire it.
 *
 * Why this is the right surface to test: the regression risk is
 * future MacroColumn refactors removing the onClick wiring on the
 * outer button. That's structural — not visible from FoodHeroCard
 * integration tests, which would still pass if the wiring quietly
 * went away.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Beef } from "lucide-react";

import MacroColumn from "../MacroColumn";

describe("MacroColumn — tap contract", () => {
  it("calls onTap when the tile is clicked", () => {
    const onTap = vi.fn();
    render(
      <MacroColumn
        macroKey="protein"
        Icon={Beef}
        consumed={42}
        target={120}
        label="PROTEIN"
        color="#000"
        mode="eaten"
        onTap={onTap}
      />
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("does not throw when onTap is omitted (default no-op)", () => {
    render(
      <MacroColumn
        macroKey="protein"
        Icon={Beef}
        consumed={42}
        target={120}
        label="PROTEIN"
        color="#000"
        mode="eaten"
      />
    );
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
  });

  // Food-delight #3: once a macro meets its goal the glyph shows a lasting
  // "hit it" state (halo + sr-only announcement); below goal it doesn't.
  it("announces the goal-reached state only when consumed >= target", () => {
    const { rerender } = render(
      <MacroColumn
        macroKey="protein"
        Icon={Beef}
        consumed={80}
        target={120}
        label="Protein"
        color="#000"
        mode="eaten"
      />
    );
    expect(screen.queryByText(/protein goal reached/i)).toBeNull();

    rerender(
      <MacroColumn
        macroKey="protein"
        Icon={Beef}
        consumed={120}
        target={120}
        label="Protein"
        color="#000"
        mode="eaten"
      />
    );
    expect(screen.getByText(/protein goal reached/i)).toBeInTheDocument();
  });

  /**
   * The icon is a bare glyph in EVERY state — no disc behind it, ever.
   *
   * This has been wrong in both directions, which is why it is pinned
   * rather than left to the eye:
   *
   *   1. The disc originally rendered only once the goal was met. With
   *      protein and fat met and carbs short, two icons had a circle and
   *      the wheat had none — reported as the wheat icon being broken.
   *      Nothing said the circle meant anything, so "one of these is
   *      drawn differently" was the only reading available.
   *   2. The first fix rendered it always, moving the signal to
   *      intensity. That removed the misreading, and the operator's call
   *      on seeing it was that the tiles read cleaner with no disc at
   *      all — which answers the same problem more completely, since
   *      three identical tiles cannot be misread whatever the numbers do.
   *
   * The goal state is still carried, so this costs no information: the
   * sr-only announcement (asserted above), the progress bar, the
   * "X / Yg" line, and LEFT mode's "over" label.
   *
   * Both directions are covered — met AND unmet — because a regression
   * that reintroduces the disc would most likely do it on one branch,
   * which is exactly how the original asymmetry arose.
   */
  it("renders NO disc behind the icon, goal met or not", () => {
    function discOf(container: HTMLElement) {
      return container.querySelector<HTMLElement>(
        'span[aria-hidden="true"].rounded-full'
      );
    }

    const under = render(
      <MacroColumn
        macroKey="carbs"
        Icon={Beef}
        consumed={53}
        target={504}
        label="Carbs"
        color="#D9884E"
        mode="eaten"
      />
    );
    expect(screen.queryByText(/carbs goal reached/i)).toBeNull();
    expect(discOf(under.container)).toBeNull();
    under.unmount();

    const over = render(
      <MacroColumn
        macroKey="carbs"
        Icon={Beef}
        consumed={520}
        target={504}
        label="Carbs"
        color="#D9884E"
        mode="eaten"
      />
    );
    // Goal IS met — announced to screen readers, and still no disc.
    expect(screen.getByText(/carbs goal reached/i)).toBeInTheDocument();
    expect(discOf(over.container)).toBeNull();
  });
});

/**
 * The tile is a toggle shared with the calorie ring, so its accessible
 * name has to say what the tap DOES, not what the tile currently shows.
 * The visible number already carries the state; what a screen-reader
 * user cannot see is the destination.
 *
 * Before this, the button had no `aria-label` at all — its accessible
 * name was the concatenated visible text ("42g eaten 42 / 120g PROTEIN"),
 * which announces the state twice and the action never.
 */
describe("MacroColumn — accessible toggle label", () => {
  function renderIn(mode: "eaten" | "left") {
    render(
      <MacroColumn
        macroKey="protein"
        Icon={Beef}
        consumed={42}
        target={120}
        label="PROTEIN"
        color="#000"
        mode={mode}
      />
    );
  }

  it("in EATEN mode, offers to show what is remaining", () => {
    renderIn("eaten");
    expect(
      screen.getByRole("button", { name: "Show protein remaining" })
    ).toBeInTheDocument();
  });

  it("in LEFT mode, offers to show what has been eaten", () => {
    renderIn("left");
    expect(
      screen.getByRole("button", { name: "Show protein eaten" })
    ).toBeInTheDocument();
  });

  it("names the macro it belongs to, so three tiles are distinguishable", () => {
    // All three tiles are otherwise identical to a screen reader walking
    // the row; the macro name is what separates them.
    render(
      <MacroColumn
        macroKey="carbs"
        Icon={Beef}
        consumed={10}
        target={200}
        label="CARBS"
        color="#000"
        mode="eaten"
      />
    );
    expect(
      screen.getByRole("button", { name: "Show carbs remaining" })
    ).toBeInTheDocument();
  });
});

describe("MacroColumn — numeric hierarchy", () => {
  it("renders the unit smaller than the figure it qualifies", () => {
    // The `g` shipped at text-2xl, identical to the number, so "42g"
    // read as one token rather than a value with a unit. The NUMBER is
    // deliberately unchanged — it is glanceable data, and shrinking it
    // to fix a problem caused by its neighbour is the wrong lever.
    const { container } = render(
      <MacroColumn
        macroKey="protein"
        Icon={Beef}
        consumed={42}
        target={120}
        label="PROTEIN"
        color="#000"
        mode="eaten"
      />
    );
    const unit = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "g"
    );
    expect(unit).toBeDefined();
    expect(unit).toHaveClass("text-small");
    expect(unit).not.toHaveClass("text-2xl");

    const figure = unit?.closest("p");
    expect(figure).toHaveClass("text-2xl");
    expect(figure).toHaveClass("font-mono");
    expect(figure).toHaveClass("tabular-nums");
    // A three-digit value plus its unit must stay on one line now the
    // column can be narrower than it was under flex-1.
    expect(figure).toHaveClass("whitespace-nowrap");
  });
});

describe("MacroColumn — the goal-reached state stays in the accessible name", () => {
  /* Regression guard. Adding an `aria-label` to this button REPLACED the
     content-derived accessible name, which silently dropped the sr-only
     "{label} goal reached" out of it. `surfaces.screens.capture.spec.ts`
     asserts that name as the state-independent proof of the halo — but
     that spec only runs in the screenshot CI job, so the whole unit
     suite stayed green while the regression shipped to main.

     This is the unit-level guard that was missing. It fails if the state
     is ever dropped from the name again, whatever draws the halo. */
  function renderAt(consumed: number, target: number) {
    render(
      <MacroColumn
        macroKey="protein"
        Icon={Beef}
        consumed={consumed}
        target={target}
        label="PROTEIN"
        color="#000"
        mode="eaten"
      />
    );
  }

  it("announces the goal alongside the action once the target is met", () => {
    renderAt(130, 120);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAccessibleName(/goal reached/i);
    // The action half must survive too — the name has to say what the
    // tap does, not only what state the tile is in.
    expect(btn).toHaveAccessibleName(/show protein remaining/i);
  });

  it("says nothing about a goal that has not been reached", () => {
    renderAt(42, 120);
    expect(screen.getByRole("button")).not.toHaveAccessibleName(
      /goal reached/i
    );
  });
});
