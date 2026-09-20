import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import WaterCard from "../WaterCard";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/homeAnalytics", () => ({ track: vi.fn() }));
/* Sonner is mocked so the suite can assert that NOTHING is toasted. The
   tile briefly carried a toast per tap; the hook had already decided
   against one ("a 5-second overlay covering the surface below is a real
   cost for the most repeated… action in the app") and four taps stacked
   four overlays. The undo moved onto the tile's own line. */
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
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

  it("a tap never toasts; the way back is the tile's own line", () => {
    /* The regression this whole change exists for. A toast per tap
       stacked one overlay per tap over the page — and the toast was
       covering the card underneath the tile, not the tile. */
    const onLog = vi.fn();
    render(
      <WaterCard
        compact
        ml={1000}
        targetMl={2000}
        servingMl={500}
        onLog={onLog}
        drinks={[{ id: "d1", ml: 500, at: 1 }]}
        onRemoveDrink={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Add 500 ml" }));
    expect(onLog).toHaveBeenCalledWith(500);
    expect(toastMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Undo 500 ml" })).toBeTruthy();
  });

  it("the line names the newest drink, and Undo takes back THAT drink", () => {
    /* The label and the action are both derived from `drinks[0]` at
       render time rather than from an amount captured when the tap
       happened, so they cannot come to name different things — the
       failure mode a "750 ml added" burst label would have had while
       undoing only one drink. */
    const onRemoveDrink = vi.fn();
    render(
      <WaterCard
        compact
        ml={1250}
        targetMl={2000}
        servingMl={250}
        onLog={vi.fn()}
        drinks={[
          { id: "newest", ml: 750, at: 3 },
          { id: "older", ml: 500, at: 2 },
        ]}
        onRemoveDrink={onRemoveDrink}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Add 250 ml" }));
    const undo = screen.getByRole("button", { name: "Undo 750 ml" });
    expect(screen.getByText("+750 ml")).toBeInTheDocument();
    fireEvent.click(undo);
    expect(onRemoveDrink).toHaveBeenCalledWith("newest");
  });

  it("the line goes back to naming the step, and the tile never changes height", () => {
    /* Only ever one of the two lines renders, both text-micro with the
       same mt-1, so the swap cannot resize the tile — the grid stretches
       the weight tile beside it, and a jump there on the most repeated
       action in the app is what the sync line was kept out of the
       layout to avoid. */
    vi.useFakeTimers();
    try {
      render(
        <WaterCard
          compact
          ml={1000}
          targetMl={2000}
          servingMl={250}
          onLog={vi.fn()}
          drinks={[{ id: "d1", ml: 250, at: 1 }]}
          onRemoveDrink={vi.fn()}
        />
      );
      expect(screen.getByText("Tap + for 250 ml")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Add 250 ml" }));
      expect(screen.queryByText("Tap + for 250 ml")).toBeNull();
      expect(screen.getByRole("button", { name: "Undo 250 ml" })).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.getByText("Tap + for 250 ml")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a refused log offers no way back — there is nothing to undo", () => {
    const onLog = vi.fn(() => false);
    render(
      <WaterCard
        compact
        ml={1000}
        targetMl={2000}
        onLog={onLog}
        drinks={[{ id: "d1", ml: 250, at: 1 }]}
        onRemoveDrink={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Add 250 ml" }));
    expect(onLog).toHaveBeenCalledTimes(1);
    expect(toastMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
  });

  it("the sheet lists today's drinks, each removing the drink it names", () => {
    /* Replaces a row that read "Remove 250 ml" and subtracted an
       abstract amount: with a 500 and a 250 logged, that row took back
       the remembered serving rather than the drink you meant. Each row
       here carries its own receipt id. */
    const onRemoveDrink = vi.fn();
    render(
      <WaterCard
        compact
        ml={750}
        targetMl={2000}
        servingMl={250}
        onLog={vi.fn()}
        drinks={[
          { id: "late", ml: 250, at: Date.parse("2026-06-09T11:40:00Z") },
          { id: "early", ml: 500, at: Date.parse("2026-06-09T07:55:00Z") },
        ]}
        onRemoveDrink={onRemoveDrink}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /add water/i }));
    const rows = screen.getAllByRole("button", { name: /^Remove \d+ ml/ });
    expect(rows).toHaveLength(2);
    fireEvent.click(rows[1]);
    expect(onRemoveDrink).toHaveBeenCalledWith("early");
    /* The sheet stays open: correcting two mis-taps is one trip. The
       rows are props here, so both still render — what is pinned is
       that removing did not close the sheet. */
    expect(
      screen.getAllByRole("button", { name: /^Remove \d+ ml/ })
    ).toHaveLength(2);
  });

  it("an empty day's sheet offers presets and no removals", () => {
    render(
      <WaterCard
        compact
        ml={0}
        targetMl={2000}
        onLog={vi.fn()}
        drinks={[]}
        onRemoveDrink={vi.fn()}
      />
    );
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
