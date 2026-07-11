/**
 * CirclesSection (GOALS-CORE-01) — render-level pins for the states
 * every launch user hits: the cold no-circles state (must read as
 * designed, with a working create path and the invite hint), the
 * locked three-template create sheet, and the circle list row.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { GoalSpace, Journey } from "@/features/goalSpaces/goalSpaceModel";

let mockJourneys: Journey[] = [];
let mockSpaces: Record<string, GoalSpace> = {};
let mockLoading = false;

vi.mock("@/hooks/useGoalSpaces", () => ({
  useGoalSpaces: () => ({
    journeys: mockJourneys,
    spaces: mockSpaces,
    loading: mockLoading,
  }),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1" },
    profile: { displayName: "Myles", trainingWhy: "" },
  }),
}));

const createGoalSpaceMock = vi.fn(async (_input: unknown) => ({
  spaceId: "s-new",
}));
vi.mock("@/lib/goalSpacesApi", () => ({
  createGoalSpace: (input: unknown) => createGoalSpaceMock(input),
}));

import CirclesSection from "../CirclesSection";

function renderSection() {
  return render(
    <MemoryRouter>
      <CirclesSection />
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  mockJourneys = [];
  mockSpaces = {};
  mockLoading = false;
  createGoalSpaceMock.mockClear();
});

describe("CirclesSection — cold state", () => {
  it("renders the designed empty state with a create action and invite hint", () => {
    renderSection();
    expect(screen.getByText("Train a goal together")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start a circle" })).toBeTruthy();
    expect(screen.getByText(/Got an invite link/)).toBeTruthy();
  });

  it("create sheet offers exactly the three locked launch templates", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Start a circle" }));
    expect(screen.getByText("Strength Block")).toBeTruthy();
    expect(screen.getByText("Race Journey")).toBeTruthy();
    expect(screen.getByText("Consistency Reset")).toBeTruthy();
    // body_composition has NO launch template (GsPb1 — private-first).
    expect(screen.queryByText(/Body/)).toBeNull();
  });

  it("selecting a template seeds an editable title and creates via the callable", async () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Start a circle" }));
    fireEvent.click(screen.getByText("Strength Block"));
    const input = screen.getByLabelText("Circle name") as HTMLInputElement;
    expect(input.value).toBe("8-week strength block");
    fireEvent.change(input, { target: { value: "Winter block" } });
    fireEvent.click(screen.getByRole("button", { name: "Create circle" }));
    await vi.waitFor(() => expect(createGoalSpaceMock).toHaveBeenCalled());
    expect(createGoalSpaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "strength_block", title: "Winter block" })
    );
  });
});

describe("CirclesSection — with circles", () => {
  it("lists each circle with live member count from the space doc", () => {
    mockJourneys = [
      {
        spaceId: "s1",
        type: "race",
        why: "",
        role: "owner",
        joinedAt: "2026-07-01T00:00:00.000Z",
      },
    ];
    mockSpaces = {
      s1: {
        id: "s1",
        type: "race",
        title: "London crew",
        visibility: "invite_only",
        ownerId: "u1",
        memberCount: 3,
        maxMembers: 8,
        createdAt: "2026-07-01T00:00:00.000Z",
        active: true,
      },
    };
    renderSection();
    expect(screen.getByText("London crew")).toBeTruthy();
    expect(screen.getByText(/3/)).toBeTruthy();
    expect(screen.getByText(/members/)).toBeTruthy();
    // No cold-state copy when circles exist.
    expect(screen.queryByText("Train a goal together")).toBeNull();
  });
});
