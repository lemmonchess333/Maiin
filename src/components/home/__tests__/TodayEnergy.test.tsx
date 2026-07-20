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

describe("TodayEnergy — compact row (home-declutter 2a)", function () {
  it("the WHOLE card is one link to /food (the Food tab is the expansion)", function () {
    renderAt({ calories: 1450, totalLifetimeMeals: 420 });
    const link = screen.getByRole("link", {
      name: /today's energy — open food log/i,
    });
    expect(link).toHaveAttribute("href", "/food");
    // No second log affordance and no in-place expansion remain.
    expect(screen.queryByRole("link", { name: "Log food" })).toBeNull();
    expect(screen.queryByText("View food log →")).toBeNull();
  });

  it("fires haptic feedback on tap", function () {
    hapticMock.mockClear();
    renderAt({ calories: 1450, totalLifetimeMeals: 420 });
    fireEvent.click(
      screen.getByRole("link", { name: /today's energy — open food log/i })
    );
    expect(hapticMock).toHaveBeenCalled();
  });

  it("shows the muted grams-remaining subline (target − consumed, clamped)", function () {
    renderAt({
      calories: 1450,
      protein: 80,
      carbs: 56,
      fat: 38,
      totalLifetimeMeals: 420,
    });
    // P 160-80=80, C 220-56=164, F 70-38=32
    expect(screen.getByText("P 80g · C 164g · F 32g left")).toBeInTheDocument();
  });

  it("grams-remaining never goes negative (clamped at 0)", function () {
    renderAt({
      calories: 3000,
      protein: 200,
      carbs: 300,
      fat: 90,
      totalLifetimeMeals: 420,
    });
    expect(screen.getByText("P 0g · C 0g · F 0g left")).toBeInTheDocument();
  });

  it("cold-start (no meals ever) swaps the subline for the first-meal CTA", function () {
    renderAt({ calories: 0, totalLifetimeMeals: 0 });
    expect(screen.queryByText(/g left$/)).toBeNull();
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
