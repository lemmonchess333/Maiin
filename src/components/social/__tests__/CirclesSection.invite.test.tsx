/**
 * CIRCLE-INVITE-ACTIVATION-01 — a new circle is useful immediately:
 * (a) creating hands off straight into the "Your Circle is ready"
 *     invite sheet with the RETURNED code (Share / Copy / Not now);
 * (b) a one-member circle's featured card leads with "Invite someone"
 *     (the focus action moves to the detail sheet); multi-member
 *     circles keep the focus button; a non-owner solo member (no
 *     inviteCode) falls back to the focus button.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
/* CirclesSection reads useSearchParams (PROGRAM-CIRCLE-01 hand-off),
   so renders need a Router. The partial mock below keeps the real
   MemoryRouter. */
import { MemoryRouter } from "react-router-dom";
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

vi.mock("@/components/social/CircleWeeklyFocusSheet", () => ({
  default: () => <div data-testid="focus-sheet" />,
}));

import CirclesSection from "../CirclesSection";

function summary(
  id: string,
  title: string,
  memberCount: number,
  inviteCode: string | null
): CircleSummary {
  return {
    space: {
      id,
      type: "strength_block",
      title,
      visibility: "invite_only",
      ownerId: "owner-1",
      memberCount,
      maxMembers: 8,
      targetDate: null,
      active: true,
      createdAt: 1,
    },
    inviteCode,
  };
}

function hookValue(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    circles: [] as CircleSummary[],
    loadFailed: false,
    reload: vi.fn(),
    createCircle: vi.fn(async () => ({
      spaceId: "new-space",
      inviteCode: "new-code",
    })),
    joinCircle: vi.fn(),
    leaveCircle: vi.fn(),
    loadDetail: vi.fn(async () => ({ members: [], events: [] })),
    publishEvent: vi.fn(),
    setWeeklyFocus: vi.fn(),
    backCheckIn: vi.fn(),
    ...overrides,
  };
}

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn(async () => {}) },
  });
});

describe("post-create invite hand-off", () => {
  it("creating a circle opens 'Your Circle is ready' with the returned code", async () => {
    mockUseGoalSpaces.mockReturnValue(hookValue());
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );

    // Cold-start selector → Strength Block preselects the create sheet.
    fireEvent.click(screen.getByRole("button", { name: /strength block/i }));
    fireEvent.change(screen.getByLabelText(/circle name/i), {
      target: { value: "Autumn block" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start circle/i }));

    await waitFor(() =>
      expect(screen.getByText("Your Circle is ready")).toBeInTheDocument()
    );
    // The RETURNED invite code, in the copyable row.
    expect(screen.getByText("new-space.new-code")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /copy code/i }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "new-space.new-code"
      )
    );

    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    // vaul keeps the sheet mounted through its close animation (which
    // jsdom never finishes) — assert the dialog's state flipped
    // instead of waiting for unmount.
    await waitFor(() => {
      const dialog = document.querySelector('[role="dialog"]');
      expect(
        dialog === null || dialog.getAttribute("data-state") === "closed"
      ).toBe(true);
    });
  });

  it("shares a short code bare + grouped (K7P49M2H → K7P4-9M2H), no spaceId", async () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({
        createCircle: vi.fn(async () => ({
          spaceId: "new-space",
          inviteCode: "K7P49M2H",
        })),
      })
    );
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /strength block/i }));
    fireEvent.change(screen.getByLabelText(/circle name/i), {
      target: { value: "Autumn block" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start circle/i }));

    await waitFor(() =>
      expect(screen.getByText("Your Circle is ready")).toBeInTheDocument()
    );
    // Short code shows grouped and WITHOUT the spaceId prefix.
    expect(screen.getByText("K7P4-9M2H")).toBeInTheDocument();
    expect(screen.queryByText(/new-space\./)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /copy code/i }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("K7P4-9M2H")
    );
  });
});

describe("one-member featured circle", () => {
  it("leads with Invite someone (owner) and opens the hand-off with that circle's code", async () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({ circles: [summary("c1", "Solo Circle", 1, "code-1")] })
    );
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );

    expect(
      screen.getByText(/Your Circle is ready — invite someone/i)
    ).toBeInTheDocument();
    const invite = screen.getByRole("button", { name: /invite someone/i });
    // The focus action moves to the detail sheet for a solo circle.
    expect(
      screen.queryByRole("button", { name: /set weekly focus/i })
    ).toBeNull();

    fireEvent.click(invite);
    await waitFor(() =>
      expect(screen.getByText("c1.code-1")).toBeInTheDocument()
    );
  });

  it("multi-member circles keep the focus button; a non-owner solo member falls back to it", () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({ circles: [summary("c2", "Full Circle", 3, "code-2")] })
    );
    const { unmount } = render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("button", { name: /set weekly focus/i })
    ).toBeInTheDocument();
    unmount();

    // Solo but NOT the owner: no inviteCode on the summary.
    mockUseGoalSpaces.mockReturnValue(
      hookValue({ circles: [summary("c3", "Orphan Circle", 1, null)] })
    );
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    expect(
      screen.queryByRole("button", { name: /invite someone/i })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /set weekly focus/i })
    ).toBeInTheDocument();
  });
});
