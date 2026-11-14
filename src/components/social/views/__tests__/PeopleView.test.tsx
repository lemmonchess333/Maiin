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
const A = vi.hoisted(() => ({
  profile: { uid: "me", inviteCode: undefined as string | undefined } as Record<
    string,
    unknown
  > | null,
  creationTime: new Date().toUTCString(),
  fetchCode: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  useUid: () => "me",
  useAuth: () => ({
    user: { uid: "me", metadata: { creationTime: A.creationTime } },
    profile: A.profile,
    refreshProfile: vi.fn().mockResolvedValue(undefined),
  }),
}));
/* Enough people training on Tropos for Spaces to be offered (App1 Q6),
   unless a test says otherwise. */
const people = vi.hoisted(() => ({ enough: true as boolean | null }));
vi.mock("@/hooks/useEnoughPeople", () => ({
  useEnoughPeople: () => people.enough,
}));
vi.mock("@/lib/invites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/invites")>()),
  fetchMyInviteCode: A.fetchCode,
}));

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
vi.mock("@/lib/socialAnalytics", () => ({ track: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: toasts }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  A.profile = { uid: "me", inviteCode: undefined };
  people.enough = true;
  A.creationTime = new Date().toUTCString();
  A.fetchCode.mockReset().mockResolvedValue("K7P49M2H");
  H.people = [];
  H.loading = false;
  H.activeArgs = [];
  H.spacesReady = true;
  H.entries = [];
  toasts.success.mockClear();
  toasts.error.mockClear();
});

function renderPeople(blockedReady: boolean) {
  return render(
    <MemoryRouter>
      <PeopleView
        active
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

it("offers no Space while Tropos is too quiet for them, to someone in none (App1 Q6)", () => {
  people.enough = false;
  renderPeople(true);
  expect(
    screen.getByText("Follow people to start seeing suggestions.")
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Browse spaces" })).toBeNull();
  cleanup();
  // Someone in a Space keeps the way to it.
  H.entries = [{ def: { id: "womens-running" }, joined: true }];
  renderPeople(true);
  expect(
    screen.getByRole("button", { name: "Browse spaces" })
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
      "Couldn’t copy the invite link. Try again."
    )
  );
  expect(toasts.success).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it("shares the app's public address with the person's code, not the page's own origin", async () => {
  // From the iPhone app the page's origin is capacitor://localhost, which
  // opens nothing for the person the invite is sent to.
  expect(window.location.origin).not.toBe("https://troposfit.com");
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { ...navigator, share });
  renderPeople(true);
  fireEvent.click(screen.getByRole("button", { name: "Share invite link" }));
  await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
  // Soc15: the link carries who sent it.
  expect(share.mock.calls[0][0]).toMatchObject({
    url: "https://troposfit.com/?invite=K7P49M2H",
  });
  expect(share.mock.calls[0][0].text).toContain("K7P4-9M2H");
  cleanup();
  vi.unstubAllGlobals();

  // No share sheet: the copied text carries the same address.
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", {
    ...navigator,
    share: undefined,
    clipboard: { writeText },
  });
  renderPeople(true);
  fireEvent.click(screen.getByRole("button", { name: "Share invite link" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  expect(writeText.mock.calls[0][0]).toMatch(
    / https:\/\/troposfit\.com\/\?invite=K7P49M2H$/
  );
  expect(toasts.success).toHaveBeenCalledWith("Invite link copied");
  vi.unstubAllGlobals();
});

it("shows the person's code to read out, made once when People opens", async () => {
  renderPeople(true);
  expect(await screen.findByText("K7P4-9M2H")).toBeInTheDocument();
  expect(screen.getByText("Your code")).toBeInTheDocument();
  expect(A.fetchCode).toHaveBeenCalledTimes(1);
});

it("shows the account's code at once, and the server's in its place", async () => {
  // The profile is read at sign-in, and a block may have renewed the code
  // since, so People asks for the code that works now.
  A.profile = { uid: "me", inviteCode: "A2B3C4D5" };
  renderPeople(true);
  expect(screen.getByText("A2B3-C4D5")).toBeInTheDocument();
  expect(await screen.findByText("K7P4-9M2H")).toBeInTheDocument();
  expect(A.fetchCode).toHaveBeenCalledTimes(1);
});

it("keeps the account's code when the server can't be asked", async () => {
  A.profile = { uid: "me", inviteCode: "A2B3C4D5" };
  A.fetchCode.mockRejectedValue(new Error("offline"));
  renderPeople(true);
  await vi.waitFor(() => expect(A.fetchCode).toHaveBeenCalledTimes(1));
  expect(screen.getByText("A2B3-C4D5")).toBeInTheDocument();
});

it("says what an invite makes, by whether the person approves followers", () => {
  // Approving is the default (absent): the friend asks to follow back, so
  // a code posted publicly reaches no followers-only post (Soc15 call 4,
  // STATUS 2026-11-05).
  A.profile = { uid: "me", inviteCode: "A2B3C4D5" };
  const { unmount } = renderPeople(true);
  expect(
    screen.getByText(
      "When they join with your link or code, you’ll follow them and they’ll ask to follow you."
    )
  ).toBeInTheDocument();
  unmount();
  A.profile = {
    uid: "me",
    inviteCode: "A2B3C4D5",
    approveFollowers: false,
  };
  renderPeople(true);
  expect(
    screen.getByText(
      "When they join with your link or code, you follow each other."
    )
  ).toBeInTheDocument();
});

it("says so when the code can't be had, and shares nothing", async () => {
  A.fetchCode.mockRejectedValue(new Error("offline"));
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { ...navigator, share });
  renderPeople(true);
  await waitFor(() => expect(A.fetchCode).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Share invite link" }));
  await waitFor(() =>
    expect(toasts.error).toHaveBeenCalledWith(
      "Couldn’t get your invite code. Check your connection and try again."
    )
  );
  expect(share).not.toHaveBeenCalled();
  expect(screen.queryByText("Your code")).toBeNull();
});

it("offers a new account a field for a friend's code, and an older one none", () => {
  renderPeople(true);
  expect(
    screen.getByRole("heading", { name: "Invited by a friend?" })
  ).toBeInTheDocument();
  cleanup();

  A.creationTime = new Date(Date.now() - 15 * 86_400_000).toUTCString();
  renderPeople(true);
  expect(
    screen.queryByRole("heading", { name: "Invited by a friend?" })
  ).toBeNull();
  cleanup();

  A.creationTime = new Date().toUTCString();
  A.profile = { uid: "me", invitedAt: { seconds: 1 } };
  renderPeople(true);
  expect(
    screen.queryByRole("heading", { name: "Invited by a friend?" })
  ).toBeNull();
});
