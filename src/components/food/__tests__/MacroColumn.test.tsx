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
   * The icon disc renders in BOTH states — only its intensity moves.
   *
   * It used to render only at goal, and the absence read as a missing
   * element rather than an unmet goal. On a real screen with protein and
   * fat met and carbs short, two icons had a circle and the wheat had
   * none, and that was reported as the wheat icon being broken. Nothing
   * on the tile explained that the circle meant anything, so "one of
   * these is drawn differently" was the only reading available.
   *
   * Measured from the emulator capture at the time of the fix: the carbs
   * disc went from (32,32,34) — the bare card, no tint at all — to
   * (47,43,32), while a reached disc stays roughly 2.4x that delta. So
   * the signal survives as intensity.
   *
   * Asserted structurally rather than by colour value: the presence of
   * the disc is the property that regressed, and an opacity number would
   * pin a design token this test has no business owning.
   */
  it("renders the icon disc whether or not the goal is met", () => {
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
    // The reported case: far short of target, and it still has a disc.
    expect(screen.queryByText(/carbs goal reached/i)).toBeNull();
    expect(discOf(under.container)).not.toBeNull();
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
    expect(screen.getByText(/carbs goal reached/i)).toBeInTheDocument();
    expect(discOf(over.container)).not.toBeNull();
  });
});
