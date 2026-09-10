/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: any, prop: string) => (props: any) => {
        const {
          initial: _i,
          animate: _a,
          exit: _e,
          transition: _tn,
          ...rest
        } = props;
        const Tag = prop === "create" ? "div" : prop;
        return <Tag {...rest} />;
      },
    }
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("vaul", () => ({
  Drawer: {
    Root: ({ children }: any) => <div>{children}</div>,
    Portal: ({ children }: any) => <div>{children}</div>,
    Overlay: () => null,
    Content: ({ children }: any) => <div>{children}</div>,
    Title: ({ children }: any) => <div>{children}</div>,
    Description: ({ children }: any) => <div>{children}</div>,
  },
}));

vi.mock("@/hooks/useMacroPalette", () => ({
  useMacroPalette: () => ({
    accent: {
      nutrition: "#000",
      protein: "#000",
      carbs: "#000",
      fat: "#000",
    },
    text: {
      nutrition: "#000",
      protein: "#000",
      carbs: "#000",
      fat: "#000",
    },
  }),
}));

import { ServingSizeDrawer } from "../ServingSizeDrawer";

const baseFood = {
  name: "Cornflakes",
  brand: "Acme",
  calories: 372,
  protein: 8,
  carbs: 82,
  fat: 1,
  servingSize: "100g",
};

describe("ServingSizeDrawer — F2 unitConfidence banner", () => {
  it("does NOT render the banner when unitConfidence is 'high' (real serving_size from OFF)", () => {
    render(
      <ServingSizeDrawer
        food={{ ...baseFood, servingSize: "30g", unitConfidence: "high" }}
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.queryByText(/Per-100g data only/i)).toBeNull();
  });

  it("does NOT render the banner when unitConfidence is absent (back-compat default)", () => {
    render(
      <ServingSizeDrawer
        food={baseFood}
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.queryByText(/Per-100g data only/i)).toBeNull();
  });

  it("renders the F2 banner when unitConfidence is 'low' (per-100g fallback)", () => {
    render(
      <ServingSizeDrawer
        food={{ ...baseFood, unitConfidence: "low" }}
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText(/Per-100g data only/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Confirm your actual serving size before saving/i)
    ).toBeInTheDocument();
  });

  it("does not render anything when food is null", () => {
    const { container } = render(
      <ServingSizeDrawer
        food={null}
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("ServingSizeDrawer — the quantity is typeable", () => {
  function open(food: object, onConfirm = vi.fn()) {
    render(
      <ServingSizeDrawer
        food={food as never}
        open
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );
    return onConfirm;
  }

  const per100 = { ...baseFood, unitConfidence: "low" as const };

  it("logs an arbitrary gram amount on a per-100g food", () => {
    /* The reported case. The stepper moved 0.5 servings at a time, which
       on a per-100g product is 50 g — so 100 and 150 were reachable and
       30 was not. `onConfirm` still takes SERVINGS, so 30 g is 0.3. */
    const onConfirm = open(per100);
    fireEvent.change(screen.getByLabelText("Grams"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log food" }));
    expect(onConfirm).toHaveBeenCalledWith(0.3);
  });

  it("handles a value between the old steps", () => {
    const onConfirm = open(per100);
    fireEvent.change(screen.getByLabelText("Grams"), {
      target: { value: "125" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log food" }));
    expect(onConfirm).toHaveBeenCalledWith(1.25);
  });

  it("names grams as the unit on a per-100g food, servings otherwise", () => {
    // The "clear unit beside it" half — a bare number reads as servings.
    open(per100);
    expect(screen.getByText("grams")).toBeInTheDocument();
    expect(screen.getByLabelText("Grams")).toHaveValue("100");
  });

  it("keeps servings as the unit for a food with a real serving size", () => {
    const onConfirm = open({ ...baseFood, unitConfidence: "high" as const });
    expect(screen.getByText("servings")).toBeInTheDocument();
    expect(screen.getByLabelText("Servings")).toHaveValue("1");
    fireEvent.change(screen.getByLabelText("Servings"), {
      target: { value: "2.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log food" }));
    expect(onConfirm).toHaveBeenCalledWith(2.5);
  });

  it("previews the macros for the typed amount", () => {
    // 372 cal per 100 g, so 30 g is 112.
    open(per100);
    fireEvent.change(screen.getByLabelText("Grams"), {
      target: { value: "30" },
    });
    expect(screen.getByText("112")).toBeInTheDocument();
  });

  it("steps by 10 g rather than 50", () => {
    open(per100);
    fireEvent.click(screen.getByRole("button", { name: "Increase grams" }));
    expect(screen.getByLabelText("Grams")).toHaveValue("110");
  });

  it("refuses to log a blank or zero amount", () => {
    /* The button is next to the field, so there is nothing to reveal —
       but it must not silently log 0 cal either. */
    const onConfirm = open(per100);
    fireEvent.change(screen.getByLabelText("Grams"), { target: { value: "" } });
    const log = screen.getByRole("button", { name: "Log food" });
    expect(log).toBeDisabled();
    fireEvent.click(log);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the food's own numbers while the field is empty", () => {
    // Not zeros: the row is a preview of the food, and flashing 0 mid-edit
    // reads as "this food has no calories".
    open(per100);
    fireEvent.change(screen.getByLabelText("Grams"), { target: { value: "" } });
    expect(screen.getByText("372")).toBeInTheDocument();
  });
});
