/**
 * A Circle saved under a name the filter now refuses is drawn as its
 * kind, in the featured card, the list and the detail sheet (circleTitle).
 */
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { loadWordFilter } from "@/lib/wordFilter";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CircleSummary } from "@/features/goalSpace/useGoalSpaces";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
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
      memberCount: 2,
      maxMembers: 8,
      targetDate: null,
      active: true,
      createdAt: 1,
    },
    inviteCode: null,
  };
}

afterEach(() => cleanup());

describe("a Circle under a refused name", () => {
  it("never shows the saved name, featured or listed", () => {
    mockUseGoalSpaces.mockReturnValue({
      loading: false,
      circles: [circle("c1", "Hitler"), circle("c2", "nazi gym")],
      loadFailed: false,
      reload: vi.fn(),
      createCircle: vi.fn(),
      joinCircle: vi.fn(),
      leaveCircle: vi.fn(),
      loadDetail: vi.fn().mockResolvedValue({ members: [], events: [] }),
      publishEvent: vi.fn(),
      setWeeklyFocus: vi.fn(),
      backCheckIn: vi.fn(),
    });
    const { container } = render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    expect(container.textContent).not.toMatch(/hitler|nazi/i);
    expect(screen.getAllByText("Strength Block").length).toBeGreaterThanOrEqual(
      2
    );
  });
});

/* The word filter as a session that has used it holds it: loaded, so the
   sheet draws on its first render (useWordFilter covers the wait). */
beforeAll(async () => {
  await loadWordFilter();
});
