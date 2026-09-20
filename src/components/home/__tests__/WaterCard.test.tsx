import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WaterCard from "../WaterCard";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/homeAnalytics", () => ({ track: vi.fn() }));
/* The compact tile's Undo rides the toast. Capture the call so the test
   can press Undo itself: sonner's Toaster is app chrome, not this
   component's, and is not mounted here. */
vi.mock("sonner", () => ({ toast: vi.fn() }));
import { toast } from "sonner";
const toastMock = vi.mocked(toast);

describe.each([false, true])("WaterCard compact=%s", (compact) => {
  beforeEach(() => toastMock.mockReset());

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

/* The full-width card keeps its − / + pair beside the reading. */
describe("WaterCard hero — the quick pair", () => {
  beforeEach(() => toastMock.mockReset());

  it("keeps the remembered serving on both quick controls, with no toast", () => {
    const onLog = vi.fn();
    render(
      <WaterCard ml={1750} targetMl={2000} servingMl={500} onLog={onLog} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Add 500 ml" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove 500 ml" }));
    expect(onLog.mock.calls).toEqual([[500], [-500]]);
    // Undo is the compact tile's substitute for a minus this card has.
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("cannot remove water from an empty day", () => {
    const onLog = vi.fn();
    render(<WaterCard ml={0} targetMl={2000} onLog={onLog} />);
    const remove = screen.getByRole("button", { name: "Remove 250 ml" });
    expect(remove).toBeDisabled();
    fireEvent.click(remove);
    expect(onLog).not.toHaveBeenCalled();
  });

  it("both quick controls keep one treatment — an edge, not a fill", () => {
    /* Measured treatment: every fill candidate 1.00-1.49:1 on the
       grounds these sit on, a solid teal edge 4.04-6.08:1. This card is
       the only surface that still carries the pair. */
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

/* Compact-only. The tile has ONE control, and it is not on row 3. Outside
   describe.each because the full-width variant composes its controls
   differently. */
describe("WaterCard compact tile — one plus, and the ways back", () => {
  beforeEach(() => toastMock.mockReset());

  it("names the serving its plus will add, in the meta line and the name", () => {
    /* `servingMl` is computed once and rendered twice — the disc's
       accessible name and the visible meta line. That is the "one value,
       two readers" shape this project keeps regressing on, so pin that
       they AGREE rather than that either exists. */
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
    expect(screen.getByText("Tap + for 750 ml")).toBeInTheDocument();
  });

  it("keeps one match for each selector the capture specs anchor on", () => {
    /* Five capture specs plus a transition spec select the card body by
       /add water/i (home:92 + :339, nutrition-card:75,
       designer-onboarding:168, transition.capture:172), and
       water-sizes:63 uses /^Add \d+ ml$/. The body's accessible name
       also carries the READING, so this pins that the substring those
       specs match on survived — and that the disc did not add a second
       match for either. */
    render(<WaterCard compact ml={0} targetMl={2000} onLog={vi.fn()} />);
    expect(
      screen.getAllByRole("button", { name: /^Add \d+ ml$/ })
    ).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /add water/i })).toHaveLength(
      1
    );
  });

  it("the plus is a filled disc in the label row, outside the body button, with a 44px hit area", () => {
    /* Row 3 held two controls through four passes and read wrong from a
       device every time; two 44px targets cannot share a 151px row with
       anything. Owner call: one plus, no minus. This pins the SHAPE of
       that decision. The disc sits OUTSIDE the body button — a button
       inside a button is invalid HTML and the earlier layouts avoided it
       by keeping the controls on their own row — and its 32px visual
       keeps the 44px floor through the pseudo-element that reaches into
       the tile padding. */
    render(<WaterCard compact ml={500} targetMl={2000} onLog={vi.fn()} />);
    const add = screen.getByRole("button", { name: /^Add \d+ ml$/ });
    const body = screen.getByRole("button", { name: /add water/i });
    expect(body.contains(add), "plus must not nest inside the body").toBe(
      false
    );
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
    for (const cls of [
      "absolute",
      "top-3",
      "right-3",
      "size-8",
      "rounded-full",
      "bg-teal",
      "text-teal-foreground",
      "before:-inset-1.5",
    ]) {
      expect(add, `plus is missing ${cls}`).toHaveClass(cls);
    }
  });

  it("a tap's toast offers Undo for exactly that serving", () => {
    const onLog = vi.fn();
    render(
      <WaterCard
        compact
        ml={1000}
        targetMl={2000}
        servingMl={500}
        onLog={onLog}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Add 500 ml" }));
    expect(toastMock).toHaveBeenCalledTimes(1);
    const [message, options] = toastMock.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe("500 ml added");
    expect(options.action.label).toBe("Undo");
    options.action.onClick();
    expect(onLog.mock.calls).toEqual([[500], [-500]]);
  });

  it("a refused log offers no Undo — there is nothing to undo", () => {
    const onLog = vi.fn(() => false);
    render(<WaterCard compact ml={1000} targetMl={2000} onLog={onLog} />);
    fireEvent.click(screen.getByRole("button", { name: "Add 250 ml" }));
    expect(onLog).toHaveBeenCalledTimes(1);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("the sheet offers Remove while there is water, and not on an empty day", () => {
    /* The minus left the tile, not the product. Anchored on the positive
       first: with water logged, the sheet's Remove row exists and
       removes the remembered serving. Then the empty day, where the row
       must be absent rather than a no-op. */
    const onLog = vi.fn();
    const { unmount } = render(
      <WaterCard
        compact
        ml={500}
        targetMl={2000}
        servingMl={250}
        onLog={onLog}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /add water/i }));
    fireEvent.click(screen.getByRole("button", { name: "Remove 250 ml" }));
    expect(onLog.mock.calls).toEqual([[-250]]);
    unmount();

    render(<WaterCard compact ml={0} targetMl={2000} onLog={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /add water/i }));
    expect(
      screen.getByRole("button", { name: /^Add 250 ml glass$/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
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
