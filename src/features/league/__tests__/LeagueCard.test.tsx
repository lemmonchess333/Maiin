/**
 * The weekly league's card on Social (Soc15 call 3), in each of its four
 * states, from what the server wrote: not joined (what joining shows and
 * to whom, and Join), locked ("3 so far", and no count under three), waiting for Monday, and in a
 * group (tier, place, points, sessions against the plan, "Ends Sunday").
 * Joining goes through the callable; a restricted account is told why it
 * cannot. Firestore runs on the one fake (ADR-0009); dates come from the
 * clock.
 *
 * Someone who has not joined is offered a league only once Tropos has
 * enough people training (App1 Q6): below that the card draws nothing and
 * reads no league; someone who joined keeps theirs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const H = vi.hoisted(() => ({
  profile: {} as Record<string, unknown>,
  restricted: false,
  call: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("firebase/functions", () => ({
  httpsCallable: (_f: unknown, name: string) => (data: unknown) =>
    H.call(name, data),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: H.profile, refreshProfile: H.refresh }),
  useUid: () => "me",
}));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: H.restricted }),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import { Timestamp } from "firebase/firestore";
import LeagueCard from "../LeagueCard";
import {
  failNextFirestore,
  readsAt,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";
import { localWeekKey } from "@/lib/dateHelpers";
import { communityGoalIds } from "@/lib/enoughPeople";
import { endsLine } from "../league";

/** Twelve people ran on Tropos this month: enough for a league. */
const ENOUGH_PEOPLE = {
  [`challenges/${communityGoalIds(new Date())[0]}`]: { collectiveRunners: 12 },
};

const WEEK = localWeekKey(new Date());
const at = (minutes: number) =>
  Timestamp.fromMillis(Date.now() - minutes * 60_000);

function renderCard() {
  return render(
    <MemoryRouter>
      <LeagueCard uid="me" />
    </MemoryRouter>
  );
}

beforeEach(() => {
  resetFirestore();
  H.profile = { uid: "me" };
  H.restricted = false;
  H.call.mockReset().mockResolvedValue({ data: { join: true, joined: 4 } });
  H.refresh.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("not joined", () => {
  beforeEach(() => seedFirestore(ENOUGH_PEOPLE));

  it("says what a league is, what joining shows and to whom, and offers Join", async () => {
    seedFirestore({
      "leagueStatus/current": { joined: 3, needed: 10, open: false },
    });
    renderCard();
    expect(
      await screen.findByRole("heading", { name: "Weekly leagues" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Your first name, photo and weekly points show to the people in your group/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("Leagues open when 10 people have joined. 3 so far.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Join the league" })
    ).toBeInTheDocument();
  });

  it("Join calls the server, then reads the profile and the league again", async () => {
    seedFirestore({
      "leagueStatus/current": { joined: 3, needed: 10, open: false },
    });
    renderCard();
    fireEvent.click(
      await screen.findByRole("button", { name: "Join the league" })
    );
    await waitFor(() =>
      expect(H.call).toHaveBeenCalledWith("setLeagueSharing", { join: true })
    );
    await waitFor(() => expect(H.refresh).toHaveBeenCalledTimes(1));
  });

  it("a restricted account is told why, with no Join", async () => {
    H.restricted = true;
    renderCard();
    expect(
      await screen.findByText("Your account is restricted")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Join the league" })
    ).toBeNull();
  });
});

describe("at small numbers", () => {
  it("draws nothing for someone who has not joined, and reads no league", async () => {
    seedFirestore({
      "leagueStatus/current": { joined: 3, needed: 10, open: false },
      [`challenges/${communityGoalIds(new Date())[0]}`]: {
        collectiveRunners: 9,
      },
    });
    const { container } = renderCard();
    // Anchor: the count of people has been read and has settled.
    await waitFor(() =>
      expect(readsAt("leagueStatus/current")).toHaveLength(1)
    );
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    expect(readsAt("leagueMembers/me")).toHaveLength(0);
  });

  it("keeps the card of someone who joined", async () => {
    H.profile = { uid: "me", leagueOptIn: true };
    seedFirestore({
      "leagueStatus/current": { joined: 3, needed: 10, open: false },
      "leagueMembers/me": { tier: "bronze", groupId: null, weekKey: null },
    });
    renderCard();
    expect(
      await screen.findByRole("heading", { name: "Weekly league" })
    ).toBeInTheDocument();
  });
});

describe("joined", () => {
  beforeEach(() => {
    H.profile = { uid: "me", leagueOptIn: true };
  });

  it("locked: says how many have joined, from the server's figure", async () => {
    seedFirestore({
      "leagueStatus/current": { joined: 3, needed: 10, open: false },
      "leagueMembers/me": { tier: "bronze", groupId: null, weekKey: null },
    });
    renderCard();
    expect(
      await screen.findByText(
        "Leagues open when 10 people have joined. 3 so far."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "People who have joined" })
    ).toHaveAttribute("aria-valuenow", "3");
    expect(
      screen.queryByRole("button", { name: "Join the league" })
    ).toBeNull();
    // A league that has not opened is the Weekly league, not one they are in.
    expect(
      screen.getByRole("heading", { name: "Weekly league" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/You.re in the league/)).toBeNull();
  });

  it("locked: names no count and draws no bar under three", async () => {
    seedFirestore({
      "leagueStatus/current": { joined: 1, needed: 10, open: false },
      "leagueMembers/me": { tier: "bronze", groupId: null, weekKey: null },
    });
    renderCard();
    expect(
      await screen.findByText("Leagues open when 10 people have joined.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("progressbar", { name: "People who have joined" })
    ).toBeNull();
    expect(screen.queryByText(/so far/)).toBeNull();
  });

  it("waiting: the league is open and their group starts on Monday", async () => {
    seedFirestore({
      "leagueStatus/current": {
        joined: 40,
        needed: 10,
        open: true,
        weekKey: WEEK,
      },
      "leagueMembers/me": { tier: "silver", groupId: null, weekKey: null },
    });
    renderCard();
    expect(
      await screen.findByRole("heading", { name: "Silver league" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("You’re in. Your group starts on Monday.")
    ).toBeInTheDocument();
  });

  it("in a group: tier, place, points, sessions against the plan and the week's end", async () => {
    const seed: Record<string, Record<string, unknown>> = {
      "leagueStatus/current": {
        joined: 40,
        needed: 10,
        open: true,
        weekKey: WEEK,
      },
      "leagueMembers/me": { tier: "gold", groupId: "g1", weekKey: WEEK },
      "leagueGroups/g1/standings/me": {
        uid: "me",
        name: "Me",
        tier: "gold",
        points: 75,
        done: 3,
        planned: 4,
        reachedAt: at(30),
      },
    };
    // Seventeen others: three ahead of me, fourteen behind.
    for (let i = 0; i < 17; i++) {
      seed[`leagueGroups/g1/standings/p${i}`] = {
        uid: `p${i}`,
        name: `P${i}`,
        tier: "gold",
        points: i < 3 ? 100 : 25,
        done: i < 3 ? 4 : 1,
        planned: 4,
        reachedAt: at(60),
      };
    }
    seedFirestore(seed);
    renderCard();
    const card = await screen.findByTestId("league-card");
    expect(card).toHaveAttribute("href", "/league");
    expect(card).toHaveAccessibleName(
      "Gold league: 4th of 18, 75 points, 3 of 4 sessions. " +
        `${endsLine(WEEK)}. See the league`
    );
    expect(card.textContent).toContain("Gold league");
    expect(card.textContent).toContain("4th of 18");
    expect(card.textContent).toContain("3 of 4 sessions");
    expect(card.textContent).toMatch(/Ends (Sunday|tonight)/);
  });
});

describe("a read that fails", () => {
  it("says so, with Try again", async () => {
    H.profile = { uid: "me", leagueOptIn: true };
    failNextFirestore("getDoc", { path: "leagueMembers/me" });
    renderCard();
    expect(
      await screen.findByText("Couldn’t load your league.")
    ).toBeInTheDocument();
    expect(unfiredFailures()).toEqual([]);
    expect(
      screen.getByRole("button", { name: "Try again" })
    ).toBeInTheDocument();
  });
});
