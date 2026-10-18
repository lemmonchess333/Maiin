/**
 * The Social shell's Feed tab with its real parts: FeedView, the cards,
 * the feed hooks and the shell's pull-to-refresh. Firestore is the one
 * fake (ADR-0009), seeded as the app writes. Only avatars, the points
 * cards and the other tabs are stubbed.
 *
 * - Following someone from their post on Explore: ActivityCard's Follow
 *   link (InlineFollow), the shared follow state, followUser's writes and
 *   the live follow count that the line over the feed reads.
 * - My communities: pulling the page down reads the joined spaces' posts
 *   again.
 */
import { vi, expect, it, describe, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "me" } },
}));
vi.mock("@/lib/auth", () => ({
  useUid: () => "me",
  useAuth: () => ({ user: { uid: "me" }, profile: { displayName: "Me" } }),
}));
vi.mock("@/hooks/useHiddenActivities", () => ({
  useHiddenActivities: () => ({ hidden: new Set() }),
}));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({
    blocked: new Set(),
    ready: true,
    addBlocked: vi.fn(),
    removeBlocked: vi.fn(),
  }),
}));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false, loading: false }),
}));
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    items: [],
    unreadCount: 0,
    loading: false,
    error: null,
    retry: vi.fn(),
    markAllSeen: vi.fn(),
  }),
}));
vi.mock("@/hooks/useSuggestedPeople", () => ({
  useSuggestedPeople: () => ({
    people: [],
    loading: false,
    refresh: vi.fn(),
    remove: vi.fn(),
  }),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km",
}));
vi.mock("@/components/social/NotificationsSheet", () => ({
  default: () => null,
}));
vi.mock("@/components/social/views/CommunityView", () => ({
  default: () => null,
}));
vi.mock("@/components/social/views/PeopleView", () => ({
  default: () => null,
}));
vi.mock("@/components/social/LeaderboardCard", () => ({
  default: () => null,
}));
vi.mock("@/components/social/TrajectoryCard", () => ({
  default: () => null,
}));
vi.mock("@/lib/personalTrajectory", () => ({
  getPersonalTrajectory: async () => null,
}));
vi.mock("@/components/Avatar", () => ({ default: () => <div /> }));
vi.mock("@/components/social/BlockAwareAvatar", () => ({
  default: () => <div />,
}));
vi.mock("@/lib/socialAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import Social from "@/pages/Social";
import { Timestamp } from "firebase/firestore";
import {
  readDoc,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { __resetFollowStatesForTests } from "@/hooks/useFollowState";

/** Minutes before now, from the clock. */
const minutesAgo = (m: number) => Timestamp.fromMillis(Date.now() - m * 60_000);

/** Two public runs by Bea, as postActivity writes them. */
function seedBeasPosts() {
  const run = (id: string, m: number) => ({
    [`activities/${id}`]: {
      authorId: "bea",
      authorName: "Bea",
      type: "run",
      visibility: "public",
      runName: "Easy run",
      distance: 5000,
      duration: 1680,
      kudosCount: 0,
      commentCount: 0,
      createdAt: minutesAgo(m),
    },
  });
  seedFirestore({ ...run("bea-1", 5), ...run("bea-2", 90) });
}

/** A member's post in a space, as SpacePostComposer writes it. */
const spacePost = (authorName: string, body: string, m: number) => ({
  authorId: `${authorName.toLowerCase()}-uid`,
  authorName,
  body,
  likeCount: 0,
  commentCount: 0,
  createdAt: minutesAgo(m),
});

/** The pull-down gesture usePullToRefresh listens for, from `el` down. */
function pullDown(el: Element) {
  fireEvent.touchStart(el, { touches: [{ clientY: 100 }] });
  fireEvent.touchMove(el, { touches: [{ clientY: 300 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientY: 300 }] });
}

function renderSocial(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Social />
    </MemoryRouter>
  );
}

const followLinks = () =>
  screen.queryAllByRole("button", { name: "Follow Bea" });
const youFollow = () => screen.queryByText(/^You follow/)?.closest("p");

afterEach(cleanup);
beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  // The follow state is a session cache; each test is a session.
  __resetFollowStatesForTests();
  seedBeasPosts();
});

describe("Follow from a post on Explore, chosen as the source", () => {
  it("the link says Following, Bea's other post loses its link, and the line counts the follow", async () => {
    renderSocial("/social?tab=feed&feed=explore");
    await waitFor(() => expect(followLinks()).toHaveLength(2));
    expect(
      screen.getByText(/^Sessions people shared publicly/)
    ).toBeInTheDocument();
    expect(youFollow()).toBeUndefined();
    // Each post's card, found from its Follow link (newest first).
    const [first, second] = followLinks().map(
      (link) => link.closest<HTMLElement>(".card-shadow")!
    );

    fireEvent.click(within(first).getByRole("button", { name: "Follow Bea" }));

    await waitFor(() =>
      expect(youFollow()).toHaveTextContent("You follow 1 person · Find people")
    );
    expect(within(first).getByText("Following")).toBeInTheDocument();
    expect(second).toBeInTheDocument();
    expect(within(second).queryByText("Following")).toBeNull();
    expect(followLinks()).toHaveLength(0);
    expect(readDoc("following/me/users/bea")).toBeDefined();
    expect(readDoc("followers/bea/users/me")).toBeDefined();
    expect(screen.queryByText(/^Sessions people shared publicly/)).toBeNull();
  });
});

describe("My communities", () => {
  it("pulling the page down reads the joined spaces' posts again", async () => {
    seedFirestore({
      "spaces/runners/members/me": { uid: "me", joinedAt: minutesAgo(1440) },
      "spaces/runners/posts/p1": spacePost("Priya", "First 10K done.", 60),
    });
    renderSocial("/social?tab=feed&feed=communities");
    const first = await screen.findByText("First 10K done.");

    // Posted after the stream was read: the stream holds no listener.
    seedFirestore({
      "spaces/runners/posts/p2": spacePost("Sam", "Track night, 6 x 800 m.", 1),
    });
    expect(screen.queryByText("Track night, 6 x 800 m.")).toBeNull();

    pullDown(first);
    expect(
      await screen.findByText("Track night, 6 x 800 m.")
    ).toBeInTheDocument();
    expect(screen.getByText("First 10K done.")).toBeInTheDocument();
  });
});
