/**
 * The weekly card belongs to the account it was built for.
 *
 * The person's own count is stamped with the uid it was read for, and the
 * challenge's leaders are drawn only for someone whose own place in the
 * challenge has been read. Before the stamp, the count's effect cleared
 * nothing on an account switch, so another account's card was built from
 * the previous account's week until its own read landed.
 *
 * Until 11 November 2026 the rows under the card were the friends board
 * (Trim1 call 3(a)); they are the weekly challenge's own leaders now, and
 * the same guarantee is pinned for them.
 *
 * The app remounts the whole signed-in tree per uid (AuthSessionBoundary);
 * this pins the section's own guarantee, held without that help.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

const h = vi.hoisted(() => ({
  user: { uid: "acct-a" } as { uid: string },
  lifts: {} as Record<string, () => Promise<number>>,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: h.user, profile: { displayName: "Me" } }),
  useUid: () => h.user.uid,
}));
vi.mock("../myWeekLifts", () => ({
  countMyWeekLifts: (uid: string) => h.lifts[uid](),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { ChallengeList } from "../ChallengeList";
import { Timestamp } from "firebase/firestore";
import {
  flushSnapshots,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";

const ID = "weekly-2026-09-07";

const list = () => (
  <MemoryRouter>
    <ChallengeList />
  </MemoryRouter>
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
  resetFirestore();
  h.user = { uid: "acct-a" };
  const joinedAt = Timestamp.fromDate(new Date("2026-09-07T08:00:00Z"));
  seedFirestore({
    ["challenges/" + ID]: {
      name: "Weekly Warrior",
      description: "Train twice this week",
      type: "weekly",
      metric: "workout_count",
      tiers: { bronze: 2, silver: 4, gold: 6 },
      startDate: Timestamp.fromDate(new Date("2026-09-07T00:00:00Z")),
      endDate: Timestamp.fromDate(new Date("2026-09-14T00:00:00Z")),
      participantCount: 2,
    },
    // Account A is in the challenge with one session; someone else leads.
    ["challenges/" + ID + "/participants/acct-a"]: {
      uid: "acct-a",
      displayName: "Me",
      currentValue: 1,
      tierAchieved: null,
      joinedAt,
    },
    ["challenges/" + ID + "/participants/leader"]: {
      uid: "leader",
      displayName: "Leader Of The Week",
      currentValue: 3,
      tierAchieved: "bronze",
      joinedAt,
    },
  });
  h.lifts = {
    "acct-a": async () => 1,
    // The next account's own count never lands: anything on its card
    // about a week could only have come from the previous account.
    "acct-b": () => new Promise(() => {}),
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ChallengeList — the weekly card across an account switch", () => {
  it("another account never reads the previous account's week or place", async () => {
    const view = render(list());
    await flushSnapshots();
    // POSITIVE anchor: account A's own count drives its card, and the
    // challenge's leaders are on screen with A among them.
    expect(await screen.findByText("You’re on the board")).toBeInTheDocument();
    const leaders = await screen.findByRole("list", {
      name: "Leading this week",
    });
    expect(within(leaders).getByText("Leader Of The Week")).toBeInTheDocument();
    expect(within(leaders).getByText("You")).toBeInTheDocument();

    h.user = { uid: "acct-b" };
    view.rerender(list());
    await flushSnapshots();

    // B has not joined and its own count has not landed: the card is the
    // challenge's offer, with no count and no place carried over.
    expect(
      await screen.findByRole("button", { name: "Join weekly challenge" })
    ).toBeInTheDocument();
    expect(screen.queryByText("You’re on the board")).toBeNull();
    expect(screen.queryByText("1 of 2 sessions this week.")).toBeNull();
    expect(
      screen.queryByRole("list", { name: "Leading this week" })
    ).toBeNull();
    expect(screen.queryByText("You")).toBeNull();
  });
});
