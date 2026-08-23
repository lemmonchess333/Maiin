/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock framer-motion to render plain divs, preserving key/children
vi.mock("framer-motion", function () {
  return {
    motion: new Proxy(
      {},
      {
        get: function (_target: any, prop: string) {
          if (prop === "create") {
            return function (Component: any) {
              return function (props: any) {
                const {
                  initial: _i,
                  animate: _a,
                  exit: _e,
                  transition: _t,
                  variants: _v,
                  whileTap: _w,
                  ...rest
                } = props;
                return <Component {...rest} />;
              };
            };
          }
          return function (props: any) {
            const {
              initial: _i,
              animate: _a,
              exit: _e,
              transition: _t,
              variants: _v,
              whileTap: _w,
              ...rest
            } = props;
            const Tag = prop;
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

vi.mock("@/lib/haptic", function () {
  return { haptic: vi.fn() };
});

vi.mock("@/hooks/useCountUp", function () {
  return {
    useCountUp: function (val: number) {
      return val;
    },
  };
});

import StackedCTACards from "../StackedCTACards";

function renderCards(
  overrides: Partial<Parameters<typeof StackedCTACards>[0]> = {}
) {
  const defaults = {
    nextWorkout: {
      dayName: "Push Day",
      dayType: "push",
      exercises: [{ name: "Bench Press" }, { name: "OHP" }],
    },
    todayType: "both" as const,
    navigate: vi.fn(),
    todayRun: null,
  };
  const props = { ...defaults, ...overrides };
  return render(
    <MemoryRouter>
      <StackedCTACards {...props} />
    </MemoryRouter>
  );
}

describe("StackedCTACards", function () {
  beforeEach(function () {
    localStorage.clear();
  });

  describe("card ordering", function () {
    it("LiftCTA appears before RunCTA on both days", function () {
      const { container } = renderCards();
      const allText = container.textContent || "";
      const liftIdx = allText.indexOf("Today · Lift day");
      const runIdx = allText.indexOf("Today · Run day");
      expect(liftIdx).toBeGreaterThan(-1);
      expect(runIdx).toBeGreaterThan(-1);
      expect(liftIdx).toBeLessThan(runIdx);
    });
  });

  describe("home-declutter 4a — the session stack only", function () {
    it("renders no water, weight or welcome-back content", function () {
      const { container } = renderCards();
      const allText = container.textContent || "";
      expect(allText.indexOf("Water")).toBe(-1);
      expect(allText.indexOf("Weight")).toBe(-1);
      expect(allText.indexOf("Welcome back")).toBe(-1);
    });
  });

  describe("conditional CTA cards", function () {
    it("shows LiftCTA when todayType is lift and nextWorkout exists", function () {
      renderCards({ todayType: "lift" });
      expect(screen.getByText("Push Day")).toBeInTheDocument();
    });

    it("hides LiftCTA when todayType is rest", function () {
      renderCards({ todayType: "rest" });
      expect(screen.queryByText("Push Day")).not.toBeInTheDocument();
    });

    it("hides LiftCTA when nextWorkout is null", function () {
      renderCards({ todayType: "lift", nextWorkout: null });
      expect(screen.queryByText("Push Day")).not.toBeInTheDocument();
    });

    it("shows RunCTA when todayType is run", function () {
      renderCards({ todayType: "run" });
      expect(screen.getByText(/Run day/)).toBeInTheDocument();
    });

    it("hides RunCTA when todayType is rest", function () {
      renderCards({ todayType: "rest" });
      expect(screen.queryByText("Today · Run day")).not.toBeInTheDocument();
    });

    it("shows both CTAs when todayType is both", function () {
      renderCards({ todayType: "both" });
      expect(screen.getByText("Push Day")).toBeInTheDocument();
      expect(screen.getByText(/Run day/)).toBeInTheDocument();
    });
  });

  describe("#972 cold-start framing", function () {
    it("frames the lift card as 'Your first workout' when firstWorkout is set", function () {
      renderCards({ todayType: "lift", firstWorkout: true });
      expect(screen.getByText("Your first workout")).toBeInTheDocument();
      expect(screen.queryByText("Today · Lift day")).not.toBeInTheDocument();
    });

    it("frames the run card as 'Your first run' when firstRun is set", function () {
      renderCards({ todayType: "run", firstRun: true });
      expect(screen.getByText("Your first run")).toBeInTheDocument();
    });

    it("default (no flags) keeps the standard 'Today · Lift day' eyebrow", function () {
      renderCards({ todayType: "lift" });
      expect(screen.getByText("Today · Lift day")).toBeInTheDocument();
      expect(screen.queryByText("Your first workout")).not.toBeInTheDocument();
    });

    it("shows the FirstMealCard instead of RestDayCard on a rest day when firstMeal is set", function () {
      renderCards({ todayType: "rest", firstMeal: true });
      expect(screen.getByText("Log your first meal")).toBeInTheDocument();
      expect(screen.queryByText("Take it easy")).not.toBeInTheDocument();
    });

    it("shows the normal RestDayCard on a rest day when firstMeal is not set", function () {
      renderCards({ todayType: "rest", firstMeal: false });
      expect(screen.getByText("Take it easy")).toBeInTheDocument();
      expect(screen.queryByText("Log your first meal")).not.toBeInTheDocument();
    });
  });
});

describe("HOME-ACTION-01 — deep-link + terminal states", function () {
  it("lift CTA taps through to the exact Programme day (?day=N)", function () {
    const navigate = vi.fn();
    renderCards({ todayType: "lift", liftDayIndex: 2, navigate });
    fireEvent.click(screen.getByText("Push Day"));
    expect(navigate).toHaveBeenCalledWith("/program?day=2");
  });

  it("a completed lift shows Done (not Start) and still opens the day", function () {
    const navigate = vi.fn();
    renderCards({
      todayType: "lift",
      liftDayIndex: 1,
      liftStartable: false,
      navigate,
    });
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.queryByText("Start")).toBeNull();
    fireEvent.click(screen.getByText("Push Day"));
    expect(navigate).toHaveBeenCalledWith("/program?day=1");
  });

  it("a terminal run shows Done and does NOT relaunch /run", function () {
    const navigate = vi.fn();
    renderCards({
      todayType: "run",
      navigate,
      todayRun: {
        id: "run-1",
        dayIndex: 3,
        templateId: "easy_30",
        type: "easy",
        status: "skipped",
      } as any,
    });
    expect(screen.getByText("Done")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Easy 30"));
    expect(navigate).toHaveBeenCalledWith("/program?tab=run");
    expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining("/run"));
  });

  it("a startable run launches /run with the template params", function () {
    const navigate = vi.fn();
    renderCards({
      todayType: "run",
      navigate,
      todayRun: {
        id: "run-2",
        dayIndex: 3,
        templateId: "easy_30",
        type: "easy",
        status: "planned",
      } as any,
    });
    expect(screen.getByText("Go")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Easy 30"));
    expect(navigate).toHaveBeenCalledWith(
      expect.stringContaining("/run?template=easy_30")
    );
  });
});
