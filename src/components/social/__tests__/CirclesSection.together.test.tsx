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
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );

    expect(screen.getByText("Couldn't load your Circles.")).toBeInTheDocument();
    // Failed ≠ empty: the cold-start selector must NOT render.
    expect(screen.queryByText("What support would help?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(value.reload).toHaveBeenCalledTimes(1);
  });

  it("empty + ok renders the five-option cold-start selector", () => {
    mockUseGoalSpaces.mockReturnValue(hookValue());
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );

    expect(screen.getByText("What support would help?")).toBeInTheDocument();
    /* The first three are the LOCK-PINNED `LAUNCH_TEMPLATES` labels
       (GsPb1), written out rather than derived so this pins the copy a
       user actually reads. They were "Race" and "Nutrition Consistency"
       here until 2026-08-22: the chooser kept a second hand-written copy
       of the catalogue, so tapping "Race" confirmed "Race Journey" and
       "Nutrition Consistency" confirmed "Consistency Reset" one screen
       later. This test asserted the drifted side, which is why nothing
       caught it. The chooser now derives from LAUNCH_TEMPLATES; the
       cross-check below is what holds the two ends together. */
    for (const label of [
      "Strength Block",
      "Race Journey",
      "Consistency Reset",
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

  it("the goal you pick is the goal the sheet confirms — same string, both ends", async () => {
    /* The cross-check the drift got past. `COLD_START_OPTIONS` used to be
       a second hand-written copy of `LAUNCH_TEMPLATES`, and the two had
       drifted on BOTH fields: you tapped "Race" and the next screen said
       "Race Journey"; you tapped "Nutrition Consistency" and it said
       "Consistency Reset". Every test in this file rendered only ONE of
       the two surfaces, so nothing compared them.

       This walks each option end-to-end and asserts the confirmed header
       carries the string the chooser offered. Deliberately NOT derived
       from either constant — reading the label off the rendered chooser
       and looking for that same text in the rendered sheet is what makes
       this a behaviour check rather than a restatement of the spread. */
    for (const type of [
      "Strength Block",
      "Race Journey",
      "Consistency Reset",
      "Hybrid",
    ]) {
      mockUseGoalSpaces.mockReturnValue(hookValue());
      const { unmount } = render(
        <MemoryRouter>
          <CirclesSection uid="me" />
        </MemoryRouter>
      );

      const option = screen.getByText(type);
      const offered = option.textContent ?? "";
      expect(offered).toBeTruthy();
      fireEvent.click(option);

      // The sheet opens on the compact confirmed header (goalPrechosen).
      expect(await screen.findByLabelText(/circle name/i)).toBeInTheDocument();

      /* Scope to the confirmed header, NOT the document. The chooser stays
         mounted under the sheet, so a document-wide getAllByText(offered)
         finds the chooser's own copy of the string and passes however far
         the sheet has drifted — checked by mutation: rewriting the sheet's
         label to the old "Race" left that version of this test green. The
         header is the block containing the "Change" control, so walk up
         from it. */
      const change = screen.getByRole("button", { name: /^change$/i });
      const header = change.parentElement as HTMLElement;
      expect(
        within(header).queryByText(offered),
        `the chooser offered "${offered}" but the create sheet's confirmed ` +
          `header reads "${header.textContent}" — the two catalogues have ` +
          `drifted apart again`
      ).not.toBeNull();

      unmount();
    }
  });

  it("Private Progress navigates to /review and never creates a circle", () => {
    const value = hookValue();
    mockUseGoalSpaces.mockReturnValue(value);
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Private Progress"));
    expect(navigateMock).toHaveBeenCalledWith("/review");
    expect(value.createCircle).not.toHaveBeenCalled();
  });

  it("the Hybrid option opens the create sheet with a visible, selected hybrid template", async () => {
    mockUseGoalSpaces.mockReturnValue(hookValue());
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Hybrid"));
    // Cal-fix: the goal is already chosen, so the sheet opens straight to
    // naming with a compact chosen-goal header — NOT the full re-pick list.
    expect(await screen.findByLabelText(/circle name/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Circle template" })
    ).not.toBeInTheDocument();
    // "Change" reveals the full picker (hybrid row appended + selected).
    fireEvent.click(screen.getByRole("button", { name: /^change$/i }));
    const group = await screen.findByRole("group", {
      name: "Circle template",
    });
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
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );

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
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );

    await waitFor(() => expect(value.loadDetail).toHaveBeenCalledWith("c2"));
    expect(value.loadDetail).toHaveBeenCalledTimes(1);
  });
});
