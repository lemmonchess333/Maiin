/**
 * MacroRing — cal.ai tap-to-flip pattern (Q1 of the verifier
 * walkthrough). Pins the displayMode contract:
 *
 *   - "consumed" (default): centre shows value, sub-label shows the
 *     target so the row reads "42g of 120g protein"
 *   - "left": centre shows max(0, target − value), sub-label shows
 *     "left" so the row reads "78g protein left"
 *
 * The ring stroke always reflects consumed/target — only the textual
 * presentation flips. Over-target ("left" mode when value >= target)
 * clamps to 0g, matching cal.ai's behaviour rather than showing
 * negative numbers.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// haptic() is fire-and-forget; stub to avoid pulling Capacitor.
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import MacroRing from "../MacroRing";

describe("MacroRing — displayMode", () => {
  it("defaults to 'consumed' when displayMode is omitted", () => {
    render(
      <MacroRing
        value={42}
        target={120}
        color="#000"
        label="Protein"
        unit="g"
      />
    );
    expect(screen.getByText("42g")).toBeInTheDocument();
    expect(screen.getByText("120g")).toBeInTheDocument();
  });

  it("displayMode='consumed' shows the value and the target as sub-label", () => {
    render(
      <MacroRing
        value={42}
        target={120}
        color="#000"
        label="Protein"
        unit="g"
        displayMode="consumed"
      />
    );
    expect(screen.getByText("42g")).toBeInTheDocument();
    expect(screen.getByText("120g")).toBeInTheDocument();
    expect(screen.queryByText(/left/i)).not.toBeInTheDocument();
  });

  it("displayMode='left' shows remaining and 'left' as sub-label", () => {
    render(
      <MacroRing
        value={42}
        target={120}
        color="#000"
        label="Protein"
        unit="g"
        displayMode="left"
      />
    );
    // 120 − 42 = 78
    expect(screen.getByText("78g")).toBeInTheDocument();
    expect(screen.getByText("left")).toBeInTheDocument();
    // The raw target should NOT render as a sub-label when in left
    // mode (avoids ambiguity with "120g consumed").
    expect(screen.queryByText("120g")).not.toBeInTheDocument();
  });

  it("displayMode='left' clamps to 0g when value exceeds target", () => {
    render(
      <MacroRing
        value={150}
        target={120}
        color="#000"
        label="Protein"
        unit="g"
        displayMode="left"
      />
    );
    expect(screen.getByText("0g")).toBeInTheDocument();
    expect(screen.getByText("left")).toBeInTheDocument();
    // Don't render "-30g" or similar negative.
    expect(screen.queryByText(/^-/)).not.toBeInTheDocument();
  });

  it("displayMode='left' with zero consumed shows the full target as remaining", () => {
    render(
      <MacroRing
        value={0}
        target={120}
        color="#000"
        label="Protein"
        unit="g"
        displayMode="left"
      />
    );
    expect(screen.getByText("120g")).toBeInTheDocument();
    expect(screen.getByText("left")).toBeInTheDocument();
  });

  it("renders the label uppercased regardless of mode", () => {
    const { rerender } = render(
      <MacroRing
        value={42}
        target={120}
        color="#000"
        label="Protein"
        unit="g"
        displayMode="consumed"
      />
    );
    expect(screen.getByText("Protein")).toBeInTheDocument();
    rerender(
      <MacroRing
        value={42}
        target={120}
        color="#000"
        label="Protein"
        unit="g"
        displayMode="left"
      />
    );
    expect(screen.getByText("Protein")).toBeInTheDocument();
  });
});
