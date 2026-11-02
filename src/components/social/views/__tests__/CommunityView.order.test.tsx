/**
 * The Together page (Soc14): You, then This week, then Discover, drawn
 * from the real sections. The Circles come from a scripted Circle list,
 * the challenges from the Firestore fake, the Spaces from a scripted
 * directory.
 *
 *   You        the Circles as rows, a live Circle first, each with its
 *              next step; then the joined challenges with their progress.
 *              With neither, the start-or-join card alone.
 *   This week  the weekly challenge, whose action is the page's one
 *              filled button, unless there is no Circle, when Start a
 *              circle is.
 *   Discover   the challenges not joined, then Spaces.
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
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Timestamp } from "firebase/firestore";
import type { CircleSummary } from "@/features/goalSpace/useGoalSpaces";
import type { SpaceDirectoryEntry } from "@/features/spaces/useSpacesDirectory";
import { loadWordFilter } from "@/lib/wordFilter";
import {
  flushSnapshots,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
const h = vi.hoisted(() => ({
  user: { uid: "me" },
  profile: { displayName: "Me" },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: h.user, profile: h.profile }),
  useUid: () => h.user.uid,
}));
vi.mock("@/lib/leaderboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/leaderboard")>()),
  loadBoardWeeks: async () => [],
  countMyWeekLifts: async () => 0,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/socialAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false, loading: false }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
const circlesHook = vi.hoisted(() => ({ circles: [] as CircleSummary[] }));
vi.mock("@/features/goalSpace/useGoalSpaces", () => ({
  useGoalSpaces: () => ({
    loading: false,
    loadFailed: false,
    circles: circlesHook.circles,
    reload: vi.fn(),
    createCircle: vi.fn(),
    renewInviteCode: vi.fn(),
    joinCircle: vi.fn(),
    leaveCircle: vi.fn(),
    loadDetail: vi.fn(() => new Promise(() => {})),
    publishEvent: vi.fn(),
    setWeeklyFocus: vi.fn(),
    backCheckIn: vi.fn(),
    resolveTarget: vi.fn(),
  }),
}));
vi.mock("@/components/social/CircleWeeklyFocusSheet", () => ({
  default: () => null,
}));
const SPACE: SpaceDirectoryEntry = {
  def: {
    id: "runners",
    name: "Runners",
    tagline: "t",
    kind: "interest",
    accent: "running",
    icon: "footprints",
  },
  memberCount: null,
  joined: false,
};
vi.mock("@/features/spaces/useSpacesDirectory", () => ({
  useSpacesDirectory: () => ({
    entries: [SPACE],
    upcomingRaces: [],
    refresh: vi.fn(),
  }),
}));

import CommunityView from "../CommunityView";

function circle(id: string, title: string, memberCount: number): CircleSummary {
  return {
    space: {
      id,
      type: "strength_block",
      title,
      visibility: "invite_only",
      ownerId: "me",
      memberCount,
      maxMembers: 8,
      targetDate: null,
      active: true,
      createdAt: 1,
    },
    inviteCode: "K7P49M2H",
    inviteCodeExpiresAt: Date.now() + 86_400_000,
  };
}

const MONTH_ID = "featured-monthly-2026-09-01";
const month = {
  type: "monthly",
  startDate: Timestamp.fromDate(new Date("2026-09-01T00:00:00Z")),
  endDate: Timestamp.fromDate(new Date("2026-10-01T00:00:00Z")),
  participantCount: 0,
};

beforeAll(async () => {
  await loadWordFilter();
  // The page's lazy chunk, loaded once up front so no test waits on it.
  await import("@/features/challenges/ChallengeList");
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
  resetFirestore();
  circlesHook.circles = [];
  seedFirestore({
    "users/me": h.profile,
    "challenges/weekly-2026-09-07": {
      name: "Weekly Warrior",
      description: "Train twice this week",
      type: "weekly",
      metric: "workout_count",
      icon: "trophy",
      tiers: { bronze: 2, silver: 4, gold: 6 },
      startDate: Timestamp.fromDate(new Date("2026-09-07T00:00:00Z")),
      endDate: Timestamp.fromDate(new Date("2026-09-14T00:00:00Z")),
      participantCount: 0,
    },
    [`challenges/${MONTH_ID}`]: {
      ...month,
      name: "September Active Days",
      description: "Run or lift on different days.",
      metric: "active_days",
      icon: "calendar-days",
      tiers: { bronze: 8, silver: 12, gold: 20 },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function openTogether() {
  render(
    <MemoryRouter>
      <CommunityView
        active
        chromeHidden={false}
        uid="me"
        openPeople={() => {}}
        refreshRef={{ current: null }}
      />
    </MemoryRouter>
  );
  await flushSnapshots();
  await screen.findByRole("button", { name: "Join weekly challenge" });
  await flushSnapshots();
}

/** True when `a` comes before `b` in the document. */
const before = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

const FILLED = /\bbg-(primary-strong|running-fill|nutrition-fill)\b/;
const filledButtons = () =>
  screen
    .getAllByRole("button")
    .filter((b) => FILLED.test(b.className))
    .map((b) => b.getAttribute("aria-label") ?? b.textContent);

describe("the Together page's order", () => {
  it("is You, then This week, then Discover", async () => {
    circlesHook.circles = [circle("c1", "Sunday long runs", 3)];
    seedFirestore({
      [`challenges/${MONTH_ID}/participants/me`]: {
        currentValue: 3,
        tierAchieved: null,
        joinedAt: Timestamp.fromDate(new Date("2026-09-02T09:00:00Z")),
      },
      "challenges/monthly-2026-09-01": {
        ...month,
        name: "September Mileage",
        description: "Every run adds up",
        metric: "total_km",
        icon: "footprints",
        tiers: { bronze: 10, silver: 25, gold: 50 },
      },
    });
    await openTogether();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((el) => el.textContent)
    ).toEqual(["You", "This week", "Discover"]);

    const you = screen.getByRole("region", { name: "You" });
    const circles = within(you).getByRole("list", { name: "Your circles" });
    const joined = await within(you).findByRole("list", {
      name: "Your challenges",
    });
    expect(before(circles, joined)).toBe(true);

    const discover = screen.getByRole("region", { name: "Discover" });
    const toJoin = within(discover).getByRole("list", {
      name: "Challenges to join",
    });
    expect(within(toJoin).getByText("September Mileage")).toBeInTheDocument();
    expect(
      before(toJoin, within(discover).getByRole("heading", { name: "Spaces" }))
    ).toBe(true);
  });

  it("leads You with a live Circle, ahead of one still waiting on its invite", async () => {
    circlesHook.circles = [
      circle("solo", "Hear", 1),
      circle("live", "Sunday long runs", 3),
    ];
    await openTogether();
    const rows = within(
      screen.getByRole("list", { name: "Your circles" })
    ).getAllByRole("listitem");
    expect(rows[0].textContent).toContain("Sunday long runs");
    expect(rows[1].textContent).toContain("Hear");
  });
});

describe("You", () => {
  it("gives a circle of one its next step, Invite someone, on its row", async () => {
    circlesHook.circles = [circle("solo", "Hear", 1)];
    await openTogether();
    const row = within(
      screen.getByRole("list", { name: "Your circles" })
    ).getByRole("listitem");
    expect(
      within(row).getByRole("button", { name: "Invite someone" })
    ).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /check in/i })).toBeNull();
    // The member count stays one line beside it.
    expect(row.textContent).toContain("1 member");
  });

  it("shows each joined challenge with how far along it is", async () => {
    circlesHook.circles = [circle("c1", "Sunday long runs", 3)];
    seedFirestore({
      [`challenges/${MONTH_ID}/participants/me`]: {
        currentValue: 3,
        tierAchieved: null,
        joinedAt: Timestamp.fromDate(new Date("2026-09-02T09:00:00Z")),
      },
    });
    await openTogether();
    const you = screen.getByRole("region", { name: "You" });
    const joined = await within(you).findByRole("list", {
      name: "Your challenges",
    });
    const row = within(joined)
      .getByText("September Active Days")
      .closest("li")!;
    expect(row.textContent).toContain("3 of 8 days");
    expect(within(row).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "38"
    );
  });

  it("is the start-or-join card alone with no Circle and no joined challenge", async () => {
    await openTogether();
    const you = screen.getByRole("region", { name: "You" });
    expect(
      within(you).getByText("Train with a few friends")
    ).toBeInTheDocument();
    expect(within(you).queryAllByRole("list")).toHaveLength(0);
    expect(
      within(you)
        .getAllByRole("button")
        .map((b) => b.textContent)
    ).toEqual(["Start a circle", "Join with code"]);
  });
});

describe("the page's one filled button", () => {
  it("is the weekly challenge's Join once there is a Circle", async () => {
    // A live Circle's check-in is a quiet step on its row, not a second
    // filled button.
    circlesHook.circles = [
      circle("live", "Sunday long runs", 3),
      circle("solo", "Hear", 1),
    ];
    await openTogether();
    expect(filledButtons()).toEqual(["Join weekly challenge"]);
  });

  it("is Start a circle while there is no Circle", async () => {
    await openTogether();
    expect(filledButtons()).toEqual(["Start a circle"]);
  });
});
