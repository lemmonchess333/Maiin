/**
 * Run26 call 4 — a Circle's meet-ups, as a member meets them on Together:
 * the featured Circle's row names its next meet-up, the Circle's sheet
 * lists what is coming up with who is in, "I’m in" and "Can’t make it"
 * answer through the callable, the organiser calls one off after a
 * confirmation, and the plan sheet sends the typed words with one instant
 * and this phone's zone, refusing objectionable words before anything is
 * sent. An ended Circle offers no plan.
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
import type { CircleMeetup } from "@/features/goalSpace/circleMeetups";
import { meetupWhen } from "@/features/goalSpace/circleMeetups";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";

/** Two days from today, as the date input writes it: inside the window a
 *  meet-up may be planned in, whatever the clock says. */
const IN_TWO_DAYS = addLocalDays(new Date(), 2);
const IN_TWO_DAYS_KEY = localDateString(IN_TWO_DAYS);

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
const mockUseGoalSpaces = vi.fn();
vi.mock("@/features/goalSpace/useGoalSpaces", () => ({
  useGoalSpaces: (uid: string | undefined) => mockUseGoalSpaces(uid),
}));
vi.mock("@/components/social/CircleWeeklyFocusSheet", () => ({
  default: () => <div data-testid="focus-sheet" />,
}));

import CirclesSection from "../CirclesSection";

const HOUR = 3_600_000;

function summary({
  active = true,
  ownerId = "owner",
}: { active?: boolean; ownerId?: string } = {}): CircleSummary {
  return {
    space: {
      id: "c1",
      type: "race",
      title: "Spring half",
      visibility: "invite_only",
      ownerId,
      memberCount: 3,
      maxMembers: 8,
      targetDate: null,
      active,
      createdAt: 1,
    },
    inviteCode: null,
    inviteCodeExpiresAt: null,
  };
}

const member = (uid: string, displayName: string) => ({
  uid,
  displayName,
  photoURL: null,
  role: "member" as const,
  joinedAt: 1,
});
const MEMBERS = [
  member("owner", "Olu"),
  member("me", "Me"),
  member("maya", "Maya"),
];

function meetup(over: Partial<CircleMeetup> = {}): CircleMeetup {
  return {
    id: "m1",
    organiserUid: "maya",
    sport: "run",
    title: "Saturday long run",
    place: "Tooting Lido gate",
    note: "Easy pace",
    paceGroups: null,
    repeat: null,
    startsAt: Date.now() + 30 * HOUR,
    timeZone: "Europe/London",
    going: ["maya"],
    createdAt: 1,
    ...over,
  };
}

function hookValue(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    circles: [summary()],
    loadFailed: false,
    reload: vi.fn(),
    createCircle: vi.fn(),
    renewInviteCode: vi.fn(),
    joinCircle: vi.fn(),
    leaveCircle: vi.fn(),
    loadDetail: vi.fn(async () => ({
      members: MEMBERS,
      events: [],
      meetups: [meetup()],
    })),
    publishEvent: vi.fn(),
    setWeeklyFocus: vi.fn(),
    backCheckIn: vi.fn(),
    resolveTarget: vi.fn(),
    planMeetup: vi.fn(async () => ({ ok: true, meetupId: "m-new" })),
    setMeetupGoing: vi.fn(async () => ({ ok: true, going: ["maya", "me"] })),
    cancelMeetup: vi.fn(async () => true),
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

async function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: /Spring half/ }));
  return within(await screen.findByRole("dialog"));
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
beforeEach(() => vi.clearAllMocks());

describe("the featured Circle's row", () => {
  it("names its next meet-up and when it starts", async () => {
    const next = meetup();
    mockUseGoalSpaces.mockReturnValue(hookValue());
    renderSection();
    expect(
      await screen.findByText(meetupWhen(next.startsAt))
    ).toBeInTheDocument();
    expect(screen.getByText(/Saturday long run/)).toBeInTheDocument();
  });
});

describe("the Circle's sheet", () => {
  it("lists what is coming up, and I’m in answers through the callable", async () => {
    const value = hookValue();
    mockUseGoalSpaces.mockReturnValue(value);
    renderSection();
    const sheet = await openSheet();
    expect(await sheet.findByText("Coming up")).toBeInTheDocument();
    const card = sheet.getByTestId("circle-meetup");
    expect(within(card).getByText("Tooting Lido gate")).toBeInTheDocument();
    expect(within(card).getByText("Maya is going")).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "I’m in" }));
    await waitFor(() =>
      expect(value.setMeetupGoing).toHaveBeenCalledWith("c1", "m1", true)
    );
    expect(
      await within(card).findByText("You and Maya are going")
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: "Can’t make it" })
    ).toBeInTheDocument();
  });

  it("lets the organiser call it off after a confirmation", async () => {
    const value = hookValue({
      loadDetail: vi.fn(async () => ({
        members: MEMBERS,
        events: [],
        meetups: [meetup({ organiserUid: "me", going: ["me"] })],
      })),
    });
    mockUseGoalSpaces.mockReturnValue(value);
    renderSection();
    const sheet = await openSheet();
    const card = await sheet.findByTestId("circle-meetup");
    expect(within(card).queryByRole("button", { name: "I’m in" })).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Call it off" }));
    // The card asks first, and Keep it changes nothing.
    fireEvent.click(within(card).getByRole("button", { name: "Keep it" }));
    expect(value.cancelMeetup).not.toHaveBeenCalled();
    fireEvent.click(within(card).getByRole("button", { name: "Call it off" }));
    const confirm = within(
      within(card).getByRole("group", { name: "Call it off?" })
    );
    fireEvent.click(confirm.getByRole("button", { name: "Call it off" }));
    await waitFor(() =>
      expect(value.cancelMeetup).toHaveBeenCalledWith("c1", "m1")
    );
    await waitFor(() =>
      expect(screen.queryByTestId("circle-meetup")).toBeNull()
    );
  });

  it("shows a weekly run's pace groups and that it repeats, and says calling it off ends the repeat", async () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({
        loadDetail: vi.fn(async () => ({
          members: MEMBERS,
          events: [],
          meetups: [
            meetup({
              organiserUid: "me",
              going: ["me"],
              paceGroups: "5:30 and 6:15 /km",
              repeat: "weekly",
            }),
          ],
        })),
      })
    );
    renderSection();
    const sheet = await openSheet();
    const card = await sheet.findByTestId("circle-meetup");
    expect(within(card).getByText(/Every week/)).toBeInTheDocument();
    expect(
      within(card).getByText("Pace groups: 5:30 and 6:15 /km")
    ).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Call it off" }));
    expect(
      within(card).getByText(
        "Call it off? Anyone who’s in will be told, and it won’t repeat."
      )
    ).toBeInTheDocument();
  });

  it("offers no plan in an ended Circle", async () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({
        circles: [summary({ active: false })],
        loadDetail: vi.fn(async () => ({
          members: MEMBERS,
          events: [],
          meetups: [],
        })),
      })
    );
    renderSection();
    // An ended Circle folds under its row (Soc16).
    fireEvent.click(screen.getByRole("button", { name: /Ended circles/ }));
    const sheet = await openSheet();
    await sheet.findByText("Recent");
    expect(sheet.queryByRole("button", { name: "Plan a meet-up" })).toBeNull();
  });
});

describe("planning a meet-up", () => {
  async function openPlan(value: ReturnType<typeof hookValue>) {
    mockUseGoalSpaces.mockReturnValue(value);
    renderSection();
    const sheet = await openSheet();
    fireEvent.click(
      await sheet.findByRole("button", { name: "Plan a meet-up" })
    );
    // The plan sheet loads on demand and opens over the Circle's sheet.
    return within(
      await screen.findByRole("dialog", { name: "Plan a meet-up" })
    );
  }

  function fill(
    plan: ReturnType<typeof within>,
    words: { title: string; place: string }
  ) {
    fireEvent.change(plan.getByLabelText("Meet-up name"), {
      target: { value: words.title },
    });
    fireEvent.change(plan.getByLabelText("Day"), {
      target: { value: IN_TWO_DAYS_KEY },
    });
    fireEvent.change(plan.getByLabelText("Time"), {
      target: { value: "08:00" },
    });
    fireEvent.change(plan.getByLabelText("Where to meet"), {
      target: { value: words.place },
    });
  }

  it("sends the words with one instant and this phone's zone", async () => {
    const value = hookValue();
    const plan = await openPlan(value);
    fill(plan, { title: "Saturday long run", place: "Tooting Lido gate" });
    fireEvent.click(plan.getByRole("button", { name: "Plan it" }));
    await waitFor(() => expect(value.planMeetup).toHaveBeenCalledTimes(1));
    expect(value.planMeetup).toHaveBeenCalledWith("c1", {
      sport: "run",
      title: "Saturday long run",
      place: "Tooting Lido gate",
      note: null,
      paceGroups: null,
      repeat: null,
      startsAt: new Date(
        IN_TWO_DAYS.getFullYear(),
        IN_TWO_DAYS.getMonth(),
        IN_TWO_DAYS.getDate(),
        8,
        0
      ).getTime(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    expect(toastMock.success).toHaveBeenCalledWith("Meet-up planned.");
  });

  it("sends a run's pace groups and Every week (Run27 call 10)", async () => {
    const value = hookValue();
    const plan = await openPlan(value);
    fill(plan, { title: "Saturday long run", place: "Tooting Lido gate" });
    fireEvent.change(plan.getByLabelText("Pace groups"), {
      target: { value: " 5:30 and 6:15 /km " },
    });
    fireEvent.click(plan.getByRole("switch", { name: "Every week" }));
    fireEvent.click(plan.getByRole("button", { name: "Plan it" }));
    await waitFor(() => expect(value.planMeetup).toHaveBeenCalledTimes(1));
    expect(value.planMeetup).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({
        sport: "run",
        paceGroups: "5:30 and 6:15 /km",
        repeat: "weekly",
      })
    );
  });

  it("offers a lift no pace groups, and sends none typed before the switch", async () => {
    const value = hookValue();
    const plan = await openPlan(value);
    fill(plan, { title: "Thursday legs", place: "The gym" });
    fireEvent.change(plan.getByLabelText("Pace groups"), {
      target: { value: "5:30 /km" },
    });
    fireEvent.click(plan.getByRole("radio", { name: "Lift" }));
    expect(plan.queryByLabelText("Pace groups")).toBeNull();
    fireEvent.click(plan.getByRole("button", { name: "Plan it" }));
    await waitFor(() => expect(value.planMeetup).toHaveBeenCalledTimes(1));
    expect(value.planMeetup).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ sport: "lift", paceGroups: null, repeat: null })
    );
  });

  it("refuses objectionable pace groups before anything is sent", async () => {
    const value = hookValue();
    const plan = await openPlan(value);
    fill(plan, { title: "Saturday long run", place: "Tooting Lido gate" });
    fireEvent.change(plan.getByLabelText("Pace groups"), {
      target: { value: "shit pace" },
    });
    fireEvent.click(plan.getByRole("button", { name: "Plan it" }));
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "This meet-up contains objectionable language. Reword it and try again."
      )
    );
    expect(value.planMeetup).not.toHaveBeenCalled();
  });

  it("says what is missing and sends nothing", async () => {
    const value = hookValue();
    const plan = await openPlan(value);
    fireEvent.click(plan.getByRole("button", { name: "Plan it" }));
    expect(await plan.findByRole("alert")).toHaveTextContent("Give it a name.");
    expect(value.planMeetup).not.toHaveBeenCalled();
  });

  it("refuses objectionable words before anything is sent", async () => {
    const value = hookValue();
    const plan = await openPlan(value);
    fill(plan, { title: "Saturday long run", place: "shit corner" });
    fireEvent.click(plan.getByRole("button", { name: "Plan it" }));
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "This meet-up contains objectionable language. Reword it and try again."
      )
    );
    expect(value.planMeetup).not.toHaveBeenCalled();
  });

  it("offers Add to calendar only once you are going (or organising)", async () => {
    mockUseGoalSpaces.mockReturnValue(
      hookValue({
        loadDetail: vi.fn(async () => ({
          members: MEMBERS,
          events: [],
          meetups: [
            meetup({ id: "m-not-in", going: ["maya"] }),
            meetup({
              id: "m-in",
              title: "Sunday recovery",
              going: ["maya", "me"],
            }),
          ],
        })),
      })
    );
    renderSection();
    const sheet = await openSheet();
    const cards = await sheet.findAllByTestId("circle-meetup");
    expect(cards).toHaveLength(2);
    expect(
      within(cards[0]).queryByRole("button", { name: /Add to calendar/i })
    ).not.toBeInTheDocument();
    expect(
      within(cards[1]).getByRole("button", { name: /Add to calendar/i })
    ).toBeInTheDocument();
  });
});
