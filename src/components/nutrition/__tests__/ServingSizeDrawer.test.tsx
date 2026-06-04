/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("framer-motion", () => ({
  get m() {
    return (this as { motion: unknown }).motion;
  },
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
