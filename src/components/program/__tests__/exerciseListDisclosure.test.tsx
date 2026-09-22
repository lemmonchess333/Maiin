import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import ExerciseListFooter, {
  EXERCISE_PANEL_ID,
  PREVIEW_NAMES,
} from "../ExerciseListDisclosure";

/**
 * The card's exercise footer, and the one thing that makes it safe.
 *
 * The footer is the only trigger for the exercise panel, and the panel
 * is the only route in the app to reordering, replacing or removing an
 * exercise — `DayActionSheet` is day-scoped and offers none of the
 * three. So everything behind this control is reachable ONLY here.
 *
 * The assertion that earns this file is `forceOpen`. "Reorder
 * exercises" sits in the PAGE HEADER's overflow sheet, so it can be
 * tapped while the list is collapsed, and a drag mode with nothing on
 * screen to drag is not a degraded state but a dead one. Deleting
 * `|| forceOpen` from the component leaves every other test here green.
 */

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

const NAMES = [
  "Bench press",
  "Incline dumbbell press",
  "Seated cable row",
  "Lat pulldown",
  "Lateral raise",
  "Cable tricep pushdown",
];

function Harness({
  forceOpen = false,
  initial = false,
  names = NAMES,
}: {
  forceOpen?: boolean;
  initial?: boolean;
  names?: string[];
}) {
  const [open, setOpen] = useState(initial);
  return (
    <ExerciseListFooter
      names={names}
      open={open}
      onOpenChange={setOpen}
      forceOpen={forceOpen}
    />
  );
}

const footer = () => screen.getByRole("button", { name: /^Exercises,/ });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the preview", () => {
  it("names the first three and counts the rest", () => {
    render(<Harness />);
    const el = footer();
    for (const name of NAMES.slice(0, PREVIEW_NAMES)) {
      expect(el).toHaveTextContent(name);
    }
    expect(el).toHaveTextContent("3 more");
    // The tail is a count of what is hidden, not a fourth name.
    expect(el).not.toHaveTextContent("Lat pulldown");
  });

  it("says nothing about a tail when everything fits", () => {
    render(<Harness names={NAMES.slice(0, PREVIEW_NAMES)} />);
    expect(footer()).not.toHaveTextContent("more");
  });

  it("counts the tail in the numeral face", () => {
    /* A displayed number takes font-mono + tabular-nums, app-wide. */
    render(<Harness />);
    const figure = screen.getByText("3");
    expect(figure.className).toContain("font-mono");
    expect(figure.className).toContain("tabular-nums");
  });

  it("leads with the first lift, so the day reads at a glance", () => {
    render(<Harness />);
    expect(screen.getByText("Bench press").className).toContain("font-medium");
  });

  it("holds two lines whether the names are long or short", () => {
    /* The day pager animates the whole card on swipe. A footer that
       grew and shrank between days would show as a jitter mid-flight,
       so the preview is clamped at two lines AND floored at two. */
    render(<Harness />);
    const preview = footer().querySelector("p");
    expect(preview?.className).toContain("line-clamp-2");
    expect(preview?.className).toContain("min-h-[2.125rem]");
  });

  it("says so rather than going blank on an empty day", () => {
    render(<Harness names={[]} />);
    expect(footer()).toHaveTextContent("No exercises yet");
  });
});

describe("the control", () => {
  it("announces its purpose and count, not the whole list", () => {
    /* The names are a preview. Handed to a screen reader as the
       button's NAME they would read as six-deep prose before the user
       learns what the control does. */
    render(<Harness />);
    expect(footer()).toHaveAttribute("aria-label", "Exercises, 6");
  });

  it("clears the 44px floor", () => {
    render(<Harness />);
    expect(footer().className).toContain("min-h-[44px]");
  });

  it("points at the panel it opens", () => {
    render(<Harness />);
    expect(footer()).toHaveAttribute("aria-controls", EXERCISE_PANEL_ID);
  });

  it("opens and closes", () => {
    render(<Harness />);
    expect(footer()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(footer());
    expect(footer()).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(footer());
    expect(footer()).toHaveAttribute("aria-expanded", "false");
  });
});

describe("forceOpen — the reorder rescue", () => {
  it("reads as open even though the user left it closed", () => {
    /* THE assertion. "Reorder exercises" is a page-header overflow
       action, reachable with the list collapsed; without this the mode
       starts with nothing to drag. */
    render(<Harness forceOpen initial={false} />);
    expect(footer()).toHaveAttribute("aria-expanded", "true");
  });

  it("drops the chevron while it holds the panel open", () => {
    /* Rather than a chevron that visibly does nothing. The mode's exit
       is the header's own Done. */
    const { container } = render(<Harness forceOpen />);
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText(/Bench press/)).toBeInTheDocument();
  });

  it("returns to the user's own state once the mode ends", () => {
    const { rerender } = render(<Harness forceOpen initial={false} />);
    expect(footer()).toHaveAttribute("aria-expanded", "true");
    rerender(<Harness forceOpen={false} initial={false} />);
    expect(footer()).toHaveAttribute("aria-expanded", "false");
  });
});
