/**
 * A days challenge that needs more training days than it has left
 * (owner's recording, 23 Nov 2026: "Train on 8 days this month" offered
 * with a week to go): Discover does not offer it, and a joined one keeps
 * its progress with no countdown. Driven through the real hooks on the one
 * Firestore fake (ADR-0009).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
const h = vi.hoisted(() => ({ user: { uid: "reach-member" } }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: h.user, profile: { displayName: "Reach" } }),
  useUid: () => h.user.uid,
}));
vi.mock("../myWeekLifts", () => ({ countMyWeekLifts: async () => 0 }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false, loading: false }),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { ChallengeList } from "../ChallengeList";
import { Timestamp } from "firebase/firestore";
import {
  flushSnapshots,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";

const DAYS = "featured-monthly-2026-11-01";
const KM = "monthly-2026-11-01";
const monthly = (name: string, metric: string, bronze: number) => ({
  name,
  description: "",
  type: "monthly",
  metric,
  icon: "calendar-days",
  tiers: { bronze, silver: bronze * 2, gold: bronze * 3 },
  startDate: Timestamp.fromDate(new Date("2026-11-01T00:00:00Z")),
  endDate: Timestamp.fromDate(new Date("2026-12-01T00:00:00Z")),
  participantCount: 14,
});
/** A lift saved on each of these November days. */
const trained = (...days: number[]) =>
  Object.fromEntries(
    days.map((d) => [
      `users/reach-member/workouts/w${d}`,
      { date: `2026-11-${String(d).padStart(2, "0")}`, exercises: [] },
    ])
  );

beforeEach(() => {
  /* 27 Nov: four days left, today included, on every clock the suite runs
     under (Kiritimati's is the 28th, three). The goal is 8 days. */
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T12:00:00Z"));
  resetFirestore();
  seedFirestore({
    "users/reach-member": { displayName: "Reach" },
    [`challenges/${DAYS}`]: monthly("November Active Days", "active_days", 8),
    // A distance goal is never out of reach: a long run can do it.
    [`challenges/${KM}`]: monthly("November Mileage", "total_km", 50),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function openList() {
  render(
    <MemoryRouter>
      <ChallengeList />
    </MemoryRouter>
  );
  await flushSnapshots();
  return screen.findByRole("list", { name: "Challenges to join" });
}

describe("Discover leaves out a days challenge out of reach", () => {
  it("offers it while the days trained so far leave it in reach", async () => {
    seedFirestore(trained(3, 6, 10, 13, 17));
    const list = await openList();
    await flushSnapshots();
    // Five days trained, three needed, three or four left.
    expect(within(list).getByText("November Active Days")).toBeInTheDocument();
  });

  it("does not offer it once the days needed outnumber the days left", async () => {
    seedFirestore(trained(3, 6));
    const list = await openList();
    await flushSnapshots();
    // Anchored on the distance goal, which stays.
    expect(within(list).getByText("November Mileage")).toBeInTheDocument();
    expect(within(list).queryByText("November Active Days")).toBeNull();
  });
});

describe("a joined days challenge out of reach", () => {
  it("keeps its progress and says so in place of the countdown", async () => {
    seedFirestore({
      [`challenges/${DAYS}/participants/reach-member`]: {
        currentValue: 3,
        tierAchieved: null,
        joinedAt: Timestamp.fromDate(new Date("2026-11-02T08:00:00Z")),
      },
      ...trained(3, 6, 10),
    });
    render(
      <MemoryRouter>
        <ChallengeList />
      </MemoryRouter>
    );
    await flushSnapshots();
    const mine = await screen.findByRole("list", { name: "Your challenges" });
    await flushSnapshots();
    expect(
      await within(mine).findByText(
        (_, el) =>
          el?.tagName === "P" &&
          el.textContent === "3 of 8 days · Not enough days left"
      )
    ).toBeInTheDocument();
    // No countdown: "3 days left" is gone from the row.
    expect(mine.textContent).not.toMatch(/\d+ days? left/);
  });
});
