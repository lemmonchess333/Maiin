import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/lib/haptic", function () {
  return { haptic: vi.fn() };
});

import EditServingsSheet, {
  type EditServingsChanges,
} from "../EditServingsSheet";
import type { MealKey } from "../mealConstants";
import { CALORIE_UNIT } from "@/utils/formatNutrition";

afterEach(cleanup);

interface RenderSourceOverride {
  foodName: string;
  currentCount: number;
  currentTotalCalories: number;
  currentTotalProtein?: number;
  currentTotalCarbs?: number;
  currentTotalFat?: number;
  currentMeal?: MealKey | null;
}

function renderSheet(
  overrides: {
    source?: RenderSourceOverride | null;
    onCancel?: () => void;
    onSave?: (c: EditServingsChanges) => void | Promise<void>;
    onDelete?: () => void;
  } = {}
) {
  const baseSource: RenderSourceOverride =
    overrides.source === undefined
      ? {
          foodName: "Boiled egg",
          currentCount: 2,
          currentTotalCalories: 156,
          currentTotalProtein: 12,
          currentTotalCarbs: 2,
          currentTotalFat: 10,
          currentMeal: "breakfast",
        }
      : (overrides.source ?? {
          foodName: "",
          currentCount: 0,
          currentTotalCalories: 0,
          currentMeal: null,
        });
  const source =
    overrides.source === null
      ? null
      : {
          ...baseSource,
          currentTotalProtein: baseSource.currentTotalProtein ?? 0,
          currentTotalCarbs: baseSource.currentTotalCarbs ?? 0,
          currentTotalFat: baseSource.currentTotalFat ?? 0,
          currentMeal: baseSource.currentMeal ?? null,
        };
  return render(
    <EditServingsSheet
      source={source}
      onCancel={overrides.onCancel ?? vi.fn()}
      onSave={overrides.onSave ?? vi.fn()}
      onDelete={overrides.onDelete}
    />
  );
}

describe("EditServingsSheet", function () {
  it("renders nothing when source is null", function () {
    const { container } = renderSheet({ source: null });
    expect(container.firstChild).toBeNull();
  });

  it("initialises the stepper target to the current serving count", function () {
    renderSheet();
    expect(screen.getByLabelText(/2 servings/)).toBeInTheDocument();
  });

  it("increments the target when the + button is tapped", function () {
    renderSheet();
    fireEvent.click(screen.getByLabelText("Increase servings"));
    expect(screen.getByLabelText(/3 servings/)).toBeInTheDocument();
  });

  it("decrements the target when the − button is tapped, floored at 1", function () {
    renderSheet({
      source: { foodName: "Toast", currentCount: 2, currentTotalCalories: 160 },
    });
    const decrease = screen.getByLabelText("Decrease servings");
    fireEvent.click(decrease);
    expect(screen.getByLabelText(/1 serving/)).toBeInTheDocument();
    // At 1 the button is disabled — tapping again shouldn't change state
    expect(decrease).toBeDisabled();
  });

  it("disables Save when the target equals the current count (no-op)", function () {
    renderSheet();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
  });

  it("enables Save once the target differs from the current count", function () {
    renderSheet();
    fireEvent.click(screen.getByLabelText("Increase servings"));
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("calls onSave with the stepped target when Save is tapped", async function () {
    const onSave = vi.fn();
    renderSheet({ onSave });
    fireEvent.click(screen.getByLabelText("Increase servings"));
    fireEvent.click(screen.getByLabelText("Increase servings"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      targetCount: 4,
      targetMeal: null,
      targetName: null,
      targetMacros: null,
    });
  });

  it("calls onCancel when Cancel is tapped", function () {
    const onCancel = vi.fn();
    renderSheet({ onCancel });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows live calorie preview derived from current per-serving average", function () {
    // currentTotalCalories 156 / currentCount 2 = 78 cal per serving.
    // After incrementing to 3 → 234 cal preview.
    renderSheet();
    fireEvent.click(screen.getByLabelText("Increase servings"));
    expect(
      screen.getByText(new RegExp(`~ 234 ${CALORIE_UNIT}`))
    ).toBeInTheDocument();
    expect(screen.getByText(/\(\+1 serving\)/)).toBeInTheDocument();
  });

  it("previews the EDITED calories, not the stored ones", function () {
    /* The sheet contradicted itself: the preview divided the SAVED total
       by the saved count, while Save wrote the typed per-serving value.
       Correcting 78 to 100 previewed 156 for two servings and saved 200. */
    renderSheet();
    fireEvent.change(screen.getByLabelText("Per-serving calories"), {
      target: { value: "100" },
    });
    expect(
      screen.getByText(new RegExp(`~ 200 ${CALORIE_UNIT}`))
    ).toBeInTheDocument();
  });

  it("re-previews when the servings change on top of an edit", function () {
    // Both inputs feed one number; changing either must move it.
    renderSheet();
    fireEvent.change(screen.getByLabelText("Per-serving calories"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByLabelText("Increase servings"));
    expect(
      screen.getByText(new RegExp(`~ 300 ${CALORIE_UNIT}`))
    ).toBeInTheDocument();
  });

  it("keeps the stored average while the calorie field is blank", function () {
    /* Mid-edit the field is empty, which `parseMacro` already treats as
       "unchanged for this dimension". The preview must not read that as
       zero calories and flash 0 while the user retypes. */
    renderSheet();
    fireEvent.change(screen.getByLabelText("Per-serving calories"), {
      target: { value: "" },
    });
    expect(
      screen.getByText(new RegExp(`~ 156 ${CALORIE_UNIT}`))
    ).toBeInTheDocument();
  });

  it("does not shift an untouched preview by re-rounding", function () {
    /* 157 over 2 servings is 78.5 each. The preview is round(78.5 x 3) =
       236, NOT 3 x round(78.5) = 237 — so the unedited path keeps using
       the unrounded stored average rather than the rounded figure that
       seeds the input. */
    // `source` REPLACES the default fixture rather than merging into it,
    // so the count has to come along or it lands undefined.
    renderSheet({
      source: {
        foodName: "Boiled egg",
        currentCount: 2,
        currentTotalCalories: 157,
        currentTotalProtein: 12,
        currentTotalCarbs: 2,
        currentTotalFat: 10,
        currentMeal: "breakfast",
      },
    });
    fireEvent.click(screen.getByLabelText("Increase servings"));
    expect(
      screen.getByText(new RegExp(`~ 236 ${CALORIE_UNIT}`))
    ).toBeInTheDocument();
  });

  it("preserves the stepper across in-place source rerenders (parent remounts via key)", function () {
    // The parent (Food.tsx) is responsible for remounting the sheet
    // when the user opens a different group, by keying the component
    // on the group id. An in-place source change must NOT reset the
    // user's stepper input — doing so would re-fire on every parent
    // render (Firestore listeners run constantly) and stomp the
    // user's tap-count mid-edit.
    const { rerender } = renderSheet();
    fireEvent.click(screen.getByLabelText("Increase servings"));
    expect(screen.getByLabelText(/3 servings/)).toBeInTheDocument();
    rerender(
      <EditServingsSheet
        source={{
          foodName: "Apple",
          currentCount: 1,
          currentTotalCalories: 95,
          currentTotalProtein: 0,
          currentTotalCarbs: 25,
          currentTotalFat: 0,
          currentMeal: "snacks",
        }}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />
    );
    // Same component instance → stepper target persists.
    expect(screen.getByLabelText(/3 servings/)).toBeInTheDocument();
  });

  /* F5a — meal-slot picker. The Save signature now ships both the
     stepped count and the picked slot; tests below pin the four
     interaction shapes (slot only, count only, both, neither). */

  it("enables Save when the user picks a different meal slot from the current", function () {
    renderSheet({
      source: {
        foodName: "Yoghurt",
        currentCount: 1,
        currentTotalCalories: 120,
        currentMeal: "breakfast",
      },
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Snacks" }));
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("calls onSave with targetMeal when ONLY the slot changed (count unchanged)", async function () {
    const onSave = vi.fn();
    renderSheet({
      source: {
        foodName: "Yoghurt",
        currentCount: 1,
        currentTotalCalories: 120,
        currentMeal: "breakfast",
      },
      onSave,
    });
    fireEvent.click(screen.getByRole("radio", { name: "Snacks" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      targetCount: 1,
      targetMeal: "snacks",
      targetName: null,
      targetMacros: null,
    });
  });

  it("calls onSave with both targetCount and targetMeal when both changed", async function () {
    const onSave = vi.fn();
    renderSheet({
      source: {
        foodName: "Yoghurt",
        currentCount: 1,
        currentTotalCalories: 120,
        currentMeal: "breakfast",
      },
      onSave,
    });
    fireEvent.click(screen.getByLabelText("Increase servings"));
    fireEvent.click(screen.getByRole("radio", { name: "Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      targetCount: 2,
      targetMeal: "dinner",
      targetName: null,
      targetMacros: null,
    });
  });

  it("treats re-picking the original slot as no-change (targetMeal=null on Save)", async function () {
    const onSave = vi.fn();
    renderSheet({
      source: {
        foodName: "Yoghurt",
        currentCount: 1,
        currentTotalCalories: 120,
        currentMeal: "breakfast",
      },
      onSave,
    });
    // Bump count so Save isn't disabled, then explicitly re-pick the
    // original slot — that should NOT propagate as a slot change.
    fireEvent.click(screen.getByLabelText("Increase servings"));
    fireEvent.click(screen.getByRole("radio", { name: "Lunch" }));
    fireEvent.click(screen.getByRole("radio", { name: "Breakfast" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      targetCount: 2,
      targetMeal: null,
      targetName: null,
      targetMacros: null,
    });
  });

  /* F5a — rename. Input replaces the static heading. The "changed"
     check compares trimmed values; empty / whitespace-only input is
     treated as no-op and never propagated. */

  it("enables Save when the name input differs from the source name", function () {
    renderSheet();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    const input = screen.getByLabelText("Edit name");
    fireEvent.change(input, { target: { value: "Boiled eggs" } });
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("calls onSave with the trimmed targetName when ONLY the name changed", async function () {
    const onSave = vi.fn();
    renderSheet({ onSave });
    const input = screen.getByLabelText("Edit name");
    fireEvent.change(input, { target: { value: "  Boiled eggs  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      targetCount: 2,
      targetMeal: null,
      targetName: "Boiled eggs",
      targetMacros: null,
    });
  });

  it("treats whitespace-only rename as no-change (Save stays disabled)", function () {
    renderSheet();
    const input = screen.getByLabelText("Edit name");
    fireEvent.change(input, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("ignores trailing-whitespace-only diffs (trimmed compare matches source)", function () {
    renderSheet();
    const input = screen.getByLabelText("Edit name");
    fireEvent.change(input, { target: { value: "Boiled egg   " } });
    // Trimmed value matches the source's "Boiled egg" — no propagation
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("propagates all three changes when name, slot, and count all change", async function () {
    const onSave = vi.fn();
    renderSheet({
      source: {
        foodName: "Yoghurt",
        currentCount: 1,
        currentTotalCalories: 120,
        currentMeal: "breakfast",
      },
      onSave,
    });
    fireEvent.change(screen.getByLabelText("Edit name"), {
      target: { value: "Greek yoghurt" },
    });
    fireEvent.click(screen.getByLabelText("Increase servings"));
    fireEvent.click(screen.getByRole("radio", { name: "Snacks" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      targetCount: 2,
      targetMeal: "snacks",
      targetName: "Greek yoghurt",
      targetMacros: null,
    });
  });

  /* F5a — per-serving macro inputs. Initialised from group totals /
     count (rounded). Only changed dimensions land in targetMacros;
     blank / non-numeric / negative inputs are treated as "this
     dimension unchanged" so a half-typed edit doesn't write junk. */

  it("seeds the macro inputs with per-serving rounded values", function () {
    // Fixture: totals 156 cal / 12 P / 2 C / 10 F across 2 servings.
    // Per-serving (rounded): 78 / 6 / 1 / 5.
    renderSheet();
    expect(
      (screen.getByLabelText("Per-serving calories") as HTMLInputElement).value
    ).toBe("78");
    expect(
      (screen.getByLabelText("Per-serving protein") as HTMLInputElement).value
    ).toBe("6");
    expect(
      (screen.getByLabelText("Per-serving carbs") as HTMLInputElement).value
    ).toBe("1");
    expect(
      (screen.getByLabelText("Per-serving fat") as HTMLInputElement).value
    ).toBe("5");
  });

  it("enables Save when ANY macro input differs from the seeded per-serving value", function () {
    renderSheet();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Per-serving calories"), {
      target: { value: "90" },
    });
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("propagates ONLY the changed dimensions into targetMacros", async function () {
    const onSave = vi.fn();
    renderSheet({ onSave });
    // Touch only cal + protein; carbs/fat stay at their seeded values
    fireEvent.change(screen.getByLabelText("Per-serving calories"), {
      target: { value: "90" },
    });
    fireEvent.change(screen.getByLabelText("Per-serving protein"), {
      target: { value: "8" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      targetCount: 2,
      targetMeal: null,
      targetName: null,
      targetMacros: {
        totalCalories: 90,
        totalProtein: 8,
        // carbs + fat omitted — unchanged
      },
    });
  });

  it("treats blank / non-numeric / negative macro inputs as unchanged", function () {
    renderSheet();
    const cal = screen.getByLabelText("Per-serving calories");
    fireEvent.change(cal, { target: { value: "" } });
    // Blank → unchanged → Save stays disabled
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(cal, { target: { value: "-5" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(cal, { target: { value: "abc" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("re-typing the seeded value back is treated as no-change", function () {
    renderSheet();
    const cal = screen.getByLabelText("Per-serving calories");
    fireEvent.change(cal, { target: { value: "90" } });
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    // Type back to the seeded "78"
    fireEvent.change(cal, { target: { value: "78" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  /* Delete — the tap-to-edit counterpart to the row's swipe-to-delete.
     Optional onDelete: no prop → no Delete affordance; with prop → a
     Delete button that fires onDelete (parent owns the optimistic
     delete + Undo toast and closes the sheet). */

  it("renders no Delete button when onDelete is not provided", function () {
    renderSheet();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("renders a Delete button when onDelete is provided", function () {
    renderSheet({ onDelete: vi.fn() });
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("calls onDelete when the Delete button is tapped", function () {
    const onDelete = vi.fn();
    renderSheet({ onDelete });
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("keeps Delete available even when the sheet has no pending changes", function () {
    // Delete is independent of the Save no-op gating — an unchanged
    // sheet must still be deletable.
    const onDelete = vi.fn();
    renderSheet({ onDelete });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  /* An invalid macro entry is an edit the user MADE. It used to be parsed
     to the same `null` a blank field produces, which the override builder
     reads as "this dimension is unchanged" — so Save stayed enabled on
     whatever else had changed, wrote that, and dropped the number. */

  it("refuses Save while a macro field holds a negative number", function () {
    const onSave = vi.fn();
    renderSheet({ onSave });
    fireEvent.click(screen.getByLabelText("Increase servings"));
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText("Per-serving calories"), {
      target: { value: "-40" },
    });
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    // Disabled buttons swallow clicks in a real browser; the handler's own
    // guard is what holds if anything ever routes around the attribute.
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("marks the offending field and says what is wanted", function () {
    renderSheet();
    fireEvent.change(screen.getByLabelText("Per-serving carbs"), {
      target: { value: "-1" },
    });
    const carbs = screen.getByLabelText("Per-serving carbs");
    expect(carbs).toHaveAttribute("aria-invalid", "true");
    const message = screen.getByText("Enter 0 or more.");
    expect(carbs).toHaveAttribute("aria-describedby", message.id);
    // Only the field at fault — otherwise "which number?" is still the
    // user's problem to solve.
    expect(screen.getByLabelText("Per-serving calories")).not.toHaveAttribute(
      "aria-invalid"
    );
  });

  it("saves both changes once the field is corrected", function () {
    const onSave = vi.fn();
    renderSheet({ onSave });
    fireEvent.click(screen.getByLabelText("Increase servings"));
    fireEvent.change(screen.getByLabelText("Per-serving calories"), {
      target: { value: "-40" },
    });
    fireEvent.change(screen.getByLabelText("Per-serving calories"), {
      target: { value: "90" },
    });
    expect(screen.queryByText("Enter 0 or more.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      targetCount: 3,
      targetMeal: null,
      targetName: null,
      targetMacros: { totalCalories: 90 },
    });
  });

  it("still treats a cleared field as untouched, not as an error", function () {
    // The half that must not regress: clearing a box on the way to typing
    // a new number is ordinary, and blocking Save on it would fight the
    // user mid-edit.
    const onSave = vi.fn();
    renderSheet({ onSave });
    fireEvent.click(screen.getByLabelText("Increase servings"));
    fireEvent.change(screen.getByLabelText("Per-serving fat"), {
      target: { value: "" },
    });
    expect(screen.queryByText("Enter 0 or more.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Per-serving fat")).not.toHaveAttribute(
      "aria-invalid"
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      targetCount: 3,
      targetMeal: null,
      targetName: null,
      targetMacros: null,
    });
  });
  /* Calories lead. A food the local parser does not know is logged at
     0 kcal, and this sheet is where its calories get set, so the field
     has to be found and has to take a number cleanly. */

  it("opens a logged zero as an empty field, so typing 300 saves 300", function () {
    /* A field holding "0" puts the caret on one side of the digit or
       the other, so 300 typed into it becomes 3000 or 0300. */
    const onSave = vi.fn();
    renderSheet({
      onSave,
      source: {
        foodName: "Mystery stew",
        currentCount: 1,
        currentTotalCalories: 0,
        currentMeal: "lunch",
      },
    });
    const cal = screen.getByLabelText(
      "Per-serving calories"
    ) as HTMLInputElement;
    expect(cal.value).toBe("");
    expect(cal).toHaveAttribute("placeholder", "0");
    for (const macro of ["protein", "carbs", "fat"]) {
      expect(
        (screen.getByLabelText(`Per-serving ${macro}`) as HTMLInputElement)
          .value
      ).toBe("");
    }
    fireEvent.change(cal, { target: { value: "300" } });
    expect(screen.getByText(new RegExp(`~ 300 ${CALORIE_UNIT}`))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      targetCount: 1,
      targetMeal: null,
      targetName: null,
      targetMacros: { totalCalories: 300 },
    });
  });

  it("saves no macros for an untouched zero", function () {
    const onSave = vi.fn();
    renderSheet({
      onSave,
      source: {
        foodName: "Mystery stew",
        currentCount: 1,
        currentTotalCalories: 0,
        currentMeal: "lunch",
      },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      targetCount: 1,
      targetMeal: "dinner",
      targetName: null,
      targetMacros: null,
    });
  });

  it("puts calories first, on their own row, with the macros in grams after", function () {
    renderSheet();
    const cal = screen.getByLabelText("Per-serving calories");
    const protein = screen.getByLabelText("Per-serving protein");
    expect(
      cal.compareDocumentPosition(protein) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // Its own row: the macro grid holds the other three and not it.
    const grid = protein.closest(".grid") as HTMLElement;
    expect(grid).toHaveClass("grid-cols-3");
    expect(grid.contains(cal)).toBe(false);
    // The larger number of the four.
    expect(cal).toHaveClass("text-2xl");
    expect(protein).not.toHaveClass("text-2xl");
    // Its unit beside it; the macros carry grams.
    expect(cal.parentElement).toHaveTextContent(CALORIE_UNIT);
    expect(protein.parentElement).toHaveTextContent("g");
  });

  it("lays the four meal slots out on one row, like the composer's", function () {
    renderSheet();
    const slots = screen.getByRole("radiogroup", { name: "Meal slot" });
    expect(slots).toHaveClass("grid", "min-[360px]:grid-cols-4");
  });
  it("keeps Cancel and Save pinned under a scrolling form", function () {
    /* The sheet is capped at 85% of the screen. On an SE, or on any
       phone with the keyboard up, the form runs taller than that, and
       Save has to stay on screen. */
    renderSheet({ onDelete: vi.fn() });
    const body = screen
      .getByLabelText("Per-serving calories")
      .closest(".overflow-y-auto") as HTMLElement;
    expect(body).toBeTruthy();
    expect(body).toHaveClass("min-h-0", "flex-1");
    for (const name of ["Save", "Cancel"]) {
      expect(body.contains(screen.getByRole("button", { name }))).toBe(false);
    }
    // Delete stays with the form, away from Save.
    expect(body.contains(screen.getByRole("button", { name: /delete/i }))).toBe(
      true
    );
  });
});
