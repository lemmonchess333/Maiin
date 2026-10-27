/**
 * ExercisePicker — the row has TWO tap targets (owner request 2026-09-02:
 * "you should be able to click on them to also see them, not just press
 * the plus"):
 *   - the body opens a detail sheet showing the exercise's Form content
 *     with an Add/Added action, WITHOUT changing the selection;
 *   - the trailing circle (role=checkbox) toggles selection WITHOUT
 *     opening the sheet.
 * The sheet's action toggles the same selection the batch bar reads.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/hooks/useWorkouts", () => ({
  useWorkouts: () => ({ workouts: [], loading: false }),
}));
vi.mock("@/components/ExerciseFormContent", () => ({
  default: ({ exerciseName }: { exerciseName: string }) => (
    <div data-testid="form-content">Form for {exerciseName}</div>
  ),
}));

import ExercisePicker from "../ExercisePicker";

function mount() {
  const onMultiSelect = vi.fn();
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <ExercisePicker
        open
        onSelect={vi.fn()}
        onMultiSelect={onMultiSelect}
        onClose={onClose}
        headerTitle="Add exercise"
      />
    </MemoryRouter>
  );
  return { onMultiSelect, onClose };
}

/** The z-index a Tailwind `z-[N]` or `z-N` class sets, if any. */
function zClass(el: Element | null): number {
  const m = el?.className.toString().match(/(?:^|\s)z-\[?(\d+)\]?(?:\s|$)/);
  return m ? Number(m[1]) : Number.NaN;
}

describe("ExercisePicker row: see it vs add it", () => {
  it("the trailing circle selects without opening the sheet", () => {
    mount();
    const box = screen.getByRole("checkbox", { name: "Dips" });
    expect(box).toHaveAttribute("aria-checked", "false");
    fireEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("form-content")).toBeNull();
    expect(screen.getByText(/1 exercise selected/)).toBeInTheDocument();
  });

  it("the row body opens the detail sheet without touching the selection", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Dips details" }));
    expect(await screen.findByTestId("form-content")).toHaveTextContent(
      "Form for Dips"
    );
    // The open sheet makes the page behind it inert (modal semantics), so
    // the row's checkbox is queried with `hidden` from here on.
    expect(
      screen.getByRole("checkbox", { name: "Dips", hidden: true })
    ).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText(/exercise selected/)).toBeNull();
  });

  it("shows reviewed drawings and a muscle tile when artwork is withheld", () => {
    mount();
    const reviewed = screen.getByRole("button", { name: "Dips details" });
    expect(reviewed.querySelector('[data-thumb="drawing"]')).not.toBeNull();
    const redrawn = screen.getByRole("button", {
      name: "Bench Press details",
    });
    expect(redrawn.querySelector('[data-thumb="drawing"]')).not.toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Search exercises" }), {
      target: { value: "Smith Machine Bench Press" },
    });
    const withheld = screen.getByRole("button", {
      name: "Smith Machine Bench Press details",
    });
    expect(withheld.querySelector('[data-thumb="muscles"]')).not.toBeNull();
  });

  it("the sheet's action toggles the same selection the batch bar reads", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Dips details" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to workout" }));
    expect(
      screen.getByRole("checkbox", { name: "Dips", hidden: true })
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("button", { name: "Selected — tap to unselect" })
    ).toBeInTheDocument();
    expect(screen.getByText(/1 exercise selected/)).toBeInTheDocument();
  });

  it("opens the sheet above the picker, not behind it", () => {
    /* On a phone the sheet opened at its default z-50 under the picker's
       9999: nothing showed, and the open sheet made everything else inert,
       so the screen froze. */
    mount();
    const picker = Array.from(document.body.querySelectorAll("div")).find(
      (el) => el.style.zIndex === "9999"
    );
    expect(picker).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Dips details" }));
    const sheet = screen.getByRole("dialog", { name: "Dips" });
    expect(zClass(sheet)).toBeGreaterThan(9999);
    expect(
      zClass(document.querySelector("[data-vaul-overlay]"))
    ).toBeGreaterThan(9999);
  });

  it("scrolls the form and keeps the action in reach under it", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Dips details" }));
    const form = await screen.findByTestId("form-content");
    expect(form.closest(".overflow-y-auto")).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Add to workout" })
        .closest(".overflow-y-auto")
    ).toBeNull();
  });

  it("Escape closes the sheet and leaves the picker and its ticks", () => {
    const { onClose } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Dips details" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to workout" }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Dips" }), {
      key: "Escape",
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/1 exercise selected/)).toBeInTheDocument();
  });
});
