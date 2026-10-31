/**
 * ExercisePicker — the row has TWO tap targets (owner request 2026-09-02:
 * "you should be able to click on them to also see them, not just press
 * the plus"):
 *   - the body opens a detail sheet showing the exercise's Form content
 *     with an action that adds the exercise and any drafted selections;
 *   - the trailing circle (role=checkbox) toggles selection WITHOUT
 *     opening the sheet.
 * Existing exercises reflect the current plan; new selections stay drafted
 * until the batch bar or the detail action commits them.
 */
import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { toast } from "@/lib/toast";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/hooks/useWorkouts", () => ({
  useWorkouts: () => ({ workouts: [], loading: false }),
}));
vi.mock("@/components/ExerciseFormContent", () => ({
  default: ({ exerciseName }: { exerciseName: string }) => (
    <div data-testid="form-content">Form for {exerciseName}</div>
  ),
}));

import ExercisePicker from "../ExercisePicker";

function LocationPath() {
  const { pathname } = useLocation();
  return <span data-testid="location-path">{pathname}</span>;
}

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

  it("shows reviewed drawings, including the completed Front Squat", () => {
    mount();
    expect(
      screen.getByRole("textbox", { name: "Search exercises" })
    ).toHaveAttribute("placeholder", "Search exercises…");
    const reviewed = screen.getByRole("button", { name: "Dips details" });
    expect(reviewed.querySelector('[data-thumb="drawing"]')).not.toBeNull();
    const redrawn = screen.getByRole("button", {
      name: "Bench Press details",
    });
    expect(redrawn.querySelector('[data-thumb="drawing"]')).not.toBeNull();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search exercises" }),
      {
        target: { value: "Smith Machine Bench Press" },
      }
    );
    const smith = screen.getByRole("button", {
      name: "Smith Machine Bench Press details",
    });
    expect(smith.querySelector('[data-thumb="drawing"]')).not.toBeNull();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search exercises" }),
      {
        target: { value: "Front Squat" },
      }
    );
    const frontSquat = screen.getByRole("button", {
      name: "Front Squat details",
    });
    expect(frontSquat.querySelector('[data-thumb="drawing"]')).not.toBeNull();
  });

  it("the sheet's Add action commits the exercise immediately", async () => {
    const { onMultiSelect, onClose } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Dips details" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to workout" }));
    expect(onMultiSelect).toHaveBeenCalledTimes(1);
    expect(onMultiSelect.mock.calls[0][0]).toMatchObject([{ name: "Dips" }]);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("commits existing draft selections along with the open detail", async () => {
    const { onMultiSelect } = mount();
    fireEvent.click(screen.getByRole("checkbox", { name: "Push-Ups" }));
    fireEvent.click(screen.getByRole("button", { name: "Dips details" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add 2 exercises to workout" })
    );
    await waitFor(() => expect(onMultiSelect).toHaveBeenCalledTimes(1));
    expect(
      onMultiSelect.mock.calls[0][0].map(
        (exercise: { name: string }) => exercise.name
      )
    ).toEqual(expect.arrayContaining(["Dips", "Push-Ups"]));
  }, 10_000);

  it("waits for the save, prevents double submission, and keeps a failed draft", async () => {
    vi.mocked(toast.error).mockClear();
    let resolveSave: ((value: boolean) => void) | undefined;
    const onMultiSelect = vi.fn(
      () => new Promise<boolean>((resolve) => (resolveSave = resolve))
    );
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ExercisePicker
          open
          onSelect={vi.fn()}
          onMultiSelect={onMultiSelect}
          onClose={onClose}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Dips" }));
    const add = screen.getByRole("button", {
      name: "1 exercise selected — Add to workout",
    });
    fireEvent.click(add);
    expect(add).toHaveAttribute("aria-busy", "true");
    fireEvent.click(add);
    expect(onMultiSelect).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Close exercise picker" })
    );
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => resolveSave?.(false));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Dips" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(toast.error).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "1 exercise selected — Add to workout",
      })
    );
    await act(async () => resolveSave?.(true));
    expect(onMultiSelect).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the detail sheet open while its Add request is pending", async () => {
    let resolveSave: ((value: boolean) => void) | undefined;
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ExercisePicker
          open
          onSelect={vi.fn()}
          onMultiSelect={() =>
            new Promise<boolean>((resolve) => (resolveSave = resolve))
          }
          onClose={onClose}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Dips details" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to workout" }));
    const dialog = screen.getByRole("dialog", { name: "Dips" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Dips" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolveSave?.(true));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cannot discard drafted exercises during a pending add", async () => {
    let resolveSave: ((value: boolean) => void) | undefined;
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ExercisePicker
          open
          onSelect={vi.fn()}
          onMultiSelect={() =>
            new Promise<boolean>((resolve) => (resolveSave = resolve))
          }
          onClose={onClose}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Dips" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Push-Ups" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Close exercise picker" })
    );
    const discard = screen.getByRole("button", { name: "Discard" });
    fireEvent.click(
      screen.getByRole("button", {
        name: "2 exercises selected — Add to workout",
      })
    );
    fireEvent.click(discard);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolveSave?.(false));
    expect(screen.getByRole("checkbox", { name: "Dips" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("checkbox", { name: "Push-Ups" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("keeps the batch loading button visible during an optimistic plan update", async () => {
    let resolveSave: ((value: boolean) => void) | undefined;
    const picker = (existingExerciseIds: string[]) => (
      <MemoryRouter>
        <ExercisePicker
          open
          onSelect={vi.fn()}
          onMultiSelect={() =>
            new Promise<boolean>((resolve) => (resolveSave = resolve))
          }
          onClose={vi.fn()}
          existingExerciseIds={existingExerciseIds}
        />
      </MemoryRouter>
    );
    const { rerender } = render(picker([]));
    fireEvent.click(screen.getByRole("checkbox", { name: "Dips" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "1 exercise selected — Add to workout",
      })
    );
    rerender(picker(["dips"]));
    expect(
      screen.getByRole("button", {
        name: "1 exercise selected — Add to workout",
      })
    ).toHaveAttribute("aria-busy", "true");
    await act(async () => resolveSave?.(false));
    rerender(picker([]));
    expect(screen.getByRole("checkbox", { name: "Dips" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("keeps the picker open when an add request rejects", async () => {
    vi.mocked(toast.error).mockClear();
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ExercisePicker
          open
          onSelect={vi.fn()}
          onMultiSelect={vi.fn().mockRejectedValue(new Error("offline"))}
          onClose={onClose}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Dips" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "1 exercise selected — Add to workout",
      })
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not add exercises. Try again."
      )
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Dips" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("starts a new search across all categories, then lets pills narrow it", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Chest" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search exercises" }),
      {
        target: { value: " Barbell Squat " },
      }
    );
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(
      screen.getByRole("button", { name: "Barbell Squat details" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chest" }));
    expect(
      screen.queryByRole("button", { name: "Barbell Squat details" })
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Legs" }));
    expect(
      screen.getByRole("button", { name: "Barbell Squat details" })
    ).toBeInTheDocument();
  });

  it("reflects a different day's existing exercises on reopening", () => {
    const onClose = vi.fn();
    const onRemoveExercise = vi.fn();
    const picker = (open: boolean, existingExerciseIds: string[]) => (
      <MemoryRouter>
        <ExercisePicker
          open={open}
          onSelect={vi.fn()}
          onClose={onClose}
          onRemoveExercise={onRemoveExercise}
          existingExerciseIds={existingExerciseIds}
        />
      </MemoryRouter>
    );
    const { rerender } = render(picker(true, ["dips"]));
    expect(screen.getByRole("checkbox", { name: "Dips" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Bench Press" }));
    expect(
      screen.getByRole("checkbox", { name: "Bench Press" })
    ).toHaveAttribute("aria-checked", "true");
    rerender(picker(false, ["dips"]));
    rerender(picker(true, ["push-ups"]));
    expect(screen.getByRole("checkbox", { name: "Dips" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
    expect(screen.getByRole("checkbox", { name: "Push-Ups" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(
      screen.getByRole("checkbox", { name: "Bench Press" })
    ).toHaveAttribute("aria-checked", "false");
  });

  it("starts a reopened Add picker with a fresh search and category", () => {
    const picker = (open: boolean) => (
      <MemoryRouter>
        <ExercisePicker open={open} onSelect={vi.fn()} onClose={vi.fn()} />
      </MemoryRouter>
    );
    const { rerender } = render(picker(true));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search exercises" }),
      {
        target: { value: "Dips" },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Chest" }));
    expect(screen.getByRole("button", { name: "Chest" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    rerender(picker(false));
    rerender(picker(true));
    expect(
      screen.getByRole("textbox", { name: "Search exercises" })
    ).toHaveValue("");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("keeps an existing exercise selected when removal fails", async () => {
    const onRemoveExercise = vi.fn(async () => {
      throw new Error("offline");
    });
    render(
      <MemoryRouter>
        <ExercisePicker
          open
          onSelect={vi.fn()}
          onClose={vi.fn()}
          onRemoveExercise={onRemoveExercise}
          existingExerciseIds={["dips"]}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Dips" }));
    expect(onRemoveExercise).toHaveBeenCalledWith("dips");
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Dips" })).not.toBeDisabled()
    );
    expect(screen.getByRole("checkbox", { name: "Dips" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("confirms drafted selections before leaving for exercise progress", async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter initialEntries={["/program"]}>
        <LocationPath />
        <ExercisePicker open onSelect={vi.fn()} onClose={onClose} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Dips" }));
    fireEvent.click(screen.getByRole("button", { name: "Dips details" }));
    fireEvent.click(screen.getByRole("button", { name: "View full progress" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("location-path")).toHaveTextContent("/program");
    const prompt = await screen.findByText(
      "Discard 1 selection and view Dips progress?"
    );
    expect(prompt).toHaveFocus();

    fireEvent.click(
      await screen.findByRole("button", { name: "Keep browsing" })
    );
    expect(
      screen.getByRole("checkbox", { name: "Dips", hidden: true })
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("button", { name: "View full progress" })
    ).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "View full progress" }));
    fireEvent.keyDown(
      screen.getByText("Discard 1 selection and view Dips progress?"),
      { key: "Escape" }
    );
    expect(
      screen.getByRole("button", { name: "View full progress" })
    ).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "View full progress" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard and view" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location-path")).toHaveTextContent(
      "/history/exercise/Dips"
    );
  });

  it("labels the picker, traps Tab, and restores focus to its trigger", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <MemoryRouter>
          <button type="button" onClick={() => setOpen(true)}>
            Open picker
          </button>
          <ExercisePicker
            open={open}
            onSelect={vi.fn()}
            onClose={() => setOpen(false)}
            headerTitle="Add exercise"
          />
        </MemoryRouter>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open picker" });
    trigger.focus();
    fireEvent.click(trigger);
    const picker = screen.getByRole("dialog", { name: "Add exercise" });
    expect(picker).toHaveAttribute("aria-modal", "true");
    expect(
      screen.getByRole("textbox", { name: "Search exercises" })
    ).toHaveFocus();

    const focusables = picker.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled])"
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.click(
      screen.getByRole("button", { name: "Close exercise picker" })
    );
    expect(trigger).toHaveFocus();
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
    fireEvent.click(screen.getByRole("checkbox", { name: "Dips" }));
    fireEvent.click(screen.getByRole("button", { name: "Dips details" }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Dips" }), {
      key: "Escape",
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/1 exercise selected/)).toBeInTheDocument();
  });
});
