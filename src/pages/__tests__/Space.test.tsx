/**
 * `/space/:spaceId` — the members' page, after the coach posts were retired.
 *
 * What these pin, against the Firestore fake:
 *   - the old weekly coach posts stay hidden (they are still in Firestore);
 *   - a pinned Tropos Team note sits above "From members", not in it;
 *   - membership is one small control: Join, or Joined with a confirmed
 *     Leave, and each writes or deletes the member document;
 *   - an empty space offers the member their last session, and the
 *     composer opens with it attached.
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
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
const restriction = vi.hoisted(() => ({ isRestricted: false, loading: false }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => restriction,
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const h = vi.hoisted(() => ({
  sessions: [] as unknown[],
  raceGoal: null as Record<string, unknown> | null,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "viewer" },
    profile: { displayName: "Sam", uid: "viewer", raceGoal: h.raceGoal },
  }),
  useUid: () => "viewer",
}));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({ blocked: new Set(), addBlocked: vi.fn() }),
}));
vi.mock("@/features/spaces/useRecentSessions", () => ({
  useRecentSessions: () => h.sessions,
}));
vi.mock("@/features/spaces/useSpacePostLikes", () => ({
  useSpacePostLikes: () => ({ liked: new Set(), deltas: {}, toggle: vi.fn() }),
}));
// The card and the composer have their own suites; here they only need to
// say which post rendered and how the composer was opened.
vi.mock("@/features/spaces/SpacePostCard", () => ({
  default: ({ post }: { post: { authorName: string; body: string } }) => (
    <article data-testid="space-post">
      {post.authorName}: {post.body}
    </article>
  ),
}));
vi.mock("@/features/spaces/SpacePostComposer", () => ({
  default: ({
    open,
    attachLatest,
  }: {
    open: boolean;
    attachLatest: boolean;
  }) =>
    open ? (
      <div data-testid="composer" data-attach-latest={String(attachLatest)} />
    ) : null,
}));

import Space from "../Space";
import { Timestamp } from "firebase/firestore";
import {
  failNextFirestore,
  readDoc,
  resetFirestore,
  seedFirestore,
  setSnapshotMetadata,
  unfiredFailures,
} from "@/test/firestoreHarness";
import { toast } from "@/lib/toast";

const SPACE = "spaces/womens-running";
const MEMBER_DOC = `${SPACE}/members/viewer`;
const NOW = new Date(2026, 8, 23, 12, 0);
const at = (d: Date) => Timestamp.fromDate(d);

const COACH = {
  authorId: "tropos-coach",
  authorName: "Tropos Coach",
  title: "What's your week one win?",
  body: "New week, clean slate.",
  official: true,
  likeCount: 0,
  commentCount: 0,
  createdAt: at(new Date(2026, 8, 21, 6)),
};
const TEAM_NOTE = {
  authorId: "ops-uid",
  authorName: "Tropos Team",
  body: "Say hi and share what you're training for.",
  official: true,
  pinned: true,
  likeCount: 0,
  commentCount: 0,
  createdAt: at(new Date(2026, 7, 1, 9)),
};
const PRIYA = {
  authorId: "priya-uid",
  authorName: "Priya S.",
  body: "First 10K done this morning.",
  likeCount: 3,
  commentCount: 1,
  createdAt: at(new Date(2026, 8, 23, 8)),
};

function renderSpace() {
  return render(
    <MemoryRouter initialEntries={["/space/womens-running"]}>
      <Routes>
        <Route path="/space/:spaceId" element={<Space />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  resetFirestore();
  h.sessions = [];
  h.raceGoal = null;
});

afterEach(() => {
  cleanup();
  expect(unfiredFailures()).toEqual([]);
  vi.useRealTimers();
});

it("requires London's assigned day and sends that day to the training editor", async () => {
  function TrainingDestination() {
    const location = useLocation();
    return <output data-testid="training-query">{location.search}</output>;
  }
  render(
    <MemoryRouter initialEntries={["/space/london-marathon"]}>
      <Routes>
        <Route path="/space/:spaceId" element={<Space />} />
        <Route path="/settings/run-plan" element={<TrainingDestination />} />
      </Routes>
    </MemoryRouter>
  );
  const train = await screen.findByRole("button", {
    name: "Train for this race",
  });
  expect(screen.getByText("24–25 April 2027")).toBeInTheDocument();
  expect(train).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Your assigned race day"), {
    target: { value: "2027-04-24" },
  });
  expect(train).toBeEnabled();
  fireEvent.click(train);
  expect(await screen.findByTestId("training-query")).toHaveTextContent(
    "date=2027-04-24"
  );
});

describe("Space page", () => {
  it("shows an ultra's distance and organiser without offering a marathon training plan", async () => {
    render(
      <MemoryRouter initialEntries={["/space/race-to-the-stones-100k"]}>
        <Routes>
          <Route path="/space/:spaceId" element={<Space />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/km ultra/)).toHaveTextContent(
      "100 km ultra"
    );
    expect(
      screen.getByRole("link", { name: "Visit official website" })
    ).toHaveAttribute(
      "href",
      "https://www.thresholdtrailseries.com/race-to-the-stones/"
    );
    expect(
      screen.queryByRole("button", { name: "Train for this race" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Ultra training plans aren’t available/)
    ).toBeInTheDocument();
  });
  it("hides the retired coach posts and puts the pinned team note above the members", async () => {
    seedFirestore({
      [MEMBER_DOC]: { uid: "viewer", joinedAt: at(new Date(2026, 8, 1)) },
      [`${SPACE}/posts/coach-2026-09-21`]: COACH,
      [`${SPACE}/posts/team-intro`]: TEAM_NOTE,
      [`${SPACE}/posts/p1`]: PRIYA,
    });
    renderSpace();

    const heading = await screen.findByRole("heading", {
      name: "From members",
    });
    await screen.findByText(/Priya S\./);
    const posts = screen.getAllByTestId("space-post");
    expect(posts.map((p) => p.textContent)).toEqual([
      `Tropos Team: ${TEAM_NOTE.body}`,
      `Priya S.: ${PRIYA.body}`,
    ]);
    expect(screen.queryByText(/Tropos Coach/)).toBeNull();
    // The team note precedes the members' heading; Priya's post follows it.
    expect(
      heading.compareDocumentPosition(posts[0]) &
        Node.DOCUMENT_POSITION_PRECEDING
    ).toBeTruthy();
    expect(
      heading.compareDocumentPosition(posts[1]) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // This week's count leaves out the coach post and last month's note.
    expect(screen.getByText(/this week/).textContent).toBe("1 post this week");
  });

  it("a member leaves only after confirming", async () => {
    seedFirestore({
      [MEMBER_DOC]: { uid: "viewer", joinedAt: at(new Date(2026, 8, 1)) },
      [`${SPACE}/posts/p1`]: PRIYA,
    });
    renderSpace();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Joined. Leave Women's Running",
      })
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText("Leave Women's Running?")
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(readDoc(MEMBER_DOC)).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", { name: "Joined. Leave Women's Running" })
    );
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Leave",
      })
    );
    await screen.findByRole("button", { name: "Join" });
    await waitFor(() => expect(readDoc(MEMBER_DOC)).toBeUndefined());
    // With posts showing, the members' heading offers "Write a post" only
    // to members.
    expect(screen.queryByRole("button", { name: "Write a post" })).toBeNull();
  });

  it("an empty space asks a visitor to join, then offers the new member their last session", async () => {
    h.sessions = [{ kind: "run", run: { id: "r1" } }];
    seedFirestore({ [`${SPACE}/posts/coach-2026-09-21`]: COACH });
    renderSpace();

    await screen.findByText("No posts from members yet");
    expect(screen.getByText("Join to post here.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Share your last session" })
    ).toBeNull();
    expect(screen.getByText("New space")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Share your last session" })
    );
    await waitFor(() => expect(readDoc(MEMBER_DOC)).toBeDefined());
    expect(screen.getByTestId("composer")).toHaveAttribute(
      "data-attach-latest",
      "true"
    );
  });

  it("says the posts couldn't load, rather than that there are none, and tries again", async () => {
    failNextFirestore("getDocs", { path: `${SPACE}/posts` });
    seedFirestore({ [`${SPACE}/posts/coach-2026-09-21`]: COACH });
    renderSpace();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load posts"
    );
    expect(unfiredFailures()).toEqual([]);
    expect(screen.queryByText("No posts from members yet")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    // The retry reads again; the space really has no member posts.
    await screen.findByText("No posts from members yet");
    expect(screen.queryByText("Couldn't load posts")).toBeNull();
  });

  it("an empty answer from this phone's cache is not an empty space", async () => {
    setSnapshotMetadata(`${SPACE}/posts`, { fromCache: true });
    renderSpace();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load posts"
    );
  });

  it("with no session to share, the empty state opens a plain post", async () => {
    seedFirestore({
      [MEMBER_DOC]: { uid: "viewer", joinedAt: at(new Date(2026, 8, 1)) },
    });
    renderSpace();

    fireEvent.click(
      await screen.findByRole("button", { name: "Write a post" })
    );
    expect(screen.getByTestId("composer")).toHaveAttribute(
      "data-attach-latest",
      "false"
    );
  });
});

it("shows an expired race as awaiting its next edition without a training action", async () => {
  vi.setSystemTime(new Date("2099-01-01T12:00:00Z"));
  render(
    <MemoryRouter initialEntries={["/space/berlin-marathon"]}>
      <Routes>
        <Route path="/space/:spaceId" element={<Space />} />
      </Routes>
    </MemoryRouter>
  );
  expect(
    await screen.findByText("Next date to be announced")
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Train for this race/i })
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Visit official website/i })
  ).toHaveAttribute("href", "https://www.bmw-berlin-marathon.com/en/");
});

describe("a restricted account (S4e)", () => {
  afterEach(() => {
    restriction.isRestricted = false;
  });

  it("can read a Space, is told why it can't join, and Join writes nothing", async () => {
    restriction.isRestricted = true;
    seedFirestore({ [`${SPACE}/posts/coach-2026-09-21`]: COACH });
    renderSpace();

    expect(
      await screen.findByText("Your account is restricted")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "Your account is restricted, so you can't do this for now.",
      expect.anything()
    );
    expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
    expect(readDoc(MEMBER_DOC)).toBeUndefined();
  });
});

describe("race identity (SOC-P2f)", () => {
  const PUBLIC_PROFILE = "users/viewer/public/profile";
  const renderRace = (spaceId: string) =>
    render(
      <MemoryRouter initialEntries={[`/space/${spaceId}`]}>
        <Routes>
          <Route path="/space/:spaceId" element={<Space />} />
        </Routes>
      </MemoryRouter>
    );
  const raceSwitch = () =>
    screen.queryByRole("switch", {
      name: "Show your race on your public profile",
    });

  beforeEach(() => {
    // A goal set from the race catalogue carries its race space's id.
    h.raceGoal = {
      distance: "marathon",
      targetDate: "2027-04-25",
      eventName: "London Marathon",
      eventSpaceId: "london-marathon",
    };
    seedFirestore({ [PUBLIC_PROFILE]: { displayName: "Sam" } });
  });

  it("offers the switch on your race's space and on no other race", async () => {
    renderRace("manchester-marathon");
    // Once the page's own reads have answered, the switch would be up.
    await screen.findByText("No posts from members yet");
    expect(
      screen.getByRole("button", { name: "Train for this race" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Show on your profile")).toBeNull();
    expect(raceSwitch()).toBeNull();
    cleanup();

    renderRace("london-marathon");
    expect(await screen.findByText("Show on your profile")).toBeInTheDocument();
    expect(raceSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("switching it on puts the race on your public profile, and off takes it away", async () => {
    renderRace("london-marathon");
    await screen.findByText("Show on your profile");
    const toggle = raceSwitch()!;

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(readDoc(PUBLIC_PROFILE)?.trainingForSpaceId).toBe(
        "london-marathon"
      )
    );
    expect(toggle).toHaveAttribute("aria-checked", "true");
    // A merge: the rest of the public profile stays.
    expect(readDoc(PUBLIC_PROFILE)?.displayName).toBe("Sam");

    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(readDoc(PUBLIC_PROFILE)?.trainingForSpaceId).toBeNull()
    );
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });
});
