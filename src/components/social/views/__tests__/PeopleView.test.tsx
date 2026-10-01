import { vi, expect, it, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PeopleView from "@/components/social/views/PeopleView";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/lib/auth", () => ({ useUid: () => "me" }));

const H = vi.hoisted(() => ({
  people: [] as { uid: string; displayName: string; reason: string }[],
  loading: false,
  activeArgs: [] as boolean[],
  spacesReady: true,
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
    entries: [],
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
vi.mock("@/components/ui/Coachmark", () => ({ default: () => null }));
vi.mock("@/lib/socialAnalytics", () => ({ track: vi.fn() }));

afterEach(cleanup);
beforeEach(() => {
  H.people = [];
  H.loading = false;
  H.activeArgs = [];
  H.spacesReady = true;
});

function renderPeople(blockedReady: boolean) {
  return render(
    <MemoryRouter>
      <PeopleView
        active
        chromeHidden={false}
        blockedUsers={new Set()}
        blockedReady={blockedReady}
        isNewUser={false}
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

it("lists suggestions with their reason once they arrive", () => {
  H.people = [{ uid: "priya", displayName: "Priya", reason: "recent_post" }];
  renderPeople(true);
  expect(screen.getByText("Priya")).toBeInTheDocument();
  expect(screen.getByText("Recent post")).toBeInTheDocument();
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
