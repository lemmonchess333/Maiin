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
});
