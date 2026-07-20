/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// framer-motion → plain elements (strip animation props)
vi.mock("framer-motion", function () {
  return {
    motion: new Proxy(
      {},
      {
        get: function (_t: any, prop: string) {
          return function (props: any) {
            const {
              initial: _i,
              animate: _a,
              exit: _e,
              transition: _tr,
              variants: _v,
              whileTap: _w,
              layout: _l,
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

const { hapticMock } = vi.hoisted(function () {
  return { hapticMock: vi.fn() };
});
vi.mock("@/lib/haptic", function () {
  return { haptic: hapticMock };
});

// Keep the suite focused on the card contract, not ring internals
// (MacroRing has its own test file).
vi.mock("@/components/home/MacroRing", function () {
  return {
    default: (props: any) => (
      <div data-testid="macro-ring" data-mode={props.displayMode} />
    ),
  };
});

import TodayEnergy from "../TodayEnergy";

const burn: any = {
  phase: null,
  phaseLabel: "Maintain",
  phaseAdjustedTdee: 2200,
  workoutCalories: 0,
  runCalories: 0,
  stepCalories: 0,
};
const targets: any = {
  finalTarget: 2200,
  protein: 160,
  carbs: 220,
  fat: 70,
};

function renderAt(props: any = {}) {
  return render(
    <MemoryRouter>
      <TodayEnergy
        calories={0}
        protein={0}
        carbs={0}
        fat={0}
        burn={burn}
        targets={targets}
        {...props}
      />
    </MemoryRouter>
  );
}

describe("TodayEnergy — mid-size card (declutter 2a, rings-back revision)", function () {
  it("the header block links to /food; no second log affordance or expansion", function () {
    renderAt({ calories: 1450, totalLifetimeMeals: 420 });
    const link = screen.getByRole("link", {
      name: /today's energy — open food log/i,
    });
    expect(link).toHaveAttribute("href", "/food");
    expect(screen.queryByRole("link", { name: "Log food" })).toBeNull();
    expect(screen.queryByText("View food log →")).toBeNull();
  });

  it("the three macro rings are ALWAYS visible (no expand step)", function () {
    renderAt({
      calories: 1450,
      protein: 80,
      carbs: 56,
      fat: 38,
      totalLifetimeMeals: 420,
    });
    expect(screen.getAllByTestId("macro-ring")).toHaveLength(3);
    // The muted text summary the rings replaced is gone.
    expect(screen.queryByText(/g left$/)).toBeNull();
  });

  it("tap-to-flip toggles all three rings between consumed and left", function () {
    renderAt({ calories: 1450, totalLifetimeMeals: 420 });
    const flip = screen.getByRole("button", {
      name: /macros showing consumed/i,
    });
    for (const ring of screen.getAllByTestId("macro-ring")) {
      expect(ring).toHaveAttribute("data-mode", "consumed");
    }
    fireEvent.click(flip);
    for (const ring of screen.getAllByTestId("macro-ring")) {
      expect(ring).toHaveAttribute("data-mode", "left");
    }
    expect(
      screen.getByRole("button", { name: /macros showing remaining/i })
    ).toBeInTheDocument();
  });

  it("fires haptic feedback on the food tap-through", function () {
    hapticMock.mockClear();
    renderAt({ calories: 1450, totalLifetimeMeals: 420 });
    fireEvent.click(
      screen.getByRole("link", { name: /today's energy — open food log/i })
    );
    expect(hapticMock).toHaveBeenCalled();
  });

  it("cold-start (no meals ever) swaps the rings for the first-meal CTA", function () {
    renderAt({ calories: 0, totalLifetimeMeals: 0 });
    expect(screen.queryByTestId("macro-ring")).toBeNull();
    expect(
      screen.getByText("Log a meal to see your daily energy")
    ).toBeInTheDocument();
  });
});

describe("TodayEnergy — HOME-TARGET-01 truthful targets/copy", () => {
  it("phase chip shows the label WITHOUT a fabricated +300/−500 delta", () => {
    renderAt({
      calories: 1000,
      burn: { ...burn, phase: "cut" },
    });
    expect(screen.getByText("Cut")).toBeInTheDocument();
    expect(screen.queryByText(/−500/)).toBeNull();
    expect(screen.queryByText(/\+300/)).toBeNull();
  });

  it("bulk phase likewise shows only the label", () => {
    renderAt({
      calories: 1000,
      burn: { ...burn, phase: "lean bulk" },
    });
    expect(screen.getByText("Bulk")).toBeInTheDocument();
    expect(screen.queryByText(/\+300/)).toBeNull();
  });
});
