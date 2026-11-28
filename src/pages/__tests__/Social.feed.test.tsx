/**
 * The Social shell's Feed tab with its real parts: FeedView, the cards,
 * the feed hooks and the shell's pull-to-refresh. Firestore is the one
 * fake (ADR-0009), seeded as the app writes. Only avatars, the points
 * cards and the other tabs are stubbed.
 *
 * - Following someone from their post on Explore: ActivityCard's Follow
 *   link (InlineFollow), the shared follow state, followUser's writes and
 *   the live follow count that the line over the feed reads.
 * - The Spaces source: pulling the page down reads the joined spaces' posts
 *   again.
 * - The posts the viewer hid: the feed waits for them, then leaves them out.
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
/* The posts the viewer hid (App1 Q38): read from the account, so the
   feed waits for them. Each test starts with none hidden, already read. */
const hiddenPosts = vi.hoisted(() => ({
  hidden: new Set<string>(),
  ready: true,
}));
vi.mock("@/hooks/useHiddenActivities", () => ({
  useHiddenActivities: () => hiddenPosts,
}));
/* One set for every render, as the hook keeps it: a new set each render
   would make the feeds read again on every render. */
const noBlocks = vi.hoisted(() => new Set<string>());
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({
    blocked: noBlocks,
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
  deferReads,
  flushSnapshots,
  pendingReads,
  readDoc,
  readLog,
  releaseAllReads,
  releaseRead,
  resetFirestore,
  resumeReads,
  seedFirestore,
} from "@/test/firestoreHarness";
import { __resetFollowStatesForTests } from "@/hooks/useFollowState";
import { __resetFeedSnapshotsForTests } from "@/lib/feedSnapshots";

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
  // The follow state and the feeds' kept reads are session caches;
  // each test is a session.
  __resetFollowStatesForTests();
  __resetFeedSnapshotsForTests();
  hiddenPosts.hidden = new Set();
  hiddenPosts.ready = true;
  seedBeasPosts();
});

/* Each source keeps what it read, across switches and for the session
   (`feedSnapshots`), and reads again behind it. On the phone every switch
   drew grey cards for about a second, back to a source just seen
   included, because the placeholder showed whenever a read was in flight
   with nothing in the list: an empty source, and every source on coming
   back to Social. */
describe("A source keeps what it read", () => {
  const placeholder = () => screen.queryByLabelText("Loading feed");
  const pick = (name: string) =>
    fireEvent.click(screen.getByRole("radio", { name }));
  /** Answer every held read, and hold no more. */
  const answerReads = () => {
    resumeReads();
    releaseAllReads();
  };
  afterEach(answerReads);

  it("the first read shows the placeholder; back on Explore its posts show at once while it reads again", async () => {
    renderSocial("/social?tab=feed&feed=explore");
    expect(placeholder()).toBeInTheDocument();
    await waitFor(() => expect(followLinks()).toHaveLength(2));
    expect(placeholder()).toBeNull();

    pick("Following");
    expect(
      await screen.findByText("You don’t follow anyone yet")
    ).toBeInTheDocument();

    deferReads();
    pick("Explore");
    // Anchored on Explore reading again: its read is held.
    await waitFor(() =>
      expect(pendingReads().some((p) => p.startsWith("activities"))).toBe(true)
    );
    expect(followLinks()).toHaveLength(2);
    expect(placeholder()).toBeNull();
  });

  it("an empty source shows its empty state at once when switched back to", async () => {
    resetFirestore();
    seedFirestore({ "following/me/users/bea": { uid: "bea" } });
    renderSocial("/social?tab=feed&feed=following");
    expect(
      await screen.findByText("Nothing from people you follow yet")
    ).toBeInTheDocument();
    pick("Explore");
    expect(
      await screen.findByText("Tropos is quiet right now")
    ).toBeInTheDocument();

    deferReads();
    pick("Following");
    await waitFor(() =>
      expect(pendingReads().some((p) => p.startsWith("feeds/me"))).toBe(true)
    );
    expect(
      screen.getByText("Nothing from people you follow yet")
    ).toBeInTheDocument();
    expect(placeholder()).toBeNull();

    pick("Explore");
    await waitFor(() =>
      expect(pendingReads().some((p) => p.startsWith("activities"))).toBe(true)
    );
    expect(screen.getByText("Tropos is quiet right now")).toBeInTheDocument();
    expect(placeholder()).toBeNull();
  });

  it("a read behind the posts that brings a new one shows it, with no placeholder between", async () => {
    renderSocial("/social?tab=feed&feed=explore");
    await waitFor(() => expect(followLinks()).toHaveLength(2));
    pick("Following");

    seedFirestore({
      "activities/cal-1": {
        authorId: "cal",
        authorName: "Cal",
        type: "run",
        visibility: "public",
        runName: "Tempo",
        distance: 8000,
        duration: 2400,
        kudosCount: 0,
        commentCount: 0,
        createdAt: minutesAgo(1),
      },
    });
    pick("Explore");
    expect(placeholder()).toBeNull();
    expect(followLinks()).toHaveLength(2);
    expect(
      await screen.findByRole("button", { name: "Follow Cal" })
    ).toBeInTheDocument();
    expect(followLinks()).toHaveLength(2);
  });

  it("coming back to Social shows what each source read, while it reads again", async () => {
    renderSocial("/social?tab=feed&feed=explore");
    await waitFor(() => expect(followLinks()).toHaveLength(2));
    cleanup();

    deferReads();
    renderSocial("/social?tab=feed&feed=explore");
    expect(followLinks()).toHaveLength(2);
    expect(placeholder()).toBeNull();
    await waitFor(() =>
      expect(pendingReads().some((p) => p.startsWith("activities"))).toBe(true)
    );
    expect(followLinks()).toHaveLength(2);
  });

  it("coming back to Social, the Spaces stream shows once the joined Spaces are known, while its posts are read again", async () => {
    seedFirestore({
      "spaces/runners/members/me": { uid: "me", joinedAt: minutesAgo(1440) },
      "spaces/runners/posts/p1": spacePost("Priya", "First 10K done.", 60),
    });
    renderSocial("/social?tab=feed&feed=communities");
    expect(await screen.findByText("First 10K done.")).toBeInTheDocument();
    cleanup();

    deferReads();
    renderSocial("/social?tab=feed&feed=communities");
    // Answer every read but the posts', until the posts' is the one held.
    await waitFor(() => {
      // From the end, so a release does not move the ones still to look at.
      for (let i = pendingReads().length - 1; i >= 0; i--) {
        if (!pendingReads()[i].includes("/posts")) releaseRead(i);
      }
      expect(pendingReads().some((p) => p.includes("/posts"))).toBe(true);
    });
    expect(screen.getByText("First 10K done.")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Loading posts from your Spaces")
    ).toBeNull();
  });
});

describe("Posts the viewer hid (App1 Q38)", () => {
  it("Explore waits for the hidden posts, then leaves a hidden one out", async () => {
    hiddenPosts.ready = false;
    const view = (
      <MemoryRouter initialEntries={["/social?tab=feed&feed=explore"]}>
        <Social />
      </MemoryRouter>
    );
    const { rerender } = render(view);
    // Anchored on the Feed having drawn: its own section is there.
    expect(
      await screen.findByRole("region", { name: "Activity feed" })
    ).toBeInTheDocument();
    await flushSnapshots();
    expect(readLog().filter((r) => r.path.startsWith("activities"))).toEqual(
      []
    );

    hiddenPosts.hidden = new Set(["bea-1"]);
    hiddenPosts.ready = true;
    rerender(
      <MemoryRouter initialEntries={["/social?tab=feed&feed=explore"]}>
        <Social key="read" />
      </MemoryRouter>
    );
    await waitFor(() => expect(followLinks()).toHaveLength(1));
  });
});

describe("Follow from a post on Explore, chosen as the source", () => {
  it("the link says Following, Bea's other post loses its link, and the line counts the follow", async () => {
    renderSocial("/social?tab=feed&feed=explore");
    await waitFor(() => expect(followLinks()).toHaveLength(2));
    expect(screen.getByText(/^Sessions shared publicly/)).toBeInTheDocument();
    expect(youFollow()).toBeUndefined();
    // Each post's card, found from its Follow link (newest first).
    const [first, second] = followLinks().map((link) =>
      link.closest<HTMLElement>(".surface-flat")!
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
    expect(screen.queryByText(/^Sessions shared publicly/)).toBeNull();
  });
});

describe("The Spaces source", () => {
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

describe("The live pulse (Soc15)", () => {
  const pad = (n: number) => String(n).padStart(2, "0");
  /** The viewer's local today, from the clock. */
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const pulseLine = () => screen.queryByText(/sessions on Tropos$/);

  it("the Feed says how many sessions Tropos saw today, and Together does not", async () => {
    seedFirestore({
      [`pulse/${todayKey()}`]: { sessions: 14, updatedAt: minutesAgo(1) },
    });
    renderSocial("/social?tab=feed&feed=explore");
    await waitFor(() =>
      expect(pulseLine()?.closest("p")).toHaveTextContent(
        "Today: 14 sessions on Tropos"
      )
    );
    // In the Feed's own section, under its source control.
    const feed = screen.getByRole("region", { name: "Activity feed" });
    expect(feed).toContainElement(pulseLine());
    cleanup();

    // Anchored on Together having drawn: its tab is the one selected.
    renderSocial("/social?tab=together");
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Together" })).toBeChecked()
    );
    expect(pulseLine()).toBeNull();
  });
});
