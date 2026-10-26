import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
const h = vi.hoisted(() => ({
  user: { uid: "weekly-member" },
  profile: { displayName: "Test member" },
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
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
const restriction = vi.hoisted(() => ({ isRestricted: false, loading: false }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => restriction,
}));
vi.mock("@/lib/toast", () => ({
  toast: { error: h.toastError, success: h.toastSuccess },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { ChallengeList } from "../ChallengeList";
import { getTimeRemaining } from "../useChallenges";
import { Timestamp } from "firebase/firestore";
import { group } from "@/test/localeGrouping";
import {
  failNextFirestore,
  flushSnapshots,
  readDoc,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

const ID = "weekly-2026-09-07";
const PATH = "challenges/" + ID + "/participants/weekly-member";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
  resetFirestore();
  h.toastError.mockClear();
  h.toastSuccess.mockClear();
  seedFirestore({
    "users/weekly-member": h.profile,
    ["challenges/" + ID]: {
      name: "Weekly Warrior",
      description: "Train twice this week",
      type: "weekly",
      metric: "workout_count",
      tiers: { bronze: 2, silver: 4, gold: 6 },
      startDate: Timestamp.fromDate(new Date("2026-09-07T00:00:00Z")),
      endDate: Timestamp.fromDate(new Date("2026-09-14T00:00:00Z")),
      participantCount: 0,
    },
  });
});

afterEach(() => {
  cleanup();
  expect(unfiredFailures()).toEqual([]);
  vi.useRealTimers();
});

async function openList() {
  render(
    <MemoryRouter>
      <ChallengeList />
    </MemoryRouter>
  );
  await flushSnapshots();
  return screen.findByRole("button", { name: "Join weekly challenge" });
}

describe("weekly challenge membership", () => {
  it("offers Join without enrolling on mount; joining and leaving update stored membership", async () => {
    const join = await openList();
    expect(readDoc(PATH)).toBeUndefined();
    fireEvent.click(join);
    const leave = await screen.findByRole("button", {
      name: "Leave weekly challenge",
    });
    expect(readDoc(PATH)).toMatchObject({
      displayName: "Test member",
      currentValue: 0,
    });
    // The join says which edition it is and when the next one opens.
    expect(h.toastSuccess).toHaveBeenCalledWith(
      "You're in for this week. Next week's opens on Monday."
    );
    expect(
      screen.getByRole("button", { name: /Start today's session/ })
    ).toBeInTheDocument();
    fireEvent.click(leave);
    await screen.findByRole("button", { name: "Join weekly challenge" });
    expect(readDoc(PATH)).toBeUndefined();
    expect(
      screen.queryByRole("button", { name: "Leave weekly challenge" })
    ).not.toBeInTheDocument();
  });

  it("preserves the unjoined state and permits retry when Join fails", async () => {
    const join = await openList();
    failNextFirestore("setDoc", { path: PATH, code: "permission-denied" });
    fireEvent.click(join);
    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith(
        "Couldn't join the challenge. Try again."
      )
    );
    await waitFor(() => expect(join).toBeEnabled());
    expect(readDoc(PATH)).toBeUndefined();
    expect(h.toastSuccess).not.toHaveBeenCalled();
    fireEvent.click(join);
    await screen.findByRole("button", { name: "Leave weekly challenge" });
    expect(readDoc(PATH)).toBeDefined();
  });

  it("preserves membership and permits retry when Leave fails", async () => {
    const join = await openList();
    fireEvent.click(join);
    const leave = await screen.findByRole("button", {
      name: "Leave weekly challenge",
    });
    failNextFirestore("deleteDoc", { path: PATH, code: "permission-denied" });
    fireEvent.click(leave);
    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith(
        "Couldn't leave the challenge. Try again."
      )
    );
    await waitFor(() => expect(leave).toBeEnabled());
    expect(readDoc(PATH)).toBeDefined();
    fireEvent.click(leave);
    await screen.findByRole("button", { name: "Join weekly challenge" });
    expect(readDoc(PATH)).toBeUndefined();
  });

  it("reads an existing membership on mount: the card offers Leave, not Join", async () => {
    /* Every case above starts unjoined, which is also what an unread
       progress map looks like — so none of them shows the mount-time
       progress read landing. This one does. */
    seedFirestore({
      [PATH]: {
        currentValue: 1,
        tierAchieved: null,
        joinedAt: Timestamp.fromDate(new Date("2026-09-08T09:00:00Z")),
        displayName: "Test member",
      },
    });
    render(
      <MemoryRouter>
        <ChallengeList />
      </MemoryRouter>
    );
    await flushSnapshots();
    expect(
      await screen.findByRole("button", { name: "Leave weekly challenge" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Join weekly challenge" })
    ).toBeNull();
  });
});

describe("the weekly challenge in its last day", () => {
  /* Sunday midday on the person's own clock: the week ends at their
     midnight, so twelve hours are left of a two-session goal. */
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 8, 13, 12, 0, 0));
  });

  it("offers no Join to someone outside it, and says when the next one starts", async () => {
    render(
      <MemoryRouter>
        <ChallengeList />
      </MemoryRouter>
    );
    await flushSnapshots();
    expect(
      await screen.findByText("Ends tonight. The next one starts Monday.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Join weekly challenge" })
    ).toBeNull();
    // The line takes the countdown's place rather than sitting beside it.
    expect(screen.queryByText(/hours? left|min left/)).toBeNull();
  });

  it("still shows a member their week, with the time left", async () => {
    seedFirestore({
      [PATH]: {
        currentValue: 1,
        tierAchieved: null,
        joinedAt: Timestamp.fromDate(new Date("2026-09-08T09:00:00Z")),
        displayName: "Test member",
      },
    });
    render(
      <MemoryRouter>
        <ChallengeList />
      </MemoryRouter>
    );
    await flushSnapshots();
    expect(
      await screen.findByRole("button", { name: "Leave weekly challenge" })
    ).toBeInTheDocument();
    expect(screen.getByText("12 hours left")).toBeInTheDocument();
    expect(screen.queryByText(/^Ends tonight/)).toBeNull();
  });
});

describe("a restricted account (S4e)", () => {
  afterEach(() => {
    restriction.isRestricted = false;
  });

  it("is told why it can't join, and Join enrols nothing", async () => {
    restriction.isRestricted = true;
    const join = await openList();
    expect(screen.getByText("Your account is restricted")).toBeInTheDocument();
    fireEvent.click(join);
    await flushSnapshots();
    expect(readDoc(PATH)).toBeUndefined();
    expect(h.toastError).toHaveBeenCalledWith(
      "Your account is restricted, so you can't do this for now.",
      expect.anything()
    );
  });
});

describe("the featured monthly challenge", () => {
  const FEATURED_ID = "featured-monthly-2026-09-01";
  const CORE_ID = "monthly-2026-09-01";
  const STRENGTH_ID = "strength-monthly-2026-09-01";
  const participantPath = (id: string) =>
    `challenges/${id}/participants/weekly-member`;

  beforeEach(() => {
    const dates = {
      type: "monthly",
      startDate: Timestamp.fromDate(new Date("2026-09-01T00:00:00Z")),
      endDate: Timestamp.fromDate(new Date("2026-10-01T00:00:00Z")),
      participantCount: 0,
    };
    seedFirestore({
      [`challenges/${CORE_ID}`]: {
        ...dates,
        name: "September Mileage",
        description: "Every run adds up",
        metric: "total_km",
        icon: "footprints",
        tiers: { bronze: 10, silver: 25, gold: 50 },
      },
      [`challenges/${STRENGTH_ID}`]: {
        ...dates,
        name: "September Strength Builder",
        description: "Your logged lifting volume",
        metric: "total_volume",
        icon: "dumbbell",
        tiers: { bronze: 5000, silver: 15000, gold: 30000 },
      },
      [`challenges/${FEATURED_ID}`]: {
        ...dates,
        name: "September Active Days",
        description: "Run or lift on different days. Rest days are welcome.",
        metric: "active_days",
        icon: "calendar-days",
        tiers: { bronze: 8, silver: 12, gold: 20 },
      },
    });
  });

  it("shows the featured invitation while the other available goals stay collapsed", async () => {
    await openList();
    expect(
      await screen.findByText("September Active Days")
    ).toBeInTheDocument();
    expect(screen.getByText("Featured this month")).toBeInTheDocument();
    expect(screen.queryByText("September Mileage")).not.toBeInTheDocument();
    expect(
      screen.queryByText("September Strength Builder")
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "See 2 more challenges" })
    );
    expect(await screen.findByText("September Mileage")).toBeInTheDocument();
    expect(screen.getAllByText("September Active Days")).toHaveLength(1);
  });

  it("says the month's time left once, on the featured card", async () => {
    await openList();
    await screen.findByText("September Active Days");
    fireEvent.click(
      screen.getByRole("button", { name: "See 2 more challenges" })
    );
    await screen.findByText("September Mileage");
    // Read as the app reads them, so the figures hold in every time zone.
    const month = getTimeRemaining(
      Timestamp.fromDate(new Date("2026-10-01T00:00:00Z"))
    );
    const week = getTimeRemaining(
      Timestamp.fromDate(new Date("2026-09-14T00:00:00Z"))
    );
    expect(month).not.toBe(week);
    // The week's own countdown, on its card, and the month's once.
    expect(screen.getAllByText(week)).toHaveLength(1);
    expect(screen.getAllByText(month)).toHaveLength(1);
    expect(
      screen.getByText("September Active Days").closest(".rounded-2xl")!
        .textContent
    ).toContain(month);
  });

  it("lists the others as compact rows that say their goal, each with a Join", async () => {
    await openList();
    await screen.findByText("September Active Days");
    fireEvent.click(
      screen.getByRole("button", { name: "See 2 more challenges" })
    );
    const mileage = (await screen.findByText("September Mileage")).closest(
      "li"
    )!;
    expect(mileage.textContent).toContain("Run 10 km this month.");
    expect(mileage.textContent).not.toContain("Every run adds up");
    const strength = screen
      .getByText("September Strength Builder")
      .closest("li")!;
    expect(strength.textContent).toContain(
      `Lift ${group(5000)} kg in total this month.`
    );
    expect(
      screen.getByRole("button", { name: "Join September Mileage" })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Join September Strength Builder" })
    );
    await waitFor(() =>
      expect(readDoc(participantPath(STRENGTH_ID))).toMatchObject({
        currentValue: 0,
      })
    );
    expect(h.toastSuccess).toHaveBeenCalledWith(
      "You're in for September. October's opens on 1 Oct."
    );
    expect(readDoc(participantPath(CORE_ID))).toBeUndefined();
  });

  it("puts a joined featured goal first and leaves other memberships intact", async () => {
    const progress = {
      currentValue: 0,
      tierAchieved: null,
      joinedAt: Timestamp.fromDate(new Date("2026-09-08T09:00:00Z")),
      displayName: "Test member",
    };
    seedFirestore({
      [participantPath(CORE_ID)]: progress,
      [participantPath(STRENGTH_ID)]: progress,
      [participantPath(FEATURED_ID)]: progress,
    });
    await openList();
    await waitFor(() =>
      expect(screen.getByText("Your challenges")).toBeInTheDocument()
    );
    const names = screen
      .getAllByText(/^September /)
      .map((el) => el.textContent);
    expect(names[0]).toBe("September Active Days");
    expect(screen.queryByText("Featured this month")).not.toBeInTheDocument();
    expect(readDoc(participantPath(CORE_ID))).toMatchObject(progress);
    expect(readDoc(participantPath(STRENGTH_ID))).toMatchObject(progress);
  });

  it("moves the featured goal between available and joined without enrolling in core goals", async () => {
    await openList();
    await screen.findByText("September Active Days");
    expect(readDoc(participantPath(FEATURED_ID))).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Join challenge" }));
    await screen.findByText("Your challenges");
    expect(readDoc(participantPath(FEATURED_ID))).toMatchObject({
      currentValue: 0,
    });
    expect(screen.queryByText("Featured this month")).not.toBeInTheDocument();
    expect(h.toastSuccess).toHaveBeenCalledWith(
      "You're in for September. October's opens on 1 Oct."
    );
    expect(
      screen.getByText("September Active Days").closest(".rounded-2xl")!
        .textContent
    ).toContain("Train on 8 days this month.");
    expect(readDoc(participantPath(CORE_ID))).toBeUndefined();
    expect(readDoc(participantPath(STRENGTH_ID))).toBeUndefined();
    expect(readDoc(PATH)).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Leave challenge" }));
    await screen.findByText("Featured this month");
    expect(readDoc(participantPath(FEATURED_ID))).toBeUndefined();
    expect(
      screen.getByRole("button", { name: "See 2 more challenges" })
    ).toBeInTheDocument();
    expect(screen.queryByText("September Mileage")).not.toBeInTheDocument();
  });
});

describe("the section has no standing intro", () => {
  it("leaves the edition rule to the join, not a paragraph above the list", async () => {
    await openList();
    expect(screen.queryByText(/refresh on the 1st/)).toBeNull();
    expect(screen.queryByText(/Join each new edition/)).toBeNull();
  });
});
