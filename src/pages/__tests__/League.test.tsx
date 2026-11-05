/**
 * /league (Soc15 call 3): this week's group of 18 in full, your row picked
 * out, a line under the places that move up and one above the places that
 * move down, the time left in the week, and Leave the league behind a
 * confirmation. Someone blocked either way is left out of the list while
 * the places still count them. Firestore runs on the one fake (ADR-0009);
 * the callable is stubbed; dates come from the clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const H = vi.hoisted(() => ({
  blocked: new Set<string>(),
  profile: {} as Record<string, unknown>,
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
  useUid: () => "me",
  useAuth: () => ({ profile: H.profile, refreshProfile: H.refresh }),
}));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({
    blocked: H.blocked,
    youBlocked: new Set(),
    blockedYou: new Set(),
    ready: true,
    addBlocked: () => {},
    removeBlocked: () => {},
  }),
}));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false }),
}));
vi.mock("@/components/social/BlockAwareAvatar", () => ({
  default: () => null,
}));
vi.mock("@/components/Avatar", () => ({ default: () => null }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import { Timestamp } from "firebase/firestore";
import League from "../League";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { localWeekKey } from "@/lib/dateHelpers";

const WEEK = localWeekKey(new Date());

/**
 * A Gold group of 18: p00 first down to p17 last, one point apart, with
 * "me" at `myRank`.
 */
function group(myRank: number) {
  const seed: Record<string, Record<string, unknown>> = {
    "leagueStatus/current": {
      joined: 60,
      needed: 10,
      open: true,
      weekKey: WEEK,
    },
    "leagueMembers/me": { tier: "gold", groupId: "g1", weekKey: WEEK },
  };
  let others = 0;
  for (let rank = 1; rank <= 18; rank++) {
    const uid =
      rank === myRank ? "me" : `p${String(others++).padStart(2, "0")}`;
    seed[`leagueGroups/g1/standings/${uid}`] = {
      uid,
      name: uid === "me" ? "Me" : uid.toUpperCase(),
      tier: "gold",
      points: 100 - rank,
      done: 3,
      planned: 4,
      reachedAt: Timestamp.fromMillis(Date.now() - rank * 1000),
    };
  }
  return seed;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/league"]}>
      <League />
    </MemoryRouter>
  );
}

const rows = async () => {
  const list = await screen.findByRole("list", {
    name: "Gold league standings",
  });
  return within(list)
    .getAllByRole("listitem")
    .filter((li) => li.getAttribute("role") !== "separator");
};

beforeEach(() => {
  resetFirestore();
  H.blocked = new Set();
  H.profile = { uid: "me", leagueOptIn: true, displayName: "Me Myself" };
  H.call.mockReset().mockResolvedValue({ data: { join: false, joined: 59 } });
  H.refresh.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("the standings", () => {
  it("lists the whole group in order, with the week's end", async () => {
    seedFirestore(group(4));
    renderPage();
    const list = await rows();
    expect(list).toHaveLength(18);
    expect(list[0].textContent).toMatch(/^1P00/);
    expect(
      screen.getByRole("heading", { name: "Gold league" })
    ).toBeInTheDocument();
    expect(screen.getByRole("timer").textContent).toMatch(/^Ends in /);
  });

  it("picks out your row", async () => {
    seedFirestore(group(4));
    renderPage();
    const mine = (await rows()).find((li) => li.getAttribute("aria-current"));
    expect(mine?.textContent).toContain("You");
    expect(mine?.textContent).toMatch(/^4You/);
    expect(mine?.textContent).toContain("3 of 4 sessions");
  });

  it("draws a line under the five who move up, and above the four who move down", async () => {
    seedFirestore(group(3));
    renderPage();
    await rows();
    const list = screen.getByRole("list", { name: "Gold league standings" });
    // The rows and the two lines between them, in order.
    const items = Array.from(list.children);
    const at = (label: string) =>
      items.findIndex((li) => li.getAttribute("aria-label") === label);
    const upLine = at("Top 5 move up a tier");
    const downLine = at("Bottom 4 move down a tier");
    // Five rows, the line, nine rows, the line, four rows.
    expect(upLine).toBe(5);
    expect(downLine).toBe(15);
    expect(items).toHaveLength(20);
    // You, third, are above the line that moves up.
    expect(
      items.findIndex((li) => li.getAttribute("aria-current"))
    ).toBeLessThan(upLine);
  });

  it("puts you below the line when you are in the bottom four", async () => {
    seedFirestore(group(16));
    renderPage();
    await rows();
    const items = Array.from(
      screen.getByRole("list", { name: "Gold league standings" }).children
    );
    const downLine = items.findIndex(
      (li) => li.getAttribute("aria-label") === "Bottom 4 move down a tier"
    );
    expect(
      items.findIndex((li) => li.getAttribute("aria-current"))
    ).toBeGreaterThan(downLine);
  });

  it("leaves out someone blocked either way, and the places still count them", async () => {
    H.blocked = new Set(["p01"]);
    seedFirestore(group(4));
    renderPage();
    const list = await rows();
    expect(list).toHaveLength(17);
    expect(list.some((li) => li.textContent?.includes("P01"))).toBe(false);
    // p01 was second: the numbering goes 1, 3.
    expect(list[1].textContent).toMatch(/^3/);
  });
});

describe("Leave the league", () => {
  it("asks first, then leaves through the server", async () => {
    seedFirestore(group(4));
    renderPage();
    await rows();
    fireEvent.click(screen.getByRole("button", { name: "Leave the league" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Leave the league?")).toBeInTheDocument();
    expect(H.call).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Leave" }));
    await waitFor(() =>
      expect(H.call).toHaveBeenCalledWith("setLeagueSharing", { join: false })
    );
    await waitFor(() => expect(H.refresh).toHaveBeenCalledTimes(1));
  });

  it("Cancel leaves you in", async () => {
    seedFirestore(group(4));
    renderPage();
    await rows();
    fireEvent.click(screen.getByRole("button", { name: "Leave the league" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(H.call).not.toHaveBeenCalled();
  });
});

describe("before a group", () => {
  it("someone who has not joined is offered Join, with what it shows", async () => {
    H.profile = { uid: "me" };
    seedFirestore({
      "leagueStatus/current": { joined: 4, needed: 10, open: false },
    });
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Weekly leagues" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Join the league" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Leave the league" })
    ).toBeNull();
  });

  it("someone waiting for the league to open is told how many have joined", async () => {
    seedFirestore({
      "leagueStatus/current": { joined: 4, needed: 10, open: false },
      "leagueMembers/me": { tier: "bronze", groupId: null, weekKey: null },
    });
    renderPage();
    expect(
      await screen.findByText(
        "Leagues open when 10 people have joined. 4 so far."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Leave the league" })
    ).toBeInTheDocument();
  });
});
