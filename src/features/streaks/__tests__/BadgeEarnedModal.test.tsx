/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EarnedBadge } from "../badges";

// framer-motion → plain elements (strip animation props)
vi.mock("framer-motion", function () {
  return {
    get m() {
      return (this as { motion: unknown }).motion;
    },
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

// canvas-confetti is lazy-imported in the modal; stub so the celebration
// path doesn't try to render to a real canvas in jsdom.
vi.mock("canvas-confetti", function () {
  return { default: vi.fn() };
});

import { BadgeEarnedModal } from "../BadgeEarnedModal";

const FORWARD_HOOK = "Come back tomorrow to build your streak.";

function makeBadge(overrides: Partial<EarnedBadge> = {}): EarnedBadge {
  return {
    id: "first_step",
    name: "First Step",
    description: "Log your first meal or workout",
    icon: "footprints",
    lucideIcon: "Footprints",
    tier: "bronze",
    category: "consistency",
    threshold: 1,
    earnedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("BadgeEarnedModal — forward streak hook (#974)", function () {
  it("renders the forward streak-continuation hook on the First Step badge", function () {
    render(<BadgeEarnedModal badge={makeBadge()} onDismiss={() => {}} />);
    expect(screen.getByText(FORWARD_HOOK)).toBeInTheDocument();
  });

  it("does NOT render the hook on other (streak-threshold) badges", function () {
    render(
      <BadgeEarnedModal
        badge={makeBadge({
          id: "week_warrior",
          name: "Week Warrior",
          description: "7-day streak",
          tier: "silver",
          threshold: 7,
        })}
        onDismiss={() => {}}
      />
    );
    expect(screen.queryByText(FORWARD_HOOK)).not.toBeInTheDocument();
  });

  it("reuses the single modal (no second dialog surface mounts)", function () {
    render(<BadgeEarnedModal badge={makeBadge()} onDismiss={() => {}} />);
    // One dialog only — the hook lives inside the existing modal, not a
    // second celebration surface.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});
