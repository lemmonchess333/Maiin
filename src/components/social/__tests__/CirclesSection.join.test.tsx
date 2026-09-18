/**
 * A refused join says which thing went wrong.
 *
 * `joinCircle` used to return a bare boolean, so all seven server
 * refusals produced one toast that guessed between two of them — "The
 * invite may be wrong, or the circle may be full." Nothing covered that
 * path, which is part of why it survived: the sheet's failure branch had
 * no test at all.
 *
 * The sentences themselves are pinned against the server's strings in
 * `joinRejection.test.ts`. What this file holds is the wiring — that the
 * reason reaches the toast rather than being flattened on the way, and
 * that a success still closes the sheet and clears the field.
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
    resolveTarget: vi.fn(),
    ...overrides,
  };
}

/** Open the join sheet and submit a code. */
async function submitCode(code: string) {
  render(
    <MemoryRouter>
      <CirclesSection uid="me" />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("button", { name: /join with code/i }));
  const field = await screen.findByLabelText("Invite code");
  fireEvent.change(field, { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: /^join$/i }));
}

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

describe("joining with a code", () => {
  it("shows the server's reason, not a guess between two causes", async () => {
    const joinCircle = vi.fn(async () => ({
      ok: false as const,
      reason:
        "That circle is full. Someone has to leave before anyone else can join.",
    }));
    mockUseGoalSpaces.mockReturnValue(hookValue({ joinCircle }));

    await submitCode("K7P4-9M2H");

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(toastMock.error).toHaveBeenCalledWith(
      "That circle is full. Someone has to leave before anyone else can join."
    );
    // The line this replaced. Anchored on the positive call above, so it
    // cannot pass by arriving before the toast fired.
    expect(toastMock.error).not.toHaveBeenCalledWith(
      expect.stringContaining("may be wrong")
    );
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("passes a different refusal through unchanged", async () => {
    // Two causes through one code path: if the component ever re-derives
    // the sentence instead of showing what it was handed, one of these
    // two assertions fails.
    const joinCircle = vi.fn(async () => ({
      ok: false as const,
      reason: "Too many attempts. Try again in a few minutes.",
    }));
    mockUseGoalSpaces.mockReturnValue(hookValue({ joinCircle }));

    await submitCode("K7P4-9M2H");

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "Too many attempts. Try again in a few minutes."
      )
    );
  });

  it("confirms and clears the field when the join lands", async () => {
    const joinCircle = vi.fn(async () => ({ ok: true as const }));
    mockUseGoalSpaces.mockReturnValue(hookValue({ joinCircle }));

    await submitCode("K7P4-9M2H");

    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("You're in.")
    );
    expect(joinCircle).toHaveBeenCalledWith("K7P4-9M2H");
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("keeps Join unavailable until there is a code to send", async () => {
    mockUseGoalSpaces.mockReturnValue(hookValue());
    render(
      <MemoryRouter>
        <CirclesSection uid="me" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /join with code/i }));
    const field = await screen.findByLabelText("Invite code");
    const join = screen.getByRole("button", { name: /^join$/i });
    expect(join).toBeDisabled();
    // Whitespace is not a code — the handler trims before deciding.
    fireEvent.change(field, { target: { value: "   " } });
    expect(join).toBeDisabled();
    fireEvent.change(field, { target: { value: "K7P4-9M2H" } });
    expect(join).toBeEnabled();
  });
});
