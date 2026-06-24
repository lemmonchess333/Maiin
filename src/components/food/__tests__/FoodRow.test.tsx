/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock framer-motion to render plain divs so we can test clicks
// against the rendered buttons without swipe-gesture interference.
vi.mock("framer-motion", function () {
  return {
    motion: new Proxy(
      {},
      {
        get: function (_target: any, prop: string) {
          return function (props: any) {
            const {
              initial: _i,
              animate: _a,
              exit: _e,
              transition: _t,
              variants: _v,
              whileTap: _w,
              drag: _d,
              dragDirectionLock: _ddl,
              dragConstraints: _dc,
              dragElastic: _de,
              onDrag: _od,
              onDragEnd: _ode,
              onTap: _ot,
              ...rest
            } = props;
            const Tag = prop === "create" ? "div" : prop;
            return <Tag {...rest} />;
          };
        },
      }
    ),
    AnimatePresence: function ({ children }: any) {
      return children;
    },
  };
});

// Force the reduced-motion path so the three action buttons render
// as inline icons next to the row (rather than the swipe-revealed
// overlay). Reduced-motion covers the same callback surface and is
// much easier to drive via fireEvent.click.
const reducedMotionMock = vi.fn(function () {
  return true;
});
vi.mock("@/hooks/useReducedMotion", function () {
  return {
    useReducedMotion: function () {
      return reducedMotionMock();
    },
  };
});

vi.mock("@/lib/haptic", function () {
  return { haptic: vi.fn() };
});

vi.mock("@/lib/theme", function () {
  return {
    THEME: {
      macros: { protein: "#A64", carbs: "#D94", fat: "#EB7" },
      swipe: { destructive: "#FF3B30", neutral: "#48484A" },
    },
  };
});

import FoodRow, { type FoodRowGroup } from "../FoodRow";

const baseGroup: FoodRowGroup = {
  id: "breakfast-chicken-salad",
  foodName: "Chicken salad",
  items: [{ portionSize: "1 bowl" }],
  count: 1,
  totalCal: 420,
  totalPro: 35,
  totalCarb: 25,
  totalFat: 18,
};

function noop() {}

describe("FoodRow — inline actions (reduced-motion branch)", function () {
  it("renders foodName + calories", function () {
    render(
      <FoodRow
        group={baseGroup}
        isOpen={false}
        onOpenChange={noop}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText("Chicken salad")).toBeInTheDocument();
    expect(screen.getByText(/420/)).toBeInTheDocument();
  });

  it("invokes onDelete when the delete button is tapped", function () {
    const onDelete = vi.fn();
    render(
      <FoodRow
        group={baseGroup}
        isOpen={false}
        onOpenChange={noop}
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByLabelText("Delete Chicken salad"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("hides the Edit button when onEdit is not provided (back-compat)", function () {
    render(
      <FoodRow
        group={baseGroup}
        isOpen={false}
        onOpenChange={noop}
        onDelete={vi.fn()}
      />
    );
    expect(screen.queryByLabelText("Edit Chicken salad")).toBeNull();
  });

  it("shows Edit button when onEdit is provided and invokes it on tap", function () {
    const onEdit = vi.fn();
    render(
      <FoodRow
        group={baseGroup}
        isOpen={false}
        onOpenChange={noop}
        onDelete={vi.fn()}
        onEdit={onEdit}
      />
    );
    fireEvent.click(screen.getByLabelText("Edit Chicken salad"));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("formats the quantity badge when count > 1 and portion sizes match", function () {
    const grouped: FoodRowGroup = {
      ...baseGroup,
      items: [
        { portionSize: "1 bowl" },
        { portionSize: "1 bowl" },
        { portionSize: "1 bowl" },
      ],
      count: 3,
      totalCal: 1260,
    };
    render(
      <FoodRow
        group={grouped}
        isOpen={false}
        onOpenChange={noop}
        onDelete={vi.fn()}
      />
    );
    // "3 bowls" (pluralised, count > 1)
    expect(screen.getByText("3 bowls")).toBeInTheDocument();
  });

  it("falls back to ×N label when portion sizes differ across items", function () {
    const grouped: FoodRowGroup = {
      ...baseGroup,
      items: [{ portionSize: "1 bowl" }, { portionSize: "2 cups" }],
      count: 2,
    };
    render(
      <FoodRow
        group={grouped}
        isOpen={false}
        onOpenChange={noop}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("renders the Edited pill when wasEdited is true (Food6 ci7)", function () {
    render(
      <FoodRow
        group={{ ...baseGroup, wasEdited: true }}
        isOpen={false}
        onOpenChange={noop}
        onDelete={vi.fn()}
      />
    );
    /* Use aria-label so the pill stays findable even if the visible
       text changes (icon + label is the design; the label is the
       a11y contract). */
    expect(screen.getByLabelText("Edited")).toBeInTheDocument();
  });

  it("does NOT render the Edited pill when wasEdited is false / absent", function () {
    render(
      <FoodRow
        group={baseGroup}
        isOpen={false}
        onOpenChange={noop}
        onDelete={vi.fn()}
      />
    );
    expect(screen.queryByLabelText("Edited")).toBeNull();
  });
});

describe("FoodRow — swipe branch (motion path)", function () {
  it("marks the row data-swipe-card so the page-swipe nav hands off to it", function () {
    /* Regression: without data-swipe-card, useSwipeNavigation (the
       page-level swipe-between-tabs handler in Layout) also fired when
       the user swiped a food row to delete — navigating to the adjacent
       tab instead of opening the row ("it just switches pages"). The
       hook hard-blocks on [data-swipe-card] ancestors. */
    reducedMotionMock.mockReturnValueOnce(false);
    const { container } = render(
      <FoodRow
        group={baseGroup}
        isOpen={false}
        onOpenChange={noop}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    const row = container.querySelector("[data-food-row]");
    expect(row).not.toBeNull();
    expect(row).toHaveAttribute("data-swipe-card");
  });

  it("exposes a single Delete action with the row body as the edit target", function () {
    /* Option A redesign: swipe reveals ONE red Delete; editing happens
       by tapping the row body (which carries role=button + the Edit
       aria-label). No separate in-swipe Edit button anymore. */
    reducedMotionMock.mockReturnValueOnce(false);
    render(
      <FoodRow
        group={baseGroup}
        isOpen={false}
        onOpenChange={noop}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Delete Chicken salad")).toBeInTheDocument();
    const editTarget = screen.getByLabelText("Edit Chicken salad");
    expect(editTarget).toHaveAttribute("role", "button");
    expect(editTarget).toHaveAttribute("tabindex", "0");
  });

  it("invokes onEdit when the row body receives Enter", function () {
    reducedMotionMock.mockReturnValueOnce(false);
    const onEdit = vi.fn();
    render(
      <FoodRow
        group={baseGroup}
        isOpen={false}
        onOpenChange={noop}
        onDelete={vi.fn()}
        onEdit={onEdit}
      />
    );
    fireEvent.keyDown(screen.getByLabelText("Edit Chicken salad"), {
      key: "Enter",
    });
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
