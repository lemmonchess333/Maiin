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

// Keep the test focused on the always-on affordance, not ring internals.
vi.mock("@/components/home/MacroRing", function () {
  return { default: () => <div data-testid="macro-ring" /> };
});
vi.mock("@/components/home/BreakdownRow", function () {
  return { default: () => <div data-testid="breakdown-row" /> };
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

describe("TodayEnergy — always-on Log affordance (#973)", function () {
  it("renders a Log affordance routing to /food", function () {
    renderAt();
    const link = screen.getByRole("link", { name: "Log food" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/food");
  });

  it("is present for the empty/new segment (no meals ever logged)", function () {
    renderAt({ calories: 0, totalLifetimeMeals: 0 });
    expect(screen.getByRole("link", { name: "Log food" })).toBeInTheDocument();
  });

  it("is present for an active segment (meals logged today)", function () {
    renderAt({
      calories: 1450,
      protein: 90,
      carbs: 150,
      fat: 45,
      totalLifetimeMeals: 420,
    });
    expect(screen.getByRole("link", { name: "Log food" })).toBeInTheDocument();
  });

  it("fires haptic feedback on tap", function () {
    hapticMock.mockClear();
    renderAt({ calories: 1450, totalLifetimeMeals: 420 });
    fireEvent.click(screen.getByRole("link", { name: "Log food" }));
    expect(hapticMock).toHaveBeenCalled();
  });
});

describe("TodayEnergy — collapsed macro summary vs expanded rings (Wave3 E1)", function () {
  it("collapsed default shows the muted grams-remaining line, NOT the rings", function () {
    renderAt({
      calories: 1450,
      protein: 80,
      carbs: 56,
      fat: 38,
      totalLifetimeMeals: 420,
    });
    // target − consumed, clamped: P 160-80=80, C 220-56=164, F 70-38=32
    expect(screen.getByText("P 80g · C 164g · F 32g left")).toBeInTheDocument();
    expect(screen.queryByTestId("macro-ring")).toBeNull();
  });

  it("expanding the card reveals the three macro rings", function () {
    renderAt({
      calories: 1450,
      protein: 80,
      carbs: 56,
      fat: 38,
      totalLifetimeMeals: 420,
    });
    fireEvent.click(screen.getByText("Today's Energy"));
    expect(screen.getAllByTestId("macro-ring")).toHaveLength(3);
    // summary line hides once expanded (rings carry the detail)
    expect(screen.queryByText(/P 80g · C 164g · F 32g left/)).toBeNull();
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

  it("cold-start (no meals ever) shows neither the summary line nor the rings", function () {
    renderAt({ calories: 0, totalLifetimeMeals: 0 });
    expect(screen.queryByText(/left$/)).toBeNull();
    expect(screen.queryByTestId("macro-ring")).toBeNull();
    expect(
      screen.getByText("Log a meal to see your daily energy")
    ).toBeInTheDocument();
  });
});
