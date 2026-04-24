/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock framer-motion to render plain divs so we can test clicks
// against the rendered buttons without swipe-gesture interference.
vi.mock("framer-motion", function() {
  return {
    motion: new Proxy({}, {
      get: function(_target: any, prop: string) {
        return function(props: any) {
          const {
            initial: _i, animate: _a, exit: _e, transition: _t, variants: _v,
            whileTap: _w, drag: _d, dragDirectionLock: _ddl, dragConstraints: _dc,
            dragElastic: _de, onDrag: _od, onDragEnd: _ode, ...rest
          } = props;
          const Tag = prop === "create" ? "div" : prop;
          return <Tag {...rest} />;
        };
      },
    }),
    AnimatePresence: function({ children }: any) { return children; },
  };
});

// Force the reduced-motion path so the three action buttons render
// as inline icons next to the row (rather than the swipe-revealed
// overlay). Reduced-motion covers the same callback surface and is
// much easier to drive via fireEvent.click.
vi.mock("@/hooks/useReducedMotion", function() {
  return { useReducedMotion: function() { return true; } };
});

vi.mock("@/lib/haptic", function() {
  return { haptic: vi.fn() };
});

vi.mock("@/lib/theme", function() {
  return {
    THEME: {
      macros: { protein: "#A64", carbs: "#D94", fat: "#EB7" },
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

describe("FoodRow — inline actions (reduced-motion branch)", function() {
  it("renders foodName + calories", function() {
    render(
      <FoodRow
        group={baseGroup}
        isOpen={false}
        onOpenChange={noop}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Chicken salad")).toBeInTheDocument();
    expect(screen.getByText(/420/)).toBeInTheDocument();
  });

  it("invokes onDelete when the delete button is tapped", function() {
    const onDelete = vi.fn();
    render(
      <FoodRow
        group={baseGroup}
        isOpen={false}
        onOpenChange={noop}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByLabelText("Delete Chicken salad"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("hides Duplicate and Edit buttons when those callbacks are not provided (back-compat)", function() {
    render(
      <FoodRow
        group={baseGroup}
        isOpen={false}
        onOpenChange={noop}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Duplicate Chicken salad")).toBeNull();
    expect(screen.queryByLabelText("Edit Chicken salad")).toBeNull();
  });

  it("shows Duplicate button when onDuplicate is provided and invokes it on tap", function() {
    const onDuplicate = vi.fn();
    render(
      <FoodRow
        group={baseGroup}
        isOpen={false}
        onOpenChange={noop}
        onDelete={vi.fn()}
        onDuplicate={onDuplicate}
      />,
    );
    fireEvent.click(screen.getByLabelText("Duplicate Chicken salad"));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
  });

  it("shows Edit button when onEdit is provided and invokes it on tap", function() {
    const onEdit = vi.fn();
    render(
      <FoodRow
        group={baseGroup}
        isOpen={false}
        onOpenChange={noop}
        onDelete={vi.fn()}
        onEdit={onEdit}
      />,
    );
    fireEvent.click(screen.getByLabelText("Edit Chicken salad"));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("formats the quantity badge when count > 1 and portion sizes match", function() {
    const grouped: FoodRowGroup = {
      ...baseGroup,
      items: [{ portionSize: "1 bowl" }, { portionSize: "1 bowl" }, { portionSize: "1 bowl" }],
      count: 3,
      totalCal: 1260,
    };
    render(
      <FoodRow
        group={grouped}
        isOpen={false}
        onOpenChange={noop}
        onDelete={vi.fn()}
      />,
    );
    // "3 bowls" (pluralised, count > 1)
    expect(screen.getByText("3 bowls")).toBeInTheDocument();
  });

  it("falls back to ×N label when portion sizes differ across items", function() {
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
      />,
    );
    expect(screen.getByText("×2")).toBeInTheDocument();
  });
});
