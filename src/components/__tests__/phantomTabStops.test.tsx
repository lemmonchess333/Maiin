import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, Dumbbell } from "lucide-react";
import BottomNavigation from "../BottomNavigation";
import RestDayCard from "../home/RestDayCard";
import { BadgeGrid } from "@/features/streaks/BadgeGrid";
import { BADGE_DEFINITIONS } from "@/features/streaks/badges";

/**
 * framer-motion's press gesture makes elements focusable, silently.
 *
 * `motion-dom`'s press setup ends with:
 *
 *     if (!isElementKeyboardAccessible(target) &&
 *         !target.hasAttribute("tabindex")) {
 *       target.tabIndex = 0;
 *     }
 *
 * — where `isElementKeyboardAccessible` is a set of BUTTON / INPUT /
 * SELECT / TEXTAREA / A. So every `whileTap` on a `motion.div` puts a
 * real stop in the tab order, and because a bare div carries no role and
 * no name, a screen reader lands on it and announces nothing.
 *
 * Three of these had shipped, and the two larger ones were not on any
 * list: the bottom nav's press-feedback div (five stops, on every
 * authenticated screen), `RestDayCard` (a card whose own docstring says
 * rest days have no action), and every tile in `BadgeGrid` (thirty on a
 * full grid — no click handler exists anywhere in that file).
 *
 * THIS SUITE DOES NOT MOCK framer-motion, and that is the whole point.
 * The house harness stubs it out — `StackedCTACards.test.tsx` renders
 * `motion.*` as plain elements with `whileTap` destructured away — so
 * the components' own tests cannot see this defect by construction. The
 * real library has to run for the tab stop to exist at all.
 */

vi.mock("@/features/streaks/useStreaks", () => ({
  useStreaks: () => ({
    currentStreak: 3,
    longestStreak: 9,
    allBadges: BADGE_DEFINITIONS.map((b) => ({ ...b, earnedAt: null })),
    earnedBadges: [],
    badgeProgressCtx: {
      currentStreak: 3,
      workouts: [],
      runs: [],
      today: new Date("2026-09-16T12:00:00"),
    },
  }),
}));

/** Natively focusable — the browser puts these in the tab order itself. */
const NATIVE = new Set(["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"]);

function accessibleName(el: Element): string {
  return (
    el.getAttribute("aria-label")?.trim() ||
    el.getAttribute("title")?.trim() ||
    el.textContent?.trim() ||
    ""
  );
}

/**
 * Elements that take a tab stop without being a control.
 *
 * The test for "is this a control" is a ROLE, not a name. An earlier
 * draft of this gate also required the element to be nameless, and that
 * let two of the three defects through: `RestDayCard` and every badge
 * tile contain their own text, so they read as "named" while still
 * being inert divs sitting in the tab order. Text inside a container is
 * not an accessible name and does not make it actionable — a reader
 * landing there is told nothing about what pressing it would do,
 * because nothing would.
 *
 * Natively focusable elements are somebody's deliberate control, and so
 * is anything carrying a role; neither is this gate's business.
 */
function phantomStops(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[tabindex="0"]')]
    .filter((el) => !NATIVE.has(el.tagName))
    .filter((el) => el.getAttribute("role") === null)
    .map(
      (el) =>
        `<${el.tagName.toLowerCase()} class="${el.className}"> ` +
        `text="${accessibleName(el).slice(0, 40)}"`
    );
}

describe("the detector itself", () => {
  it("flags a bare motion.div carrying whileTap", () => {
    /* Without this the suite below could pass by finding nothing —
       a wrong selector, a stubbed library, a render that threw early.
       This is the exact shape the three fixes removed, so it has to
       still be caught here. */
    const { container } = render(
      <motion.div whileTap={{ scale: 0.9 }}>
        <span aria-hidden="true" />
      </motion.div>
    );
    expect(phantomStops(container)).toHaveLength(1);
  });

  it("does not flag the same element once it opts out", () => {
    const { container } = render(
      <motion.div tabIndex={-1} whileTap={{ scale: 0.9 }}>
        <span aria-hidden="true" />
      </motion.div>
    );
    expect(phantomStops(container)).toEqual([]);
  });

  it("still flags a stop that merely contains text", () => {
    /* The hole in this gate's first draft. `RestDayCard` and every
       badge tile carry their own copy, so a nameless-only rule reported
       both as clean while framer-motion had made them focusable. */
    const { container } = render(
      <motion.div whileTap={{ scale: 0.9 }}>Take it easy</motion.div>
    );
    expect(phantomStops(container)).toHaveLength(1);
  });

  it("does not flag a real control, or a roled custom one", () => {
    const { container } = render(
      <div>
        <div tabIndex={0} role="button" aria-label="Deliberate widget" />
        <button type="button">Real control</button>
      </div>
    );
    expect(phantomStops(container)).toEqual([]);
  });
});

describe("shipped surfaces put no unnamed stop in the tab order", () => {
  it("the bottom navigation bar", () => {
    const { container } = render(
      <MemoryRouter>
        <BottomNavigation
          tabs={[
            { to: "/", icon: Home, label: "Home" },
            { to: "/program", icon: Dumbbell, label: "Train" },
          ]}
          pathname="/"
          unreadCount={0}
          onSocialVisit={() => {}}
        />
      </MemoryRouter>
    );
    expect(phantomStops(container)).toEqual([]);
  });

  it("the bottom navigation bar still has one stop per tab", () => {
    /* The nav's fix is an opt-out, not a removal, so the paired
       positive matters: the links themselves must still be reachable.
       A `tabIndex={-1}` on the <a> would satisfy the test above. */
    const { container } = render(
      <MemoryRouter>
        <BottomNavigation
          tabs={[
            { to: "/", icon: Home, label: "Home" },
            { to: "/program", icon: Dumbbell, label: "Train" },
          ]}
          pathname="/"
          unreadCount={0}
          onSocialVisit={() => {}}
        />
      </MemoryRouter>
    );
    const links = [...container.querySelectorAll("a")];
    expect(links).toHaveLength(2);
    for (const a of links) {
      expect(a.getAttribute("tabindex")).not.toBe("-1");
      expect(accessibleName(a)).not.toBe("");
    }
  });

  it("the rest-day card", () => {
    const { container } = render(<RestDayCard />);
    expect(phantomStops(container)).toEqual([]);
  });

  it("the badge grid", () => {
    const { container } = render(
      <MemoryRouter>
        <BadgeGrid />
      </MemoryRouter>
    );
    // A grid with nothing rendered would pass vacuously.
    expect(container.textContent).not.toBe("");
    expect(phantomStops(container)).toEqual([]);
  });
});
