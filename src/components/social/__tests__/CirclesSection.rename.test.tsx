/**
 * Run27 call 11 — the owner renames a Circle from its sheet: Rename circle
 * opens the name in place, Save name sends it through the callable and the
 * sheet takes the new name at once; a member who is not the owner, and
 * anyone in an ended Circle, is offered no rename; a name the word filter
 * refuses is refused before anything is sent, with the display name's
 * sentence; a restricted owner is told why and nothing opens; and the
 * server's refusal reads in words.
 */
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { loadWordFilter } from "@/lib/wordFilter";
import type { CircleSummary } from "@/features/goalSpace/useGoalSpaces";
import { OBJECTIONABLE_NAME_MESSAGE } from "@/lib/objectionableMessages";
import { RESTRICTED_TOAST } from "@/lib/accountRestriction";

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
const restricted = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({
    isRestricted: restricted.value,
    loading: false,
  }),
}));
const mockUseGoalSpaces = vi.fn();
vi.mock("@/features/goalSpace/useGoalSpaces", () => ({
  useGoalSpaces: (uid: string | undefined) => mockUseGoalSpaces(uid),
}));
vi.mock("@/components/social/CircleWeeklyFocusSheet", () => ({
  default: () => <div data-testid="focus-sheet" />,
}));

import CirclesSection from "../CirclesSection";

function summary({
  active = true,
  ownerId = "me",
}: { active?: boolean; ownerId?: string } = {}): CircleSummary {
  return {
    space: {
      id: "c1",
      type: "race",
      title: "Spring half",
      visibility: "invite_only",
      ownerId,
      memberCount: 2,
      maxMembers: 8,
      targetDate: null,
      active,
      createdAt: 1,
    },
    inviteCode: null,
    inviteCodeExpiresAt: null,
  };
}

const MEMBERS = [
  { uid: "me", displayName: "Me", photoURL: null, role: "owner", joinedAt: 1 },
  {
    uid: "maya",
    displayName: "Maya",
    photoURL: null,
    role: "member",
    joinedAt: 2,
  },
];

function hookValue(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    circles: [summary()],
    loadFailed: false,
    reload: vi.fn(),
    createCircle: vi.fn(),
    renewInviteCode: vi.fn(),
    renameCircle: vi.fn(async () => ({ ok: true, title: "Autumn 10K" })),
    joinCircle: vi.fn(),
    leaveCircle: vi.fn(),
    loadDetail: vi.fn(async () => ({
      members: MEMBERS,
      events: [],
      meetups: [],
    })),
    publishEvent: vi.fn(),
    setWeeklyFocus: vi.fn(),
    backCheckIn: vi.fn(),
    resolveTarget: vi.fn(),
    planMeetup: vi.fn(),
    setMeetupGoing: vi.fn(),
    cancelMeetup: vi.fn(),
    ...overrides,
  };
}

function renderSection() {
  render(
    <MemoryRouter>
      <CirclesSection uid="me" />
    </MemoryRouter>
  );
}

async function openSheet(name: RegExp = /Spring half/) {
  fireEvent.click(screen.getByRole("button", { name }));
  const sheet = within(await screen.findByRole("dialog"));
  await sheet.findByText("Recent");
  return sheet;
}

beforeAll(async () => {
  await loadWordFilter();
});
/* These tests open vaul Drawers: drain Radix's deferred close handling
   before the file ends (CirclesSection.invite.test.tsx says why). */
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
});
beforeEach(() => {
  vi.clearAllMocks();
  restricted.value = false;
});

describe("renaming a Circle", () => {
  it("lets the owner rename it in place, and the sheet takes the new name", async () => {
    const value = hookValue();
    mockUseGoalSpaces.mockReturnValue(value);
    renderSection();
    const sheet = await openSheet();
    fireEvent.click(sheet.getByRole("button", { name: "Rename circle" }));
    const field = sheet.getByLabelText("Circle name");
    expect(field).toHaveValue("Spring half");
    fireEvent.change(field, { target: { value: "  Autumn 10K " } });
    fireEvent.click(sheet.getByRole("button", { name: "Save name" }));
    await waitFor(() =>
      expect(value.renameCircle).toHaveBeenCalledWith("c1", "Autumn 10K")
    );
    expect(toastMock.success).toHaveBeenCalledWith("Circle renamed.");
    // The sheet's title is the new name, and the field has closed.
    expect(
      await screen.findByRole("dialog", { name: "Autumn 10K" })
    ).toBeInTheDocument();
    expect(sheet.queryByLabelText("Circle name")).toBeNull();
  });

  it("Cancel closes the field and sends nothing", async () => {
    const value = hookValue();
    mockUseGoalSpaces.mockReturnValue(value);
    renderSection();
    const sheet = await openSheet();
    fireEvent.click(sheet.getByRole("button", { name: "Rename circle" }));
    fireEvent.click(sheet.getByRole("button", { name: "Cancel" }));
    expect(sheet.queryByLabelText("Circle name")).toBeNull();
    expect(value.renameCircle).not.toHaveBeenCalled();
  });

  it("offers no rename to a member who is not the owner, nor in an ended Circle", async () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({ circles: [summary({ ownerId: "maya" })] })
    );
    renderSection();
    let sheet = await openSheet();
    expect(sheet.queryByRole("button", { name: "Rename circle" })).toBeNull();
    // Anchored: the sheet's own actions are there.
    expect(
      sheet.getByRole("button", { name: "Leave circle" })
    ).toBeInTheDocument();
    cleanup();

    mockUseGoalSpaces.mockReturnValue(
      hookValue({ circles: [summary({ active: false })] })
    );
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /Ended circles/ }));
    sheet = await openSheet();
    expect(sheet.queryByRole("button", { name: "Rename circle" })).toBeNull();
  });

  it("refuses a name the word filter refuses before anything is sent", async () => {
    const value = hookValue();
    mockUseGoalSpaces.mockReturnValue(value);
    renderSection();
    const sheet = await openSheet();
    fireEvent.click(sheet.getByRole("button", { name: "Rename circle" }));
    fireEvent.change(sheet.getByLabelText("Circle name"), {
      target: { value: "shit runners" },
    });
    fireEvent.click(sheet.getByRole("button", { name: "Save name" }));
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(OBJECTIONABLE_NAME_MESSAGE)
    );
    expect(value.renameCircle).not.toHaveBeenCalled();
  });

  it("tells a restricted owner why, and opens nothing", async () => {
    restricted.value = true;
    const value = hookValue();
    mockUseGoalSpaces.mockReturnValue(value);
    renderSection();
    const sheet = await openSheet();
    fireEvent.click(sheet.getByRole("button", { name: "Rename circle" }));
    expect(toastMock.error).toHaveBeenCalledWith(
      RESTRICTED_TOAST,
      expect.anything()
    );
    expect(sheet.queryByLabelText("Circle name")).toBeNull();
    expect(value.renameCircle).not.toHaveBeenCalled();
  });

  it("says the server's refusal in words and keeps the field open", async () => {
    const value = hookValue({
      renameCircle: vi.fn(async () => ({
        ok: false,
        reason: "Only the circle’s owner can rename it.",
      })),
    });
    mockUseGoalSpaces.mockReturnValue(value);
    renderSection();
    const sheet = await openSheet();
    fireEvent.click(sheet.getByRole("button", { name: "Rename circle" }));
    fireEvent.change(sheet.getByLabelText("Circle name"), {
      target: { value: "Autumn 10K" },
    });
    fireEvent.click(sheet.getByRole("button", { name: "Save name" }));
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "Only the circle’s owner can rename it."
      )
    );
    expect(sheet.getByLabelText("Circle name")).toHaveValue("Autumn 10K");
  });
});
