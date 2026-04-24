/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// framer-motion → plain divs
vi.mock("framer-motion", function() {
  return {
    motion: new Proxy({}, {
      get: function(_target: any, prop: string) {
        return function(props: any) {
          const { variants: _v, ...rest } = props;
          const Tag = prop === "create" ? "div" : prop;
          return <Tag {...rest} />;
        };
      },
    }),
  };
});

vi.mock("@/lib/haptic", function() {
  return { haptic: vi.fn() };
});

import FoodDateBar from "../FoodDateBar";

describe("FoodDateBar", function() {
  it("renders 'Today' when isToday is true", function() {
    render(
      <FoodDateBar
        selectedDate="2024-01-15"
        isToday
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onPick={vi.fn()}
      />,
    );
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("renders formatted date when not today", function() {
    render(
      <FoodDateBar
        selectedDate="2024-01-15"
        isToday={false}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onPick={vi.fn()}
      />,
    );
    // date-fns "EEE, MMMM d" → "Mon, January 15"
    expect(screen.getByText("Mon, January 15")).toBeInTheDocument();
  });

  it("fires onPrev when the prev button is tapped", function() {
    const onPrev = vi.fn();
    render(
      <FoodDateBar
        selectedDate="2024-01-15"
        isToday
        onPrev={onPrev}
        onNext={vi.fn()}
        onPick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Previous day"));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("fires onNext when the next button is tapped", function() {
    const onNext = vi.fn();
    render(
      <FoodDateBar
        selectedDate="2024-01-15"
        isToday
        onPrev={vi.fn()}
        onNext={onNext}
        onPick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Next day"));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("fires onPick with the new date when the hidden date input changes", function() {
    const onPick = vi.fn();
    render(
      <FoodDateBar
        selectedDate="2024-01-15"
        isToday
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onPick={onPick}
      />,
    );
    const input = screen.getByLabelText("Select date", { selector: "input" });
    fireEvent.change(input, { target: { value: "2024-01-20" } });
    expect(onPick).toHaveBeenCalledWith("2024-01-20");
  });
});
