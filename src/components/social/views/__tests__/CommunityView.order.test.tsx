/**
 * The Together page (Soc16): This week, then Circles, then Discover,
 * drawn from the real sections. The Circles come from a scripted Circle
 * list, the challenges from the Firestore fake, the Spaces from a
 * scripted directory. The race hero has its own suite (RaceHero.test);
 * with no race goal here it draws nothing.
 *
 *   This week  the weekly challenge, whose action is the page's one
 *              filled button, neutral, unless there is no Circle, when
 *              Start a circle is; then the joined challenges, each with
 *              the medal it is working toward and its progress.
 *   Circles    the Circles as rows, a live Circle first, each with its
 *              next step, ended ones folded; with none, the start-or-join
 *              card alone.
 *   Discover   races and Spaces, then the challenges not joined.
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
  within,
} from "@testing-library/react";
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
vi.mock("@/features/challenges/myWeekLifts", () => ({
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
        uid="me"
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

const FILLED =
  /(^|\s)bg-(primary-strong|running-fill|nutrition-fill|foreground)(\s|$)/;
const filledButtons = () =>
  screen
    .getAllByRole("button")
    .filter((b) => FILLED.test(b.className))
    .map((b) => b.getAttribute("aria-label") ?? b.textContent);

describe("the Together page's order", () => {
  it("is This week, then Circles, then Discover", async () => {
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
    ).toEqual(["This week", "Circles", "Discover"]);

    const week = screen.getByRole("region", { name: "This week" });
    const weekly = within(week).getByRole("button", {
      name: "Join weekly challenge",
    });
    const joined = await within(week).findByRole("list", {
      name: "Your challenges",
    });
    expect(before(weekly, joined)).toBe(true);

    const circles = screen.getByRole("region", { name: "Circles" });
    expect(
      within(circles).getByRole("list", { name: "Your circles" })
    ).toBeInTheDocument();

    const discover = screen.getByRole("region", { name: "Discover" });
    const toJoin = within(discover).getByRole("list", {
      name: "Challenges to join",
    });
    expect(within(toJoin).getByText("September Mileage")).toBeInTheDocument();
    // The pictures first: Spaces lead Discover, the list follows.
    expect(
      before(within(discover).getByRole("heading", { name: "Spaces" }), toJoin)
    ).toBe(true);
  });

  it("leads the Circles with a live one, ahead of one still waiting on its invite", async () => {
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

describe("This week", () => {
  it("shows each joined challenge with the medal it is working toward and how far along it is", async () => {
    circlesHook.circles = [circle("c1", "Sunday long runs", 3)];
    seedFirestore({
      [`challenges/${MONTH_ID}/participants/me`]: {
        currentValue: 3,
        tierAchieved: null,
        joinedAt: Timestamp.fromDate(new Date("2026-09-02T09:00:00Z")),
      },
    });
    await openTogether();
    const week = screen.getByRole("region", { name: "This week" });
    const joined = await within(week).findByRole("list", {
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
    expect(row.querySelector("[data-medal-tier]")).toHaveAttribute(
      "data-medal-tier",
      "bronze"
    );
  });

  it("shows the next tier's medal once a tier is reached", async () => {
    seedFirestore({
      [`challenges/${MONTH_ID}/participants/me`]: {
        currentValue: 9,
        tierAchieved: "bronze",
        joinedAt: Timestamp.fromDate(new Date("2026-09-02T09:00:00Z")),
      },
    });
    await openTogether();
    const joined = await screen.findByRole("list", { name: "Your challenges" });
    expect(joined.querySelector("[data-medal-tier]")).toHaveAttribute(
      "data-medal-tier",
      "silver"
    );
  });

  it("gives a challenge to join the medal its first tier wins", async () => {
    await openTogether();
    const toJoin = screen.getByRole("list", { name: "Challenges to join" });
    const row = within(toJoin)
      .getByText("September Active Days")
      .closest("li")!;
    expect(row.querySelector("[data-medal-tier]")).toHaveAttribute(
      "data-medal-tier",
      "bronze"
    );
  });
});

describe("Circles", () => {
  it("gives a circle of one its next step, Invite someone, and says nothing of its size", async () => {
    circlesHook.circles = [circle("solo", "Hear", 1)];
    await openTogether();
    const row = within(
      screen.getByRole("list", { name: "Your circles" })
    ).getByRole("listitem");
    expect(
      within(row).getByRole("button", { name: "Invite someone" })
    ).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /check in/i })).toBeNull();
    // "1 member" only says the room is empty.
    expect(row.textContent).not.toMatch(/member/);
  });

  it("says a Circle's size from a pair", async () => {
    circlesHook.circles = [circle("pair", "Two of us", 2)];
    await openTogether();
    const row = within(
      screen.getByRole("list", { name: "Your circles" })
    ).getByRole("listitem");
    expect(row.textContent).toContain("2 members");
  });

  it("folds ended Circles under one row, and opens them", async () => {
    const ended = circle("old", "Spring block", 3);
    ended.space.active = false;
    circlesHook.circles = [circle("live", "Sunday long runs", 3), ended];
    await openTogether();
    const list = () => screen.getByRole("list", { name: "Your circles" });
    expect(within(list()).getAllByRole("listitem")).toHaveLength(1);
    const fold = screen.getByRole("button", { name: /Ended circles/ });
    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(fold.textContent).toContain("· 1");
    fireEvent.click(fold);
    const rows = within(list()).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[1].textContent).toContain("Spring block");
    expect(
      screen.getByRole("button", { name: /Hide ended circles/ })
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("is the start-or-join card alone with no Circle", async () => {
    await openTogether();
    const circles = screen.getByRole("region", { name: "Circles" });
    expect(
      within(circles).getByText("Train with a few friends")
    ).toBeInTheDocument();
    expect(within(circles).queryAllByRole("list")).toHaveLength(0);
    expect(
      within(circles)
        .getAllByRole("button")
        .map((b) => b.textContent)
    ).toEqual(["Start a circle", "Join with code"]);
  });
});

/** The neutral fill, white on dark (§0 rule 12). */
const NEUTRAL = /(^|\s)bg-foreground(\s|$)/;

describe("the page's one filled button", () => {
  it("is the weekly challenge's Join once there is a Circle, and neutral", async () => {
    // A live Circle's check-in is a quiet step on its row, not a second
    // filled button.
    circlesHook.circles = [
      circle("live", "Sunday long runs", 3),
      circle("solo", "Hear", 1),
    ];
    await openTogether();
    expect(filledButtons()).toEqual(["Join weekly challenge"]);
    expect(
      screen.getByRole("button", { name: "Join weekly challenge" }).className
    ).toMatch(NEUTRAL);
  });

  it("is Start a circle while there is no Circle, and neutral", async () => {
    await openTogether();
    expect(filledButtons()).toEqual(["Start a circle"]);
    expect(
      screen.getByRole("button", { name: "Start a circle" }).className
    ).toMatch(NEUTRAL);
  });
});
