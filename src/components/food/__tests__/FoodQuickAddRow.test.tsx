/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { QuickAddItem } from "@/lib/quickAddOrder";

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: any, prop: string) => (props: any) => {
        const {
          variants: _v,
          whileTap: _wt,
          initial: _i,
          animate: _a,
          exit: _e,
          transition: _tn,
          ...rest
        } = props;
        const Tag = prop === "create" ? "div" : prop;
        return <Tag {...rest} />;
      },
    },
  ),
}));

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import FoodQuickAddRow from "../FoodQuickAddRow";

function makeMeal(over: Partial<QuickAddItem> = {}): QuickAddItem {
  return {
    key: over.key ?? "oats",
    name: over.name ?? "Oats",
    cal: over.cal ?? 200,
    pro: over.pro ?? 8,
    carb: over.carb ?? 30,
    fat: over.fat ?? 4,
    portionSize: over.portionSize ?? "1 bowl",
    favouriteId: over.favouriteId,
  };
}

describe("FoodQuickAddRow — long-press → remove", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onRemoveFavourite after 500ms hold on a favourite-backed chip", () => {
    const onRemove = vi.fn();
    const onAdd = vi.fn();
    render(
      <FoodQuickAddRow
        meals={[makeMeal({ favouriteId: "oats" })]}
        adding={null}
        onAdd={onAdd}
        onRemoveFavourite={onRemove}
      />,
    );
    const chip = screen.getByRole("button", { name: /oats/i });
    fireEvent.pointerDown(chip, { clientX: 100, clientY: 100 });
    vi.advanceTimersByTime(500);
    expect(onRemove).toHaveBeenCalledWith("oats", "Oats");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("does NOT fire on a chip without a favouriteId (recents/defaults)", () => {
    const onRemove = vi.fn();
    render(
      <FoodQuickAddRow
        meals={[makeMeal({ favouriteId: undefined })]}
        adding={null}
        onAdd={vi.fn()}
        onRemoveFavourite={onRemove}
      />,
    );
    const chip = screen.getByRole("button", { name: /oats/i });
    fireEvent.pointerDown(chip, { clientX: 100, clientY: 100 });
    vi.advanceTimersByTime(600);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("cancels the long-press when the finger drifts > 10px (scroll intent)", () => {
    const onRemove = vi.fn();
    render(
      <FoodQuickAddRow
        meals={[makeMeal({ favouriteId: "oats" })]}
        adding={null}
        onAdd={vi.fn()}
        onRemoveFavourite={onRemove}
      />,
    );
    const chip = screen.getByRole("button", { name: /oats/i });
    fireEvent.pointerDown(chip, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(chip, { clientX: 130, clientY: 100 });
    vi.advanceTimersByTime(600);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("cancels the long-press on early release (pointerUp before 500ms)", () => {
    const onRemove = vi.fn();
    render(
      <FoodQuickAddRow
        meals={[makeMeal({ favouriteId: "oats" })]}
        adding={null}
        onAdd={vi.fn()}
        onRemoveFavourite={onRemove}
      />,
    );
    const chip = screen.getByRole("button", { name: /oats/i });
    fireEvent.pointerDown(chip, { clientX: 100, clientY: 100 });
    vi.advanceTimersByTime(300);
    fireEvent.pointerUp(chip);
    vi.advanceTimersByTime(300);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("suppresses the trailing click after a long-press (ghost-click guard)", () => {
    const onRemove = vi.fn();
    const onAdd = vi.fn();
    render(
      <FoodQuickAddRow
        meals={[makeMeal({ favouriteId: "oats" })]}
        adding={null}
        onAdd={onAdd}
        onRemoveFavourite={onRemove}
      />,
    );
    const chip = screen.getByRole("button", { name: /oats/i });
    fireEvent.pointerDown(chip, { clientX: 100, clientY: 100 });
    vi.advanceTimersByTime(500);
    // iOS synthesises a click after touchend even when long-press
    // fired. The trailing click must NOT also trigger onAdd.
    fireEvent.click(chip);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("calls onAdd on a normal tap (no long-press)", () => {
    const onAdd = vi.fn();
    render(
      <FoodQuickAddRow
        meals={[makeMeal({ favouriteId: "oats" })]}
        adding={null}
        onAdd={onAdd}
        onRemoveFavourite={vi.fn()}
      />,
    );
    const chip = screen.getByRole("button", { name: /oats/i });
    fireEvent.click(chip);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("preventDefault on contextmenu for favourite chips, no-op otherwise", () => {
    render(
      <FoodQuickAddRow
        meals={[
          makeMeal({ name: "Oats", favouriteId: "oats" }),
          makeMeal({ name: "Toast", favouriteId: undefined }),
        ]}
        adding={null}
        onAdd={vi.fn()}
        onRemoveFavourite={vi.fn()}
      />,
    );
    const oats = screen.getByRole("button", { name: /oats/i });
    const toast = screen.getByRole("button", { name: /toast/i });

    const oatsEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    oats.dispatchEvent(oatsEvent);
    expect(oatsEvent.defaultPrevented).toBe(true);

    const toastEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    toast.dispatchEvent(toastEvent);
    expect(toastEvent.defaultPrevented).toBe(false);
  });
});
