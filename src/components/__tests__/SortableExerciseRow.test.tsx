/**
 * SortableExerciseRow — accessible reorder handle + named delete action.
 *
 * The drag handle was an icon-only 28px button with no accessible name. It's
 * now a 44px (`size-11`) button named `Reorder <exercise>`, and the
 * swipe-delete action is named `Delete <exercise>` — both driven by the
 * required `label` prop.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

  function renderDeletable() {
    render(
      <SortableExerciseRow
        id="1"
        label="Back Squat"
        showHandle={false}
        onDelete={() => {}}
      >
        <span>row</span>
      </SortableExerciseRow>
    );
    return screen.getByText("row").closest("[style]") as HTMLElement;
  }

  function swipe(row: HTMLElement, toX: number) {
    fireEvent.touchStart(row, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(row, { touches: [{ clientX: toX, clientY: 100 }] });
    fireEvent.touchEnd(row, { touches: [] });
  }

  it("keeps the red Delete panel out of the page while the row is at rest", () => {
    /* At rest the row covered the panel exactly, but its rounded edge is
       antialiased and the red showed through as a hairline down the right
       of every row. The panel now exists only while the row is off home. */
    renderDeletable();
    expect(screen.getByText("row")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
  });

  it("names the swipe-delete action after the exercise once the row is swiped", () => {
    const row = renderDeletable();
    swipe(row, 110);
    expect(
      screen.getByRole("button", { name: "Delete Back Squat" })
    ).toBeInTheDocument();
    expect(row.style.transform).toBe("translateX(-80px)");
  });

  it("hides the panel again when the row slides home", () => {
    const row = renderDeletable();
    swipe(row, 170); // not far enough: the row springs back
    expect(row.style.transform).toBe("translateX(0px)");
    // Still there while the row slides back over it…
    expect(
      screen.getByRole("button", { name: "Delete Back Squat" })
    ).toBeInTheDocument();
    // …and gone once it is home.
    fireEvent.transitionEnd(row);
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
  });
});
