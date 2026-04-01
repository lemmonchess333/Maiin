/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// WaterCard imports WaterWave which uses window.matchMedia at module level — mock it
vi.mock("@/components/home/WaterCard", function() {
  return { default: function(props: any) { return <div data-testid="water-card">{props.waterGlasses}/{props.waterTarget} glasses</div>; } };
});

// Mock framer-motion to render plain divs, preserving key/children
vi.mock("framer-motion", function() {
  return {
    motion: new Proxy({}, {
      get: function(_target: any, prop: string) {
        if (prop === "create") {
          return function(Component: any) {
            return function(props: any) {
              const { initial: _i, animate: _a, exit: _e, transition: _t, variants: _v, whileTap: _w, ...rest } = props;
              return <Component {...rest} />;
            };
          };
        }
        return function(props: any) {
          const { initial: _i, animate: _a, exit: _e, transition: _t, variants: _v, whileTap: _w, ...rest } = props;
          const Tag = prop;
          return <Tag {...rest} />;
        };
      },
    }),
    AnimatePresence: function({ children }: any) { return children; },
  };
});

vi.mock("@/lib/haptic", function() {
  return { haptic: vi.fn() };
});

vi.mock("@/hooks/useCountUp", function() {
  return { useCountUp: function(val: number) { return val; } };
});

import StackedCTACards from "../StackedCTACards";
import type { UserSegment } from "../StackedCTACards";

function renderCards(overrides: Partial<Parameters<typeof StackedCTACards>[0]> & { userSegment: UserSegment }) {
  const defaults = {
    nextWorkout: { dayName: "Push Day", dayType: "push", exercises: [{ name: "Bench Press" }, { name: "OHP" }] },
    todayType: "both" as const,
    navigate: vi.fn(),
    waterGlasses: 3,
    waterTarget: 8,
    onAddWater: vi.fn(),
    onRemoveWater: vi.fn(),
    lastWeight: "75.0",
    weightUnit: "kg",
    onLogWeight: vi.fn(),
    lastWeightDate: "Logged today",
    todayRun: null,
    healthScore: 72,
    prevHealthScore: 65,
  };
  const props = { ...defaults, ...overrides };
  return render(
    <MemoryRouter>
      <StackedCTACards {...props} />
    </MemoryRouter>
  );
}

describe("StackedCTACards", function() {
  beforeEach(function() {
    localStorage.clear();
  });

  describe("card ordering", function() {
    it("active user: HealthScoreCard appears before LiftCTA", function() {
      const { container } = renderCards({ userSegment: "active" });
      const allText = container.textContent || "";
      const healthIdx = allText.indexOf("Health Score");
      const liftIdx = allText.indexOf("Today \u00B7 Lift day");
      expect(healthIdx).toBeGreaterThan(-1);
      expect(liftIdx).toBeGreaterThan(-1);
      expect(healthIdx).toBeLessThan(liftIdx);
    });

    it("returning user: LiftCTA appears before HealthScoreCard", function() {
      const { container } = renderCards({ userSegment: "returning" });
      const allText = container.textContent || "";
      const healthIdx = allText.indexOf("Health Score");
      const liftIdx = allText.indexOf("Today \u00B7 Lift day");
      expect(healthIdx).toBeGreaterThan(-1);
      expect(liftIdx).toBeGreaterThan(-1);
      expect(liftIdx).toBeLessThan(healthIdx);
    });

    it("new user: LiftCTA appears before HealthScoreCard (action-forward)", function() {
      const { container } = renderCards({ userSegment: "new" });
      const allText = container.textContent || "";
      const healthIdx = allText.indexOf("Health Score");
      const liftIdx = allText.indexOf("Today \u00B7 Lift day");
      expect(liftIdx).toBeLessThan(healthIdx);
    });

    it("casual user: LiftCTA appears before HealthScoreCard (action-forward)", function() {
      const { container } = renderCards({ userSegment: "casual" });
      const allText = container.textContent || "";
      const healthIdx = allText.indexOf("Health Score");
      const liftIdx = allText.indexOf("Today \u00B7 Lift day");
      expect(liftIdx).toBeLessThan(healthIdx);
    });
  });

  describe("WelcomeBackCard visibility", function() {
    it("shows WelcomeBackCard for returning users", function() {
      renderCards({ userSegment: "returning" });
      expect(screen.getByText("Welcome back! Pick up where you left off.")).toBeInTheDocument();
    });

    it("does not show WelcomeBackCard for active users", function() {
      renderCards({ userSegment: "active" });
      expect(screen.queryByText("Welcome back! Pick up where you left off.")).not.toBeInTheDocument();
    });

    it("does not show WelcomeBackCard for new users", function() {
      renderCards({ userSegment: "new" });
      expect(screen.queryByText("Welcome back! Pick up where you left off.")).not.toBeInTheDocument();
    });

    it("does not show WelcomeBackCard for casual users", function() {
      renderCards({ userSegment: "casual" });
      expect(screen.queryByText("Welcome back! Pick up where you left off.")).not.toBeInTheDocument();
    });
  });

  describe("conditional CTA cards", function() {
    it("shows LiftCTA when todayType is lift and nextWorkout exists", function() {
      renderCards({ userSegment: "active", todayType: "lift" });
      expect(screen.getByText("Push Day")).toBeInTheDocument();
    });

    it("hides LiftCTA when todayType is rest", function() {
      renderCards({ userSegment: "active", todayType: "rest" });
      expect(screen.queryByText("Push Day")).not.toBeInTheDocument();
    });

    it("hides LiftCTA when nextWorkout is null", function() {
      renderCards({ userSegment: "active", todayType: "lift", nextWorkout: null });
      expect(screen.queryByText("Push Day")).not.toBeInTheDocument();
    });

    it("shows RunCTA when todayType is run", function() {
      renderCards({ userSegment: "active", todayType: "run" });
      expect(screen.getByText(/Run day/)).toBeInTheDocument();
    });

    it("hides RunCTA when todayType is rest", function() {
      renderCards({ userSegment: "active", todayType: "rest" });
      expect(screen.queryByText("Today \u00B7 Run day")).not.toBeInTheDocument();
    });

    it("shows both CTAs when todayType is both", function() {
      renderCards({ userSegment: "active", todayType: "both" });
      expect(screen.getByText("Push Day")).toBeInTheDocument();
      expect(screen.getByText(/Run day/)).toBeInTheDocument();
    });
  });

  describe("always-present cards", function() {
    it("always shows ActionPills", function() {
      renderCards({ userSegment: "active" });
      expect(screen.getByText("Log Food")).toBeInTheDocument();
    });

    it("always shows weight tile", function() {
      renderCards({ userSegment: "casual" });
      expect(screen.getByText("75.0")).toBeInTheDocument();
    });
  });
});
