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
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
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
        label="Protein"
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
        label="Protein"
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
 * name was the concatenated visible text ("42g logged 42 / 120g PROTEIN"),
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
        label="Protein"
        color="#000"
        mode={mode}
      />
    );
  }

  it("in EATEN mode, offers to show what is remaining", () => {
    renderIn("eaten");
    expect(
      screen.getByRole("button", {
        name: "Show protein remaining. 42g logged of 120g",
      })
    ).toBeInTheDocument();
  });

  it("in LEFT mode, offers to show what has been logged", () => {
    renderIn("left");
    expect(
      screen.getByRole("button", {
        name: "Show protein logged. 42g logged of 120g",
      })
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
        label="Carbs"
        color="#000"
        mode="eaten"
      />
    );
    expect(
      screen.getByRole("button", {
        name: "Show carbs remaining. 10g logged of 200g",
      })
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
        label="Protein"
        color="#000"
        mode="eaten"
      />
    );
    const unit = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "g"
    );
    expect(unit).toBeDefined();
    expect(unit).toHaveClass("text-base");
    expect(unit).not.toHaveClass("text-2xl");

    const figure = unit?.closest("p");
    expect(figure).toHaveClass("text-2xl");
    // The tile's number is a stand-alone figure: Archivo (DESIGN_GUIDE §4).
    expect(figure).toHaveClass("font-figure");
    expect(figure).toHaveClass("tabular-nums");
    // A three-digit value plus its unit must stay on one line now the
    // column can be narrower than it was under flex-1.
    expect(figure).toHaveClass("whitespace-nowrap");
  });

  it.each([
    [false, "text-base"],
    [true, "text-sm"],
  ])(
    "sets the g as a word on the figure's baseline (compact: %s)",
    (compact, size) => {
      /* The owner read "150g left" on Home as a big number with a much
         smaller "g" glued to it: a 12px bold g under a 20px figure sits
         like a subscript. The g is a word, so it takes the text face at
         the weight of the tile's other words, about two thirds of the
         figure, as the weight tile's "kg" does — and stays unspaced,
         the food surface's "128g". */
      const { container } = render(
        <MacroColumn
          macroKey="protein"
          Icon={Beef}
          consumed={42}
          target={120}
          label="Protein"
          color="#000"
          mode="eaten"
          size={compact ? "compact" : "tile"}
        />
      );
      const unit = container.querySelector("[data-macro-unit]");
      expect(unit).toHaveTextContent(/^g$/);
      expect(unit).toHaveClass("font-sans", "font-medium", size);
      expect(unit).not.toHaveClass("font-bold");
      expect(unit).not.toHaveClass("text-xs");
      expect(unit?.previousSibling?.textContent).toMatch(/\d$/);
    }
  );
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
        label="Protein"
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

/**
 * The bar fades when it is EMPTY, which since Food11 call 5 is a macro
 * with nothing logged, in both modes: the bar is what is logged.
 *
 * Before Food11, LEFT mode (the default) drew what was left, so a day
 * with nothing logged was a FULL bar and a target used up was an empty
 * one. The two LEFT cases below pinned that; they now pin the reverse.
 *
 * Each case anchors on the accessible name first, so the opacity is read
 * from the state the test claims to be in.
 */
describe("MacroColumn — the bar fades only when it is empty", () => {
  function renderAt(mode: "left" | "eaten", consumed: number) {
    const { container } = render(
      <MacroColumn
        macroKey="protein"
        Icon={Beef}
        consumed={consumed}
        target={150}
        label="Protein"
        color="#EC4899"
        mode={mode}
      />
    );
    const bar = container.querySelector<HTMLElement>("[data-macro-bar]");
    expect(bar).not.toBeNull();
    return bar!;
  }

  it("LEFT mode with nothing logged fades the empty track", () => {
    // Food11 call 5: the bar is what is logged in both modes, so nothing
    // logged is an empty bar here too. It was a full bar in this mode.
    const bar = renderAt("left", 0);
    expect(
      screen.getByRole("button", {
        name: "Show protein logged. 0g logged of 150g",
      })
    ).toBeInTheDocument();
    expect(bar.style.opacity).toBe("0.4");
  });

  it("EATEN mode with nothing eaten fades the empty track", () => {
    const bar = renderAt("eaten", 0);
    expect(
      screen.getByRole("button", {
        name: "Show protein remaining. 0g logged of 150g",
      })
    ).toBeInTheDocument();
    expect(bar.style.opacity).toBe("0.4");
  });

  it("LEFT mode with the target reached draws the full bar at full strength", () => {
    const bar = renderAt("left", 150);
    expect(
      screen.getByRole("button", { name: /150g logged of 150g$/ })
    ).toBeInTheDocument();
    expect(bar.style.opacity).toBe("1");
  });

  it.each(["row", "compact"] as const)(
    "the %s form keeps its empty groove at full strength, as the wheel's track is",
    (size) => {
      // Beside the wheel the bars share its grey groove. Faded, an empty
      // bar was 8% grey under a wheel track at 20%.
      for (const mode of ["left", "eaten"] as const) {
        const { container } = render(
          <MacroColumn
            macroKey="protein"
            Icon={Beef}
            consumed={0}
            target={150}
            label="Protein"
            color="#EC4899"
            mode={mode}
            size={size}
          />
        );
        const bar = container.querySelector<HTMLElement>("[data-macro-bar]")!;
        expect(bar.style.background).toContain("var(--muted-foreground)");
        expect(bar.style.opacity).toBe("1");
        cleanup();
      }
    }
  );

  it("a part-eaten bar is at full strength in both modes", () => {
    for (const mode of ["left", "eaten"] as const) {
      const bar = renderAt(mode, 60);
      expect(
        screen.getByRole("button", { name: /60g logged of 150g$/ })
      ).toBeInTheDocument();
      expect(bar.style.opacity).toBe("1");
      cleanup();
    }
  });
});

/**
 * Which way the bar runs (Food11 call 5): it is what is logged, in both
 * modes. The figure beside it follows the left and logged switch; the bar
 * does not. In "left" it used to start full and empty as food was logged.
 */
describe("MacroColumn — the bar is what is logged, in both modes", () => {
  function fillWidth(mode: "left" | "eaten", consumed: number) {
    const { container } = render(
      <MacroColumn
        macroKey="protein"
        Icon={Beef}
        consumed={consumed}
        target={150}
        label="Protein"
        color="#EC4899"
        mode={mode}
        drawIn={false}
      />
    );
    const fill = container.querySelector<HTMLElement>(
      "[data-macro-bar] > div"
    )!;
    const width = fill.style.width;
    cleanup();
    return width;
  }

  it.each(["left", "eaten"] as const)(
    "%s: empty with nothing logged",
    (mode) => {
      expect(fillWidth(mode, 0)).toBe("0%");
    }
  );

  it.each(["left", "eaten"] as const)("%s: 60 of 150g is a 40% bar", (mode) => {
    expect(fillWidth(mode, 60)).toBe("40%");
  });

  it.each(["left", "eaten"] as const)(
    "%s: full at the target and past it",
    (mode) => {
      expect(fillWidth(mode, 150)).toBe("100%");
      expect(fillWidth(mode, 190)).toBe("100%");
    }
  );

  it("LEFT mode still counts the figure down while the bar fills", () => {
    render(
      <MacroColumn
        macroKey="protein"
        Icon={Beef}
        consumed={60}
        target={150}
        label="Protein"
        color="#EC4899"
        mode="left"
        drawIn={false}
      />
    );
    expect(screen.getByRole("button")).toHaveTextContent(/90g\s*left/);
  });
});

/**
 * The compact tile is Home's: the same tile, smaller, on Home's card
 * beside the calorie ring. What changes is size, and the bar track, which
 * takes the ring's grey groove so the card has one grey for "not yet".
 */
describe("MacroColumn — compact size", () => {
  function draw(size?: "tile" | "compact") {
    const { container } = render(
      <MacroColumn
        macroKey="carbs"
        Icon={Beef}
        consumed={56}
        target={220}
        label="Carbs"
        color="#EAB308"
        mode="left"
        size={size}
      />
    );
    const icon = container.querySelector("svg")!;
    const number = container.querySelector("p")!;
    const track = container.querySelector<HTMLElement>("[data-macro-bar]")!;
    const out = {
      icon: icon.getAttribute("class") ?? "",
      number: number.className,
      track: track.style.background,
    };
    cleanup();
    return out;
  }

  it("keeps the centred tile as the default", () => {
    const tile = draw();
    expect(tile.icon).toContain("size-6");
    expect(tile.number).toContain("text-2xl");
    expect(tile.track).toContain("var(--muted)");
  });

  it("draws Home's tile smaller, with the ring's grey track", () => {
    const compact = draw("compact");
    expect(compact.icon).toContain("size-5");
    expect(compact.number).toContain("text-xl");
    expect(compact.track).toContain("var(--muted-foreground)");
  });
});

/**
 * The row is Food's (Food11 call 4): no box, read from the left. The
 * name leads at the page's 14px, the figure has its word beside it, and
 * the bar is a 4px line on the wheel's grey groove.
 */
describe("MacroColumn — the row form", () => {
  function drawRow(mode: "left" | "eaten" = "left") {
    return render(
      <MacroColumn
        macroKey="carbs"
        Icon={Beef}
        consumed={172}
        target={273}
        label="Carbs"
        color="#EAB308"
        mode={mode}
        size="row"
        drawIn={false}
      />
    );
  }

  it("reads name, then figure and word, then bar, from the left", () => {
    const { container } = drawRow();
    const button = container.querySelector("[data-macro]")!;
    expect(button).toHaveClass("text-left", "items-stretch");
    expect(button).not.toHaveClass("text-center", "items-center");

    const [nameLine, figureLine, bar] = Array.from(button.children);
    expect(nameLine).toHaveTextContent(/^Carbs$/);
    expect(nameLine).toHaveClass("text-sm", "font-semibold", "text-foreground");
    expect(nameLine.querySelector("svg")).toHaveClass("size-4");
    expect(figureLine).toHaveTextContent(/^101g\s*left$/);
    expect(bar).toHaveAttribute("data-macro-bar");
  });

  it("sets the figure at 20px with its g and its word at 14px", () => {
    const { container } = drawRow();
    const unit = container.querySelector("[data-macro-unit]")!;
    expect(unit).toHaveClass("text-sm", "font-sans", "font-medium");
    const figure = unit.parentElement!;
    expect(figure).toHaveClass("text-xl", "font-figure", "whitespace-nowrap");
    expect(figure).not.toHaveClass("text-2xl");
    const word = figure.nextElementSibling!;
    expect(word).toHaveTextContent(/^left$/);
    expect(word).toHaveClass("text-sm", "text-muted-foreground");
    // The word may drop under the figure in a narrow column, never clip.
    expect(figure.parentElement).toHaveClass("flex-wrap");
  });

  it("draws a 4px bar on the wheel's groove, with no inner shadow", () => {
    const { container } = drawRow();
    const track = container.querySelector<HTMLElement>("[data-macro-bar]")!;
    expect(track).toHaveClass("h-1");
    expect(track).not.toHaveClass("h-1.5");
    expect(track.style.background).toContain("var(--muted-foreground)");
    expect(track.style.boxShadow).toBe("");
  });

  it("is at least 44px tall and fills its column", () => {
    const { container } = drawRow();
    expect(container.querySelector("[data-macro]")).toHaveClass(
      "min-h-[44px]",
      "w-full",
      "min-w-0"
    );
  });

  it("keeps the tile's name for screen readers", () => {
    drawRow("eaten");
    expect(
      screen.getByRole("button", {
        name: "Show carbs remaining. 172g logged of 273g",
      })
    ).toBeInTheDocument();
  });
});
