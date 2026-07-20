/**
 * PROGRAM-CIRCLE-01 (slice 4a) — the "Train together" hand-off contract:
 * (a) ?circleCreate/&circleTitle/&circleDate with no compatible circle
 *     opens the create sheet prefilled (template preselected, title
 *     filled, "Runs until" line) and createCircle receives
 *     {type, title, targetDate};
 * (b) a compatible ACTIVE circle opens the chooser instead — "Start a
 *     new circle" still reaches the prefilled create sheet;
 * (c) an invalid circleCreate value ignores the whole hand-off;
 * (d) the params are stripped from the URL in every case;
 * plus: malformed dates are dropped (title survives, capped at 60),
 * the hand-off waits for the circle list to finish loading, and a
 * failed list read falls back to the prefilled create sheet.
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
import { MemoryRouter, useLocation } from "react-router-dom";
import type { CircleSummary } from "@/features/goalSpace/useGoalSpaces";

/* Keep the REAL router (MemoryRouter + useSearchParams drive the
   contract under test); only useNavigate is mocked, matching the
   sibling CirclesSection suites. */
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
  type: CircleSummary["space"]["type"],
  active = true
): CircleSummary {
  return {
    space: {
      id,
      type,
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

/** Exposes the live URL so the strip-once contract is observable. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <CirclesSection uid="me" />
      <LocationProbe />
    </MemoryRouter>
  );
}

async function expectParamsStripped() {
  await waitFor(() =>
    expect(screen.getByTestId("location-search").textContent).toBe("")
  );
}

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
});

describe("Train together hand-off (PROGRAM-CIRCLE-01)", () => {
  it("no compatible circle → create sheet opens prefilled and createCircle gets {type,title,targetDate}", async () => {
    const value = hookValue();
    mockUseGoalSpaces.mockReturnValue(value);
    renderAt(
      "/social?circleCreate=race&circleTitle=Marathon%20training&circleDate=2026-10-17"
    );

    const input = (await screen.findByLabelText(
      /circle name/i
    )) as HTMLInputElement;
    expect(input.value).toBe("Marathon training");

    // Cal-fix: goal came from the hand-off, so the full picker is
    // collapsed (no re-pick). The createCircle payload below proves the
    // template travelled through as "race".
    expect(
      screen.queryByRole("group", { name: "Circle template" })
    ).not.toBeInTheDocument();

    // The hand-off's finish line is visible…
    expect(screen.getByText(/runs until/i)).toBeInTheDocument();

    // …and travels into the create call.
    fireEvent.click(screen.getByRole("button", { name: /^start circle$/i }));
    await waitFor(() => expect(value.createCircle).toHaveBeenCalledTimes(1));
    expect(value.createCircle).toHaveBeenCalledWith({
      type: "race",
      title: "Marathon training",
      targetDate: "2026-10-17",
    });

    await expectParamsStripped();
  });

  it("hybrid hand-off renders the appended hybrid option, selected", async () => {
    mockUseGoalSpaces.mockReturnValue(hookValue());
    renderAt("/social?circleCreate=hybrid&circleTitle=Summer%20push");

    // Collapsed by default (goal pre-chosen); reveal the picker to check
    // the appended hybrid row renders + is selected.
    expect(await screen.findByLabelText(/circle name/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^change$/i }));
    const group = await screen.findByRole("group", {
      name: "Circle template",
    });
    // Three lock-pinned LAUNCH_TEMPLATES + the appended hybrid row.
    expect(within(group).getAllByRole("button")).toHaveLength(4);
    const pressed = within(group)
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent("Hybrid");
  });

  it("compatible ACTIVE circle → chooser; Start a new circle reaches the prefilled create sheet", async () => {
    const value = hookValue({
      circles: [summary("c1", "Autumn Crew", "strength_block")],
    });
    mockUseGoalSpaces.mockReturnValue(value);
    renderAt(
      "/social?circleCreate=strength_block&circleTitle=Bench%20Block&circleDate=2026-09-01"
    );

    expect(
      await screen.findByText("You already have a matching circle.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Autumn Crew" })
    ).toBeInTheDocument();
    // The chooser blocked the create sheet — no prefilled input yet.
    expect(screen.queryByLabelText(/circle name/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start a new circle" }));
    const input = (await screen.findByLabelText(
      /circle name/i
    )) as HTMLInputElement;
    expect(input.value).toBe("Bench Block");
    expect(screen.getByText(/runs until/i)).toBeInTheDocument();

    await expectParamsStripped();
  });

  it("Open <existing> opens that circle's detail via the existing openDetail", async () => {
    const value = hookValue({
      circles: [summary("c1", "Autumn Crew", "strength_block")],
    });
    mockUseGoalSpaces.mockReturnValue(value);
    renderAt("/social?circleCreate=strength_block&circleTitle=Bench");

    fireEvent.click(
      await screen.findByRole("button", { name: "Open Autumn Crew" })
    );
    // Detail sheet: "<memberCount> of <maxMembers> members".
    expect(await screen.findByText("3 of 8 members")).toBeInTheDocument();
    await waitFor(() => expect(value.loadDetail).toHaveBeenCalledWith("c1"));
  });

  it("an ENDED circle of the same type is not compatible — create sheet opens instead", async () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({
        circles: [summary("c1", "Old Crew", "strength_block", false)],
      })
    );
    renderAt("/social?circleCreate=strength_block&circleTitle=Bench");

    expect(await screen.findByLabelText(/circle name/i)).toBeInTheDocument();
    expect(
      screen.queryByText("You already have a matching circle.")
    ).toBeNull();
  });

  it("invalid circleCreate → nothing opens, params still stripped", async () => {
    // body_composition IS a GoalSpaceType, but it's schema-only
    // (GsPb1 private-first) — the create sheet can't render it, so
    // the hand-off must ignore it exactly like garbage input.
    for (const bad of ["not_a_type", "body_composition"]) {
      mockUseGoalSpaces.mockReturnValue(hookValue());
      const { unmount } = renderAt(
        `/social?circleCreate=${bad}&circleTitle=Sneaky&circleDate=2026-09-01`
      );
      await expectParamsStripped();
      expect(screen.queryByLabelText(/circle name/i)).toBeNull();
      expect(
        screen.queryByText("You already have a matching circle.")
      ).toBeNull();
      unmount();
    }
  });

  it("malformed date is dropped, long titles are capped at 60 — the prefill survives", async () => {
    const value = hookValue();
    mockUseGoalSpaces.mockReturnValue(value);
    const longTitle = "x".repeat(80);
    renderAt(
      `/social?circleCreate=race&circleTitle=${longTitle}&circleDate=17-10-2026`
    );

    const input = (await screen.findByLabelText(
      /circle name/i
    )) as HTMLInputElement;
    expect(input.value).toBe("x".repeat(60));
    expect(screen.queryByText(/runs until/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^start circle$/i }));
    await waitFor(() => expect(value.createCircle).toHaveBeenCalledTimes(1));
    // No targetDate key at all — undefined is never sent.
    expect(value.createCircle).toHaveBeenCalledWith({
      type: "race",
      title: "x".repeat(60),
    });
  });

  it("waits for the circle list before deciding compatible-vs-create", async () => {
    mockUseGoalSpaces.mockReturnValue(hookValue({ loading: true }));
    const { rerender } = render(
      <MemoryRouter
        initialEntries={["/social?circleCreate=strength_block&circleTitle=B"]}
      >
        <CirclesSection uid="me" />
        <LocationProbe />
      </MemoryRouter>
    );

    // Params consumed immediately…
    await expectParamsStripped();
    // …but nothing acts while the list is loading.
    expect(screen.queryByLabelText(/circle name/i)).toBeNull();
    expect(
      screen.queryByText("You already have a matching circle.")
    ).toBeNull();

    mockUseGoalSpaces.mockReturnValue(
      hookValue({ circles: [summary("c1", "Autumn Crew", "strength_block")] })
    );
    rerender(
      <MemoryRouter
        initialEntries={["/social?circleCreate=strength_block&circleTitle=B"]}
      >
        <CirclesSection uid="me" />
        <LocationProbe />
      </MemoryRouter>
    );

    expect(
      await screen.findByText("You already have a matching circle.")
    ).toBeInTheDocument();
  });

  it("failed list read → prefilled create sheet, never the chooser", async () => {
    mockUseGoalSpaces.mockReturnValue(hookValue({ loadFailed: true }));
    renderAt("/social?circleCreate=race&circleTitle=Marathon%20training");

    const input = (await screen.findByLabelText(
      /circle name/i
    )) as HTMLInputElement;
    expect(input.value).toBe("Marathon training");
    expect(
      screen.queryByText("You already have a matching circle.")
    ).toBeNull();
  });
});
