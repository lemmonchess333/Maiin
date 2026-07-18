/**
 * CIRCLE-SESSION-01 — explicit summary-only Circle share sheet.
 *
 * Pins the privacy-critical behaviour:
 *   (a) no circles → the Together prompt, and no share path that
 *       could fire publishEvent;
 *   (b) circles → the picker preselects the first ACTIVE circle and
 *       Share calls publishEvent with (id, "session_completed", note)
 *       and ONLY those args — nothing else can ride along;
 *   (c) the note is optional (share without typing → undefined);
 *   (d) a failed publish keeps the sheet open (note + selection kept).
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

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom"
    );
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const mockUseGoalSpaces = vi.fn();
vi.mock("@/features/goalSpace/useGoalSpaces", () => ({
  useGoalSpaces: (uid: string | undefined) => mockUseGoalSpaces(uid),
}));

import CircleShareSheet from "../CircleShareSheet";

function summary(id: string, title: string, active: boolean): CircleSummary {
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
    loadDetail: vi.fn(async () => ({ members: [], events: [] })),
    publishEvent: vi.fn(async () => true),
    setWeeklyFocus: vi.fn(),
    backCheckIn: vi.fn(),
    ...overrides,
  };
}

function renderSheet() {
  return render(
    <MemoryRouter>
      <CircleShareSheet open onOpenChange={vi.fn()} uid="me" />
    </MemoryRouter>
  );
}

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

describe("no circles", () => {
  it("shows the Together prompt and offers no share action", () => {
    const hook = hookValue();
    mockUseGoalSpaces.mockReturnValue(hook);
    renderSheet();

    expect(
      screen.getByText(
        /Circles are small, invite-only groups around one shared goal/i
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /share to circle/i })
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /open together/i }));
    expect(navigateMock).toHaveBeenCalledWith("/social");
    expect(hook.publishEvent).not.toHaveBeenCalled();
  });
});

describe("with circles", () => {
  it("preselects the first ACTIVE circle and shares (id, session_completed, note) — only those args", async () => {
    const hook = hookValue({
      circles: [
        summary("c1", "Ended Block", false),
        summary("c2", "Active Block", true),
      ],
    });
    mockUseGoalSpaces.mockReturnValue(hook);
    renderSheet();

    // First ACTIVE circle preselected, not merely the first circle.
    expect(
      screen.getByRole("radio", { name: /active block/i })
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /ended block/i })).toHaveAttribute(
      "aria-checked",
      "false"
    );

    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Felt strong today" },
    });
    fireEvent.click(screen.getByRole("button", { name: /share to circle/i }));

    await waitFor(() => expect(hook.publishEvent).toHaveBeenCalledTimes(1));
    expect(hook.publishEvent).toHaveBeenCalledWith(
      "c2",
      "session_completed",
      "Felt strong today"
    );
    // ONLY those args — the privacy contract: nothing else can ride
    // along into the event write.
    expect(hook.publishEvent.mock.calls[0]).toHaveLength(3);
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Shared with your circle.")
    );
  });

  it("the note is optional — sharing without typing passes undefined", async () => {
    const hook = hookValue({ circles: [summary("c1", "Block", true)] });
    mockUseGoalSpaces.mockReturnValue(hook);
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /share to circle/i }));

    await waitFor(() => expect(hook.publishEvent).toHaveBeenCalledTimes(1));
    expect(hook.publishEvent).toHaveBeenCalledWith(
      "c1",
      "session_completed",
      undefined
    );
  });

  it("a failed publish keeps the sheet open with the note intact", async () => {
    const hook = hookValue({
      circles: [summary("c1", "Block", true)],
      publishEvent: vi.fn(async () => false),
    });
    mockUseGoalSpaces.mockReturnValue(hook);
    const onOpenChange = vi.fn();
    render(
      <MemoryRouter>
        <CircleShareSheet open onOpenChange={onOpenChange} uid="me" />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Retry me" },
    });
    fireEvent.click(screen.getByRole("button", { name: /share to circle/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // Never closed; state preserved for the retry.
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Note")).toHaveValue("Retry me");
    expect(
      screen.getByRole("button", { name: /share to circle/i })
    ).toBeInTheDocument();
  });
});
