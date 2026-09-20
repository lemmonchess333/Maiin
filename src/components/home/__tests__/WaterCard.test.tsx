import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WaterCard from "../WaterCard";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/homeAnalytics", () => ({ track: vi.fn() }));

describe.each([false, true])("WaterCard compact=%s", (compact) => {
  it("keeps the remembered serving on both quick controls", () => {
    const onLog = vi.fn();
    render(
      <WaterCard
        compact={compact}
        ml={1750}
        targetMl={2000}
        servingMl={500}
        onLog={onLog}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Add 500 ml" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove 500 ml" }));
    expect(onLog.mock.calls).toEqual([[500], [-500]]);
  });

  it("cannot remove water from an empty day", () => {
    const onLog = vi.fn();
    render(
      <WaterCard compact={compact} ml={0} targetMl={2000} onLog={onLog} />
    );
    const remove = screen.getByRole("button", { name: "Remove 250 ml" });
    expect(remove).toBeDisabled();
    fireEvent.click(remove);
    expect(onLog).not.toHaveBeenCalled();
  });

  it("shows queued status without an unwired Retry button", () => {
    render(
      <WaterCard
        compact={compact}
        ml={1750}
        targetMl={2000}
        onLog={vi.fn()}
        syncStatus="Saved on this phone"
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved on this phone");
    expect(
      screen.queryByRole("button", { name: "Retry sync" })
    ).not.toBeInTheDocument();
  });

  it("offers Retry when a retry action exists", () => {
    const onRetry = vi.fn();
    render(
      <WaterCard
        compact={compact}
        ml={1750}
        targetMl={2000}
        onLog={vi.fn()}
        syncStatus="Needs attention"
        onRetry={onRetry}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry sync" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

/* Compact-only: the tile's third row, the shape the peer weight tile has
   always had and water lacked. Outside describe.each because the
   full-width variant composes its controls differently. */
describe("WaterCard compact tile — the meta row", () => {
  it("names the serving its quick controls will move", () => {
    /* `servingMl` is computed once and rendered twice — the glyphs'
       accessible names and the visible readout. That is the "one value,
       two readers" shape this project keeps regressing on, so pin that
       they AGREE rather than that either exists. Before this row the
       amount lived only in the aria-labels, so a sighted user tapping +
       could not tell whether they were adding 250 ml or 750. */
    render(
      <WaterCard
        compact
        ml={1000}
        targetMl={2000}
        servingMl={750}
        onLog={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: "Add 750 ml" })
    ).toBeInTheDocument();
    expect(screen.getByText("750 ml")).toBeInTheDocument();
  });

  it("keeps one match for each selector the capture specs anchor on", () => {
    /* Five capture specs plus a transition spec select the card body by
       /add water/i (home:92 + :339, nutrition-card:75,
       designer-onboarding:168, transition.capture:172), and
       water-sizes:63 uses /^Add \d+ ml$/. The body's accessible name
       now also carries the READING, so this pins that the substring
       those specs match on survived that rewrite — and that the new
       meta row did not add a second match for either. */
    render(<WaterCard compact ml={0} targetMl={2000} onLog={vi.fn()} />);
    expect(
      screen.getAllByRole("button", { name: /^Add \d+ ml$/ })
    ).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /add water/i })).toHaveLength(
      1
    );
  });

  it("compact: the halves and the readout are ONE stepper, and the edge is the pill's", () => {
    /* Row 3 was nudged three times (#2219, #2220, #2223) and still read
       as "the buttons look off centre". The last diagnosis put a
       text-micro serving label on the left as a counterweight to two
       44px rings on the right; a ~36px whisper does not balance ~92px of
       control, so the mass stayed right and the row stayed lopsided.

       Now the row IS the control: one segmented stepper spanning it —
       minus, readout, plus — the iOS UIStepper idiom and the shape
       EditServingsSheet already uses. This pins the STRUCTURE, because
       that is what changed: the two halves share one parent, the readout
       sits between them, and the solid `border-teal` edge #2223 measured
       at 4.04-6.08:1 belongs to that parent, the one boundary WCAG
       1.4.11 governs. The halves themselves carry no edge, no radius and
       no fill — a second edge inside the pill would read as three boxes,
       and every fill candidate measured 1.00-1.49:1 on this ground. */
    render(<WaterCard compact ml={500} targetMl={2000} onLog={vi.fn()} />);
    const add = screen.getByRole("button", { name: /^Add/ });
    const remove = screen.getByRole("button", { name: /^Remove/ });

    const pill = add.parentElement as HTMLElement;
    expect(remove.parentElement, "halves are not in one control").toBe(pill);
    expect(pill).toHaveAttribute("role", "group");
    for (const cls of ["rounded-full", "border", "border-teal"]) {
      expect(pill, `pill is missing ${cls}`).toHaveClass(cls);
    }

    const [first, middle, last] = Array.from(pill.children);
    expect(first, "minus must be the left half").toBe(remove);
    expect(last, "plus must be the right half").toBe(add);
    expect(middle, "readout must sit between the halves").toHaveTextContent(
      "250 ml"
    );

    for (const half of [remove, add]) {
      // 44px: IconButton md. Not `sm` — the tile provides no surrounding
      // padding that would widen a 36px hit area.
      expect(half).toHaveClass("size-11", "text-teal");
      for (const cls of [
        "rounded-full",
        "border-teal",
        "bg-background",
        "bg-card",
        "bg-muted",
      ]) {
        expect(half, `half should not carry ${cls}`).not.toHaveClass(cls);
      }
    }
  });

  it("hero: both quick controls keep one treatment — an edge, not a fill", () => {
    /* The full-width card keeps its two circles beside the reading; that
       row has an icon+reading cluster as counterweight and was never the
       complaint. The pin that used to live on the compact tile moves
       here unchanged, so #2223's measured treatment stays held on the
       surface that still uses it. */
    render(<WaterCard ml={500} targetMl={2000} onLog={vi.fn()} />);
    // Exact form: on this variant the card BODY is also named "Add water —
    // choose a container size", so a bare /^Add/ matches two buttons.
    const add = screen.getByRole("button", { name: /^Add \d+ ml$/ });
    const remove = screen.getByRole("button", { name: /^Remove \d+ ml$/ });
    for (const cls of ["rounded-full", "border", "border-teal", "text-teal"]) {
      expect(add, `plus is missing ${cls}`).toHaveClass(cls);
      expect(remove, `minus is missing ${cls}`).toHaveClass(cls);
    }
    for (const cls of ["bg-background", "bg-card", "bg-muted"]) {
      expect(add, `plus should carry no fill, has ${cls}`).not.toHaveClass(cls);
      expect(remove, `minus should carry no fill, has ${cls}`).not.toHaveClass(
        cls
      );
    }
  });
});

describe("WaterCard — it reports what you logged, not a score", () => {
  /* The card used to render "4.5 / 2 L ✓" and speak "… of 2 litres.
     Target reached." Owner call, from a device screenshot: drop the
     target framing entirely — "they don't even say out of two litres,
     they just say you're logging it… let people log it."

     So these pin ABSENCE. That is the point: the tick and the
     denominator are exactly the kind of thing that creeps back in a
     later polish pass, and a test that only checked the new string
     would not notice one returning beside it. */
  it("shows the amount with its own unit, and no target", () => {
    const { container } = render(
      <WaterCard compact ml={4500} targetMl={2000} onLog={vi.fn()} />
    );
    expect(container.textContent).toContain("4.5");
    expect(container.textContent).toContain("L");
    expect(container.textContent).not.toMatch(/\/\s*2/);
  });

  it("keeps millilitres in millilitres", () => {
    /* `formatLitresValue` always divided by 1000, so a 750 ml day read
       "0.75" — a leading zero and a decimal where every container label
       in the app says "750 ml". splitWaterVolume defers to the one
       formatter that decides the unit. */
    const { container } = render(
      <WaterCard compact ml={750} targetMl={2000} onLog={vi.fn()} />
    );
    expect(container.textContent).toContain("750");
    expect(container.textContent).toContain("ml");
    expect(container.textContent).not.toContain("0.75");
  });

  it("says nothing about a target, at any amount", () => {
    for (const ml of [0, 1750, 2000, 7250]) {
      const { unmount } = render(
        <WaterCard compact ml={ml} targetMl={2000} onLog={vi.fn()} />
      );
      const body = screen.getByRole("button", { name: /add water/i });
      expect(body, `${ml} ml`).not.toHaveAccessibleName(/target reached/i);
      expect(body, `${ml} ml`).not.toHaveAccessibleName(/of 2 litres/i);
      unmount();
    }
  });

  it("renders no completion tick once the old target is passed", () => {
    /* Anchored on a positive first: the reading must still RENDER at
       7.25 L. Asserting only that no tick exists would pass just as
       well if the whole numeral had vanished. */
    const { container } = render(
      <WaterCard compact ml={7250} targetMl={2000} onLog={vi.fn()} />
    );
    expect(container.textContent).toContain("7.25");
    expect(container.querySelector(".lucide-check")).toBeNull();
  });

  it("announces the new total after a quick log, not the delta", () => {
    /* Before this the card was write-only to a screen reader: swipe,
       "Add 250 ml, button", double-tap, a haptic, silence. The live
       region is mounted permanently and sr-only when idle — a region
       inserted with its text already present is commonly not spoken. */
    const onLog = vi.fn();
    const { rerender } = render(
      <WaterCard
        compact
        ml={1750}
        targetMl={2000}
        servingMl={250}
        onLog={onLog}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Add 250 ml" }));
    rerender(
      <WaterCard
        compact
        ml={2000}
        targetMl={2000}
        servingMl={250}
        onLog={onLog}
      />
    );
    const status = document.querySelector('[role="status"]') as HTMLElement;
    expect(status).toBeTruthy();
    expect(status.textContent).toMatch(/Water 2 litres logged\./);
  });

  it("a refused log leaves no announcement pending", () => {
    /* `onLog` returning false is a rejection. The sheet path checked it;
       the quick path did not, so a refused tap still fired the success
       feedback.

       The anchor matters here. Asserting "nothing announced" straight
       after the click passes whether or not the guard exists — the
       effect is keyed on `ml`, which a refused log never changes, so
       silence is the initial state rather than a result. The refusal
       must therefore be observed through a LATER change from another
       source: with the guard, that change is not the user's tap and is
       not announced; without it, the stale pending flag claims it. */
    const onLog = vi.fn(() => false);
    const { rerender } = render(
      <WaterCard
        compact
        ml={1750}
        targetMl={2000}
        servingMl={250}
        onLog={onLog}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Add 250 ml" }));
    rerender(
      <WaterCard
        compact
        ml={1900}
        targetMl={2000}
        servingMl={250}
        onLog={onLog}
      />
    );
    const status = document.querySelector('[role="status"]') as HTMLElement;
    expect(status.textContent).toBe("");
  });
});
