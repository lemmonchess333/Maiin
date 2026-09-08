/**
 * MacroRing — one macro against its daily target.
 *
 * The ring reads without a tap: grams logged in the centre, the
 * nutrient's name and its target beneath. It previously carried a
 * `displayMode` flip ("consumed" / "left") driven by tapping the row
 * inside the card's disclosure; with the disclosure gone and the target
 * named in full under every ring, remaining is legible without a hidden
 * mode, so the prop and the tests for it went with it.
 *
 * What the tests below hold is the part a reader depends on: the centre
 * is the logged figure and stays truthful past target, the target is
 * LABELLED rather than left as a bare number to be inferred, a macro
 * with no fundable goal says so in words, and an unfilled ring is drawn
 * as empty rather than as disabled.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// haptic() is fire-and-forget; stub to avoid pulling Capacitor.
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import MacroRing from "../MacroRing";

function renderRing(props: Partial<Parameters<typeof MacroRing>[0]> = {}) {
  return render(
    <MacroRing
      value={42}
      target={120}
      color="#EC4899"
      label="Protein"
      unit="g"
      {...props}
    />
  );
}

describe("MacroRing — what the ring says without a tap", () => {
  it("puts the logged grams in the centre and names the target beneath", () => {
    renderRing();
    expect(screen.getByText("42g")).toBeInTheDocument();
    // "Target 120g", not a bare "120g" the reader has to interpret.
    expect(screen.getByText("Target 120g")).toBeInTheDocument();
    expect(screen.getByText("Protein")).toBeInTheDocument();
  });

  it("keeps the real figure past target — never clamped, never negative", () => {
    renderRing({ value: 150 });
    expect(screen.getByText("150g")).toBeInTheDocument();
    expect(screen.getByText("Target 120g")).toBeInTheDocument();
    expect(screen.queryByText(/^-/)).not.toBeInTheDocument();
  });

  it("does not wrap the arc back around when over target", () => {
    /* `macroRingState` caps the ratio at 1.3 and the dash array takes
       min(pct, 1). Without the second clamp a 150/120 ring would draw
       1.25 turns and read as 25% complete — a worse lie than showing
       nothing. Asserted on the geometry rather than a snapshot: the
       filled arc's dash length must equal the full circumference. */
    const { container } = renderRing({ value: 150 });
    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(2);
    const [dash, gap] = (
      circles[1].getAttribute("strokeDasharray") ??
      circles[1].getAttribute("stroke-dasharray") ??
      ""
    )
      .split(" ")
      .map(Number);
    expect(dash).toBeCloseTo(gap, 5);
  });

  it("Nutr3: a macro with no fundable goal says so, rather than 'Target 0g'", () => {
    renderRing({ value: 80, target: 0 });
    expect(screen.getByText("80g")).toBeInTheDocument();
    expect(screen.getByText("No target")).toBeInTheDocument();
    expect(screen.queryByText(/Target 0g/)).not.toBeInTheDocument();
  });

  it("draws an unfilled ring as EMPTY, not as absent", () => {
    /* Zero logged must still look like a usable control. The track is
       always drawn; only the progress arc is conditional, so an empty
       ring is one circle rather than none. */
    const { container } = renderRing({ value: 0 });
    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(1);
    expect(circles[0].getAttribute("stroke")).toBe(
      "hsl(var(--muted-foreground) / 0.22)"
    );
    expect(screen.getByText("0g")).toBeInTheDocument();
  });

  it("uses a NEUTRAL track, not a tint of the macro's own hue", () => {
    /* The contrast decision this component's header records. A track
       drawn as `color + "18"` measured 1.06:1 against the card for
       carbs — invisible — and raising the alpha cannot fix yellow. If
       someone reintroduces a hue-derived track, the three rings become
       unequal again with the worst one unreadable. */
    for (const color of ["#EC4899", "#EAB308", "#7CB46C"]) {
      const { container, unmount } = renderRing({ value: 0, color });
      const track = container.querySelector("circle");
      expect(track?.getAttribute("stroke")).not.toContain(color);
      expect(track?.getAttribute("stroke")).toBe(
        "hsl(var(--muted-foreground) / 0.22)"
      );
      unmount();
    }
  });

  it("gives assistive tech ONE sentence, not three fragments", () => {
    /* Read as separate nodes the ring announced "98g / Protein / Target
       140g", and "42g" is spoken "forty-two gee" — `g` beside a numeral
       is a glyph, not a word. The visual fragments are aria-hidden and
       this sentence stands in for them. */
    renderRing();
    expect(
      screen.getByText("Protein: 42 grams logged, target 120 grams")
    ).toBeInTheDocument();
  });

  it("hides the visual fragments from assistive tech, so nothing doubles", () => {
    /* The sr-only sentence REPLACES the fragments; it does not sit
       alongside them. Without the aria-hidden wrappers a reader hears
       the sentence and then "98g Protein Target 140g" again. Pinned
       because removing either wrapper is invisible to every other
       assertion in this file. */
    renderRing();
    for (const node of [screen.getByText("42g"), screen.getByText("Protein")]) {
      expect(node.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it("says a reached target in words, not by colour alone", () => {
    renderRing({ value: 118 });
    expect(screen.getByText(/target reached/)).toBeInTheDocument();
  });

  it("says nothing about a target that is not reached", () => {
    renderRing({ value: 42 });
    expect(screen.queryByText(/target reached/)).not.toBeInTheDocument();
  });

  it("names the no-target case for assistive tech too", () => {
    renderRing({ value: 80, target: 0 });
    expect(
      screen.getByText("Protein: 80 grams logged, no target")
    ).toBeInTheDocument();
  });
});
