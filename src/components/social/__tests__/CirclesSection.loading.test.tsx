/**
 * What the Circles section shows before its list is ready.
 *
 * On a phone the list of Circles lands seconds after the Together tab's
 * heading, behind the tab's other reads, and the section drew a bare grey
 * block under "Circles" for all of that time: no words, no button, an
 * empty box. It now holds the shape of the card it is waiting for.
 *
 * And an account with no Circle has no name for the word filter to
 * check, so its card does not wait for the filter to load.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CircleSummary } from "@/features/goalSpace/useGoalSpaces";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

/* A word filter that never arrives: the case a slow or failed chunk load
   leaves the section in. */
vi.mock("@/lib/wordFilter", () => ({
  loadWordFilter: () => new Promise(() => {}),
  loadedWordFilter: () => null,
}));

const mockUseGoalSpaces = vi.fn();
vi.mock("@/features/goalSpace/useGoalSpaces", () => ({
  useGoalSpaces: (uid: string | undefined) => mockUseGoalSpaces(uid),
}));

vi.mock("@/components/social/CircleWeeklyFocusSheet", () => ({
  default: () => <div data-testid="focus-sheet" />,
}));

import CirclesSection from "../CirclesSection";

function circle(id: string, title: string): CircleSummary {
  return {
    space: {
      id,
      type: "strength_block",
      title,
      visibility: "invite_only",
      ownerId: "owner-1",
      memberCount: 3,
      maxMembers: 8,
      targetDate: null,
      active: true,
      createdAt: 1,
    },
    inviteCode: null,
    inviteCodeExpiresAt: null,
  };
}

function hookValue(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    circles: [] as CircleSummary[],
    loadFailed: false,
    reload: vi.fn(),
    createCircle: vi.fn(),
    joinCircle: vi.fn(),
    leaveCircle: vi.fn(),
    loadDetail: vi.fn().mockResolvedValue({ members: [], events: [] }),
    publishEvent: vi.fn(),
    setWeeklyFocus: vi.fn(),
    backCheckIn: vi.fn(),
    ...overrides,
  };
}

function renderSection() {
  return render(
    <MemoryRouter>
      <CirclesSection uid="me" />
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("CirclesSection while the list loads", () => {
  it("holds the card's shape on the card's surface, and says it is loading", () => {
    mockUseGoalSpaces.mockReturnValue(hookValue({ loading: true }));
    const { container } = renderSection();
    const placeholder = container.querySelector(
      '[data-skeleton="circles-card"]'
    );
    expect(placeholder, "no card-shaped placeholder").not.toBeNull();
    expect(placeholder).toHaveAttribute("role", "status");
    expect(placeholder).toHaveAttribute("aria-label", "Loading");
    expect(placeholder).toHaveClass("bg-card", "rounded-2xl", "p-4");
    // The block it replaces: muted, 64px, nothing inside it.
    expect(container.querySelector(".bg-muted\\/40")).toBeNull();
    // A title, two lines of words, and a row of two buttons.
    expect(placeholder!.querySelectorAll("p")).toHaveLength(3);
    expect(placeholder!.querySelectorAll(".h-\\[44px\\]")).toHaveLength(2);
    // Something is loading, so no state is claimed yet.
    expect(screen.queryByText("Train with a few friends")).toBeNull();
    expect(screen.queryByText("Couldn't load your circles.")).toBeNull();
  });

  it("shows the empty card as soon as an empty list lands, without the word filter", () => {
    mockUseGoalSpaces.mockReturnValue(hookValue());
    const { container } = renderSection();
    expect(screen.getByText("Train with a few friends")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start a circle" })
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-skeleton="circles-card"]')
    ).toBeNull();
  });

  it("still waits for the filter before drawing a Circle's name", () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({ circles: [circle("c1", "Spring block")] })
    );
    const { container } = renderSection();
    expect(screen.queryByText("Spring block")).toBeNull();
    expect(
      container.querySelector('[data-skeleton="circles-card"]')
    ).not.toBeNull();
  });
});
