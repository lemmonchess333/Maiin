import { vi, expect, it, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PeopleView from "@/components/social/views/PeopleView";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/lib/auth", () => ({ useUid: () => "me" }));

const H = vi.hoisted(() => ({
  people: [] as {
    uid: string;
    displayName: string;
    reason: string;
    sharedSpaceId?: string;
  }[],
  loading: false,
  activeArgs: [] as boolean[],
  spacesReady: true,
  entries: [] as { def: { id: string }; joined: boolean }[],
}));
vi.mock("@/hooks/useSuggestedPeople", () => ({
  useSuggestedPeople: (active: boolean) => {
    H.activeArgs.push(active);
    return {
      people: H.people,
      loading: H.loading,
      refresh: vi.fn(),
      remove: vi.fn(),
    };
  },
}));
vi.mock("@/features/spaces/useSpacesDirectory", () => ({
  useSpacesDirectory: () => ({
    entries: H.entries,
    upcomingRaces: [],
    refresh: vi.fn(),
    ready: H.spacesReady,
  }),
}));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false }),
}));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({ blocked: new Set(), ready: true }),
}));
vi.mock("@/components/social/FollowsYouBadge", () => ({ default: () => null }));
vi.mock("@/components/social/PartnerReadyBadge", () => ({
  default: () => null,
}));
vi.mock("@/lib/socialAnalytics", () => ({ track: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: toasts }));

afterEach(cleanup);
beforeEach(() => {
  H.people = [];
  H.loading = false;
  H.activeArgs = [];
  H.spacesReady = true;
  H.entries = [];
});

function renderPeople(blockedReady: boolean) {
  return render(
    <MemoryRouter>
      <PeopleView
        active
        chromeHidden={false}
        blockedUsers={new Set()}
        blockedReady={blockedReady}
        openTogether={vi.fn()}
      />
    </MemoryRouter>
  );
}

it("reads as loading while the block list loads, not as nobody to suggest", () => {
  // The suggestions fetch waits on the block list, so the hook is
  // inactive and reports neither people nor loading. A cold open of
  // People flashed "No suggestions yet" here before the list arrived.
  renderPeople(false);
  expect(H.activeArgs.every((a) => a === false)).toBe(true);
  expect(screen.getByLabelText("Loading suggested people")).toBeInTheDocument();
  expect(screen.queryByText("No suggestions yet")).toBeNull();
});

it("says there is nobody to suggest once the list has answered empty", () => {
  renderPeople(true);
  expect(H.activeArgs).toContain(true);
  expect(screen.getByText("No suggestions yet")).toBeInTheDocument();
  expect(screen.queryByLabelText("Loading suggested people")).toBeNull();
});

it("asks someone in no space to join one, and someone in a space where suggestions come from", () => {
  renderPeople(true);
  expect(
    screen.getByText(
      "Follow people or join a space to start seeing suggestions."
    )
  ).toBeInTheDocument();
  cleanup();
  // The Social pass (2026-10-13): a member of a space was told to join
  // one before they'd see suggestions.
  H.entries = [{ def: { id: "womens-running" }, joined: true }];
  renderPeople(true);
  expect(
    screen.getByText(
      "Suggestions come from your spaces and the people you follow. Joining another space brings more."
    )
  ).toBeInTheDocument();
});

it("lists suggestions with their reason once they arrive, and no line where there is none", () => {
  H.people = [
    {
      uid: "priya",
      displayName: "Priya",
      reason: "shared_space",
      sharedSpaceId: "womens-running",
    },
    { uid: "tom", displayName: "Tom", reason: "recent_post" },
  ];
  renderPeople(true);
  expect(screen.getByText("Priya")).toBeInTheDocument();
  expect(screen.getByText("Also in Women's Running")).toBeInTheDocument();
  // A recent poster is listed with no reason under the name: "Recent
  // post" stood under every such name and said nothing.
  const tom = screen.getByText("Tom");
  expect(tom.parentElement?.nextElementSibling).toBeNull();
  expect(screen.queryByText("Recent post")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Refresh suggestions" })
  ).toBeInTheDocument();
});

it("waits for the joined spaces too, so the list is asked for once", () => {
  // Asked before the directory answered, the list was read without the
  // shared-space people and again with them, and reshuffled on screen.
  H.spacesReady = false;
  renderPeople(true);
  expect(H.activeArgs.every((a) => a === false)).toBe(true);
  expect(screen.getByLabelText("Loading suggested people")).toBeInTheDocument();
  expect(screen.queryByText("No suggestions yet")).toBeNull();
});

it("says so when the invite link can't be copied", async () => {
  // No share sheet (desktop web), so the link goes to the clipboard, which
  // can refuse.
  vi.stubGlobal("navigator", {
    ...navigator,
    share: undefined,
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  renderPeople(true);
  fireEvent.click(screen.getByRole("button", { name: "Share invite link" }));
  await waitFor(() =>
    expect(toasts.error).toHaveBeenCalledWith(
      "Couldn't copy the invite link. Try again."
    )
  );
  expect(toasts.success).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
