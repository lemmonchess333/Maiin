/**
 * SortableExerciseRow — accessible reorder handle + named delete action.
 *
 * The drag handle was an icon-only 28px button with no accessible name. It's
 * now a 44px (`size-11`) button named `Reorder <exercise>`, and the
 * swipe-delete action is named `Delete <exercise>` — both driven by the
 * required `label` prop.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import SortableExerciseRow from "../SortableExerciseRow";

// dnd-kit's useSortable needs a DndContext; mock it to a stable stub so the
// row renders in isolation and we can assert the handle wiring.
const attributes = { role: "button", tabIndex: 0, "data-dnd": "attr" };
const listeners = { onKeyDown: () => {}, "data-dnd": "listener" };
vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes,
    listeners,
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));
vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

afterEach(cleanup);

describe("SortableExerciseRow", () => {
  it("names the reorder handle after the exercise and gives it a 44px target", () => {
    render(
      <SortableExerciseRow id="1" label="Back Squat" showHandle>
        <span>row</span>
      </SortableExerciseRow>
    );
    const handle = screen.getByRole("button", { name: "Reorder Back Squat" });
    expect(handle.className).toContain("size-11");
    expect(handle.className).toContain("focus-visible:ring-2");
    // dnd-kit attributes/listeners stay attached to the handle.
    expect(handle.getAttribute("data-dnd")).toBe("listener");
  });

  it("renders no reorder button when the handle is hidden", () => {
    render(
      <SortableExerciseRow id="1" label="Back Squat" showHandle={false}>
        <span>row</span>
      </SortableExerciseRow>
    );
    expect(screen.queryByRole("button", { name: /Reorder/i })).toBeNull();
  });

  it("names the swipe-delete action after the exercise", () => {
    render(
      <SortableExerciseRow
        id="1"
        label="Back Squat"
        showHandle
        onDelete={() => {}}
      >
        <span>row</span>
      </SortableExerciseRow>
    );
    expect(
      screen.getByRole("button", { name: "Delete Back Squat" })
    ).toBeInTheDocument();
  });
});
