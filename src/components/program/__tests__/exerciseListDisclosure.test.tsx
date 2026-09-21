import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import ExerciseListDisclosure from "../ExerciseListDisclosure";

/**
 * The fold, and the one thing that makes it safe.
 *
 * Folding the exercise list is the largest lever on the Train tab's
 * height, and it is also the only surface in the app from which an
 * exercise can be reordered, replaced or removed — `DayActionSheet` is
 * day-scoped and offers none of the three. So the panel is not decoration:
 * everything hidden behind that row is reachable ONLY through it.
 *
 * The assertion that earns this file is `forceOpen`. "Reorder exercises"
 * sits in the PAGE HEADER's overflow sheet, so it can be tapped while the
 * list is collapsed — and a drag mode with nothing on screen to drag is
 * not a degraded state, it is a dead one. Deleting `|| forceOpen` from the
 * component leaves every other test here green.
 */

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

const PANEL = "Bench press";

function Harness({
  forceOpen = false,
  initial = false,
  count = 5,
}: {
  forceOpen?: boolean;
  initial?: boolean;
  count?: number;
}) {
  const [open, setOpen] = useState(initial);
  return (
    <ExerciseListDisclosure
      count={count}
      open={open}
      onOpenChange={setOpen}
      forceOpen={forceOpen}
    >
      <button type="button">{PANEL}</button>
    </ExerciseListDisclosure>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("collapsed, which is the default the page was measured against", () => {
  it("renders none of the panel", () => {
    render(<Harness />);
    expect(screen.queryByText(PANEL)).toBeNull();
  });

  it("names what is inside, and how much of it", () => {
    render(<Harness count={5} />);
    const row = screen.getByRole("button", { name: /Exercises/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(row).toHaveTextContent("5");
  });

  it("keeps the count in the numeral face", () => {
    /* A displayed number takes font-mono + tabular-nums, app-wide. */
    render(<Harness count={12} />);
    const figure = screen.getByText("12");
    expect(figure.className).toContain("font-mono");
    expect(figure.className).toContain("tabular-nums");
  });

  it("clears the 44px floor on the only control it offers", () => {
    render(<Harness />);
    expect(
      screen.getByRole("button", { name: /Exercises/ }).className
    ).toContain("min-h-[44px]");
  });
});

describe("the tap", () => {
  it("opens the panel", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Exercises/ }));
    expect(screen.getByText(PANEL)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exercises/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("closes it again", () => {
    render(<Harness initial />);
    expect(screen.getByText(PANEL)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Exercises/ }));
    expect(screen.queryByText(PANEL)).toBeNull();
  });

  it("points the row at the panel it controls", () => {
    render(<Harness initial />);
    const row = screen.getByRole("button", { name: /Exercises/ });
    const id = row.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).toContainElement(
      screen.getByText(PANEL)
    );
  });
});

describe("forceOpen — the reorder rescue", () => {
  it("shows the panel even though the user left it closed", () => {
    /* THE assertion. "Reorder exercises" is a page-header overflow
       action, reachable with the list collapsed; without this the mode
       starts with nothing to drag. */
    render(<Harness forceOpen initial={false} />);
    expect(screen.getByText(PANEL)).toBeInTheDocument();
  });

  it("offers no collapse control while it holds the panel open", () => {
    /* Rather than a chevron that visibly does nothing. The mode's exit is
       the header's own Done. */
    render(<Harness forceOpen />);
    expect(screen.queryByRole("button", { name: /Exercises/ })).toBeNull();
    expect(screen.getByText("Exercises")).toBeInTheDocument();
  });

  it("collapses again once the mode ends, if that is where it was", () => {
    const { rerender } = render(<Harness forceOpen initial={false} />);
    expect(screen.getByText(PANEL)).toBeInTheDocument();
    rerender(<Harness forceOpen={false} initial={false} />);
    expect(screen.queryByText(PANEL)).toBeNull();
  });
});
