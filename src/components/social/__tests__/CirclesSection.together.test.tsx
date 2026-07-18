/**
 * SOCIAL-HOME-01 Stage C — CirclesSection Together-surface contract:
 * (a) a failed list read renders the retry block (Retry → reload),
 *     never the cold-start selector; (b) a genuinely-empty list
 *     renders the five-option goal selector, with "Private Progress"
 *     routing to /review and never creating a circle; (c) the first
 *     ACTIVE circle leads as the featured hero card (title tap-target
 *     + weekly-focus action) fed by exactly ONE eager loadDetail,
 *     while the remaining circles keep their summary-row rendering.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import type { CircleSummary } from "@/features/goalSpace/useGoalSpaces";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom"
    );
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

const mockUseGoalSpaces = vi.fn();
vi.mock("@/features/goalSpace/useGoalSpaces", () => ({
  useGoalSpaces: (uid: string | undefined) => mockUseGoalSpaces(uid),
}));

/* Shallow mock — the focus sheet's own contract is pinned in
   CircleWeeklyFocusSheet.test.tsx; this suite only cares that the
   section composes around it. */
vi.mock("@/components/social/CircleWeeklyFocusSheet", () => ({
  default: () => <div data-testid="focus-sheet" />,
}));

import CirclesSection from "../CirclesSection";

function circle(id: string, title: string, active = true): CircleSummary {
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
      active,
      createdAt: 1,
    },
    inviteCode: null,
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe("CirclesSection (SOCIAL-HOME-01 Together surface)", () => {
  it("renders the retry block when the list read failed, and Retry calls reload", () => {
    const value = hookValue({ loadFailed: true });
    mockUseGoalSpaces.mockReturnValue(value);
    render(<CirclesSection uid="me" />);

    expect(screen.getByText("Couldn't load your Circles.")).toBeInTheDocument();
    // Failed ≠ empty: the cold-start selector must NOT render.
    expect(screen.queryByText("What support would help?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(value.reload).toHaveBeenCalledTimes(1);
  });

  it("empty + ok renders the five-option cold-start selector", () => {
    mockUseGoalSpaces.mockReturnValue(hookValue());
    render(<CirclesSection uid="me" />);

    expect(screen.getByText("What support would help?")).toBeInTheDocument();
    for (const label of [
      "Strength Block",
      "Race",
      "Nutrition Consistency",
      "Hybrid",
      "Private Progress",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Invited users aren't funneled into creating.
    expect(
      screen.getByRole("button", { name: "Join with code" })
    ).toBeInTheDocument();
  });

  it("Private Progress navigates to /review and never creates a circle", () => {
    const value = hookValue();
    mockUseGoalSpaces.mockReturnValue(value);
    render(<CirclesSection uid="me" />);

    fireEvent.click(screen.getByText("Private Progress"));
    expect(navigateMock).toHaveBeenCalledWith("/review");
    expect(value.createCircle).not.toHaveBeenCalled();
  });

  it("the Hybrid option opens the create sheet with a visible, selected hybrid template", async () => {
    mockUseGoalSpaces.mockReturnValue(hookValue());
    render(<CirclesSection uid="me" />);

    fireEvent.click(screen.getByText("Hybrid"));
    const group = await screen.findByRole("group", {
      name: "Circle template",
    });
    // The three lock-pinned LAUNCH_TEMPLATES + the appended hybrid row.
    expect(within(group).getAllByRole("button")).toHaveLength(4);
    const pressed = within(group)
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent("Hybrid");
  });

  it("featured circle renders as the hero card with ONE eager detail read; others stay rows", async () => {
    const value = hookValue({
      circles: [
        circle("c1", "Autumn Strength Crew"),
        circle("c2", "Second Circle"),
      ],
    });
    mockUseGoalSpaces.mockReturnValue(value);
    render(<CirclesSection uid="me" />);

    // Featured hero card: tap target named by the circle title + the
    // single weekly-focus action.
    expect(
      screen.getByRole("button", { name: /autumn strength crew/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Set weekly focus" })
    ).toBeInTheDocument();
    // The non-featured circle keeps the summary-row rendering.
    expect(
      screen.getByRole("button", { name: /second circle/i })
    ).toBeInTheDocument();

    await waitFor(() => expect(value.loadDetail).toHaveBeenCalledTimes(1));
    expect(value.loadDetail).toHaveBeenCalledWith("c1");
  });

  it("skips inactive circles when picking the featured card", async () => {
    const value = hookValue({
      circles: [
        circle("c1", "Ended Block", false),
        circle("c2", "Autumn Strength Crew", true),
      ],
    });
    mockUseGoalSpaces.mockReturnValue(value);
    render(<CirclesSection uid="me" />);

    await waitFor(() => expect(value.loadDetail).toHaveBeenCalledWith("c2"));
    expect(value.loadDetail).toHaveBeenCalledTimes(1);
  });
});
