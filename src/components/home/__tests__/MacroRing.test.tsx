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

/**
 * Matches text that spans child elements. The target labels set the WORD
 * in the display font and the FIGURE in the numeral font, so "Target
 * 140g" is a `<p>` wrapping a `<span>` rather than one text node, and a
 * plain string matcher finds nothing. The children check excludes
 * ancestors, which would otherwise match too.
 */
function spanning(text: string) {
  const norm = (s: string | null | undefined) =>
    (s ?? "").replace(/\s+/g, " ").trim();
  return (_: string, el: Element | null) =>
    !!el &&
    norm(el.textContent) === text &&
    !Array.from(el.children).some((c) => norm(c.textContent) === text);
}

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
    expect(screen.getByText(spanning("Target 120g"))).toBeInTheDocument();
    expect(screen.getByText("Protein")).toBeInTheDocument();
  });

  it("keeps the real figure past target — never clamped, never negative", () => {
    renderRing({ value: 150 });
    expect(screen.getByText("150g")).toBeInTheDocument();
    expect(screen.getByText(spanning("Target 120g"))).toBeInTheDocument();
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
    expect(screen.getByText("0g")).toBeInTheDocument();
  });

  it("carries the macro's own hue at zero, where nothing else does", () => {
    /* Replaces a lock that required a NEUTRAL track. That lock's
       measurement was right about the value it tested and wrong about
       the conclusion it drew: it tinted `THEME.macros.carbs`, the ACCENT
       #EAB308, which is capped at 1.92:1 on a white card even solid — so
       "yellow cannot clear it at any alpha" held for the accent and not
       for the macro. `useMacroPalette().text` swaps to #A16207 in light
       precisely so macro colour survives there, and TodayEnergy now
       passes it.

       Measured against --card, with the caller passing the theme's own
       palette track:

                    track@35%        arc vs card      arc vs track
         light      1.85/1.62/1.59   6.04/4.92/4.83   3.26/3.03/3.03
         dark       1.61/2.20/1.97   4.62/8.49/6.67   2.87/3.86/3.38

       The neutral groove replaced was 1.34 light / 1.48 dark, so every
       macro is MORE visible than before in both themes. */
    for (const color of ["#BE185D", "#A16207", "#4F7D43"]) {
      const { container, unmount } = renderRing({ value: 0, color });
      const track = container.querySelector("circle");
      expect(track?.getAttribute("stroke")).toBe(`${color}59`);
      unmount();
    }
  });

  it("keeps the arc SOLID so filled reads as filled against remaining", () => {
    /* The pair is the contract, not either alone: an arc drawn at the
       track's alpha would leave a ring that is uniformly coloured and
       says nothing about progress. */
    const { container } = renderRing({
      value: 70,
      target: 100,
      color: "#A16207",
    });
    const [track, arc] = Array.from(container.querySelectorAll("circle"));
    expect(track.getAttribute("stroke")).toBe("#A1620759");
    expect(arc.getAttribute("stroke")).toBe("#A16207");
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

describe("TodayEnergy hands the rings a theme-aware colour", () => {
  /* The half of the fix that does not live in MacroRing. `THEME.macros`
     is ONE fixed set for both themes, so passing it put the carbs arc at
     1.92:1 on a white card — the filled portion, the half that carries
     the reading, effectively invisible in light mode. Pinned at the
     source rather than by rendering TodayEnergy, which needs the whole
     Home data stack; what matters is that the raw accents are not the
     thing handed to the ring. */
  it("passes the palette's text track, not the raw THEME.macros accents", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../TodayEnergy.tsx"), "utf8");

    expect(src, "TodayEnergy must resolve macro colour per theme").toContain(
      "useMacroPalette"
    );
    const macroBlock = src.slice(
      src.indexOf("const macros = ["),
      src.indexOf("];", src.indexOf("const macros = ["))
    );
    expect(macroBlock).toContain("macroText.protein");
    expect(macroBlock).toContain("macroText.carbs");
    expect(macroBlock).toContain("macroText.fat");
    expect(
      macroBlock,
      "the raw accents are theme-blind — carbs is 1.92:1 on a light card"
    ).not.toContain("THEME.macros");
  });
});
