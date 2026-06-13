/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { EarnedBadge } from "../badges";

// Deterministic full-motion path + no real haptics/audio under jsdom.
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

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

/** The copy (incl. the forward hook) is gated behind the seal-break moment —
 *  tap the seal the required number of times so the post-reveal surface mounts.
 *  Full-motion path (reduced-motion mocked false) → 3 taps to break it open. */
function reveal() {
  for (let i = 0; i < 3; i++) {
    fireEvent.click(screen.getByRole("button", { name: /break the seal/i }));
  }
}

describe("BadgeEarnedModal — tap-to-reveal + forward streak hook (#974)", function () {
  it("gates the copy behind the reveal: hidden pre-tap, shown after", function () {
    render(<BadgeEarnedModal badge={makeBadge()} onDismiss={() => {}} />);
    // Pre-reveal: the moment leads — name/hook not yet shown.
    expect(screen.queryByText("First Step")).not.toBeInTheDocument();
    expect(screen.queryByText(FORWARD_HOOK)).not.toBeInTheDocument();
    reveal();
    expect(screen.getByText("First Step")).toBeInTheDocument();
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
    reveal();
    expect(screen.getByText("Week Warrior")).toBeInTheDocument();
    expect(screen.queryByText(FORWARD_HOOK)).not.toBeInTheDocument();
  });

  it("reuses the single modal (no second dialog surface mounts)", function () {
    render(<BadgeEarnedModal badge={makeBadge()} onDismiss={() => {}} />);
    // One dialog only — the moment + hook live inside the existing modal.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("requires MULTIPLE seal taps — one or two taps do not reveal", function () {
    render(<BadgeEarnedModal badge={makeBadge()} onDismiss={() => {}} />);
    const tap = () =>
      fireEvent.click(screen.getByRole("button", { name: /break the seal/i }));
    expect(screen.getByText(/tap to break the seal/i)).toBeInTheDocument();
    tap(); // 1
    expect(screen.queryByText("First Step")).not.toBeInTheDocument();
    tap(); // 2 — still sealed
    expect(screen.queryByText("First Step")).not.toBeInTheDocument();
    tap(); // 3 — breaks open
    expect(screen.getByText("First Step")).toBeInTheDocument();
  });

  it("does not dismiss until after the seal is broken", function () {
    const onDismiss = vi.fn();
    render(<BadgeEarnedModal badge={makeBadge()} onDismiss={onDismiss} />);
    // First two taps weaken the seal; they must never dismiss the modal.
    fireEvent.click(screen.getByRole("button", { name: /break the seal/i }));
    fireEvent.click(screen.getByRole("button", { name: /break the seal/i }));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
