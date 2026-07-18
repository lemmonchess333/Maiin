/**
 * CIRCLE-TARGET-LIFECYCLE — the owner of a still-active Circle whose
 * target date has passed sees the continue/wrap prompt on the featured
 * hero card (taking precedence over the focus/invite action). Continue
 * reveals a date input and calls resolveTarget("continue", date); Wrap
 * calls resolveTarget("wrap"). Non-owners and future-dated targets never
 * see it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CircleSummary } from "@/features/goalSpace/useGoalSpaces";

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom"
    );
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: toastMock }));

const mockUseGoalSpaces = vi.fn();
vi.mock("@/features/goalSpace/useGoalSpaces", () => ({
  useGoalSpaces: (uid: string | undefined) => mockUseGoalSpaces(uid),
}));

vi.mock("@/components/social/CircleWeeklyFocusSheet", () => ({
  default: () => <div data-testid="focus-sheet" />,
}));

import CirclesSection from "../CirclesSection";

function summary(
  ownerId: string,
  targetDate: string | null,
  memberCount = 3
): CircleSummary {
  return {
    space: {
      id: "c1",
      type: "strength_block",
      title: "Autumn block",
      visibility: "invite_only",
      ownerId,
      memberCount,
      maxMembers: 8,
      targetDate,
      active: true,
      createdAt: 1,
    },
    // Multi-member so the default action is the focus button, not invite.
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
    loadDetail: vi.fn(async () => ({ members: [], events: [] })),
    publishEvent: vi.fn(),
    setWeeklyFocus: vi.fn(),
    backCheckIn: vi.fn(),
    resolveTarget: vi.fn(async () => true),
    ...overrides,
  };
}

const PAST = "2020-01-01";
const FUTURE = "2099-01-01";

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

describe("target reached — owner prompt", () => {
  it("shows continue/wrap for an owner whose target passed (not the focus button)", () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({ circles: [summary("me", PAST)] })
    );
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    expect(screen.getByText(/reached your target date/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^continue$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /wrap up/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /weekly focus/i })).toBeNull();
  });

  it("Continue reveals the date input and calls resolveTarget('continue', date)", async () => {
    const resolveTarget = vi.fn(async () => true);
    mockUseGoalSpaces.mockReturnValue(
      hookValue({ circles: [summary("me", PAST)], resolveTarget })
    );
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    const input = screen.getByLabelText(/new target date/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: FUTURE } });
    fireEvent.click(screen.getByRole("button", { name: /set new date/i }));
    await waitFor(() =>
      expect(resolveTarget).toHaveBeenCalledWith("c1", "continue", FUTURE)
    );
  });

  it("Wrap up calls resolveTarget('wrap')", async () => {
    const resolveTarget = vi.fn(async () => true);
    mockUseGoalSpaces.mockReturnValue(
      hookValue({ circles: [summary("me", PAST)], resolveTarget })
    );
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /wrap up/i }));
    await waitFor(() =>
      expect(resolveTarget).toHaveBeenCalledWith("c1", "wrap")
    );
  });
});

describe("target reached — not shown", () => {
  it("a non-owner with a passed target sees the focus button, no prompt", () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({ circles: [summary("someone-else", PAST)] })
    );
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    expect(screen.queryByText(/reached your target date/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: /weekly focus/i })
    ).toBeInTheDocument();
  });

  it("an owner whose target is still in the future sees no prompt", () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({ circles: [summary("me", FUTURE)] })
    );
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    expect(screen.queryByText(/reached your target date/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: /weekly focus/i })
    ).toBeInTheDocument();
  });
});
