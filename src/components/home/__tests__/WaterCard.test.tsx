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

  it("gives both quick controls one treatment", () => {
    /* They differed on three axes at once — border presence, background
       alpha, and the disabled state — so a stepper pair read as two
       different KINDS of control. The border is load-bearing at full
       fill (the disc is ~1.21:1 against the blended ground without it),
       so it is pinned rather than left to taste. */
    render(<WaterCard compact ml={500} targetMl={2000} onLog={vi.fn()} />);
    const add = screen.getByRole("button", { name: /^Add/ });
    const remove = screen.getByRole("button", { name: /^Remove/ });
    for (const cls of [
      "rounded-full",
      "bg-background",
      "border",
      "border-teal/30",
      "text-teal",
    ]) {
      expect(add, `plus is missing ${cls}`).toHaveClass(cls);
      expect(remove, `minus is missing ${cls}`).toHaveClass(cls);
    }
  });
});

describe("WaterCard — the target is reached", () => {
  /* `waterProgress` clamps at 1, so from the target upward every visual
     on this card was frozen: 2 L and 7.25 L rendered pixel-for-pixel
     alike. The number was the only thing that still varied, and it is
     inside a button whose aria-label used to replace it — so a
     screen-reader user could not reach it either. */
  it("says nothing about a target that has not been reached", () => {
    render(<WaterCard compact ml={1750} targetMl={2000} onLog={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /add water/i })
    ).not.toHaveAccessibleName(/target reached/i);
  });

  it("marks the target reached, and says how far over", () => {
    render(<WaterCard compact ml={7250} targetMl={2000} onLog={vi.fn()} />);
    const body = screen.getByRole("button", { name: /add water/i });
    /* The whole reading, in one sentence, on the control that owns it —
       "7.25 litres", not "7.25 L", because `L` beside a numeral is
       spoken as a letter (the MacroRing "grams" precedent). */
    expect(body).toHaveAccessibleName(
      /Water 7\.25 litres of 2 litres\. Target reached\. 5\.25 litres over\./
    );
  });

  it("reaching the target exactly is reached, with nothing over", () => {
    /* `met` is `>= target`, not MacroRing's 0.9-1.1 `done` band. A band
       would un-tick this card at 2.3 L while `hydration_hero` had
       already awarded the day on `ml >= target`. */
    render(<WaterCard compact ml={2000} targetMl={2000} onLog={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /add water/i })
    ).toHaveAccessibleName(/Target reached\.$|Target reached\. Add water/);
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
    expect(status.textContent).toMatch(
      /2 litres of 2 litres\. Target reached\./
    );
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
