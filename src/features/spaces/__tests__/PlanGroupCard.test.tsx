/**
 * Your plan group on Social (Soc15): the card in Together's This week.
 *
 * Driven against the Firestore fake, so the count is read the way the app
 * reads it (`raceCohorts/{spaceId}`). Pinned:
 *   - the sentence at a count of 1, 2, 3 and 12, the viewer counted in it;
 *   - no count, or a read that fails, says only what is true of the
 *     viewer, never a number;
 *   - a race already past, last edition's goal and no goal show nothing,
 *     and read no count;
 *   - the card opens the race's space;
 *   - the weeks are counted from the viewer's own today (CI runs this in
 *     Kiritimati, Midway and Auckland, and at +90 days).
 *
 * Every date is derived from the clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
const h = vi.hoisted(() => ({
  raceGoal: null as Record<string, unknown> | null,
  overrides: {} as Record<string, object>,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "me" },
    profile: { uid: "me", displayName: "Sam", raceGoal: h.raceGoal },
  }),
}));
vi.mock("../raceEventOverrides", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../raceEventOverrides")>()),
  useRaceEventOverrides: () => h.overrides,
}));

import PlanGroupCard from "../PlanGroupCard";
import {
  deferReads,
  failNextFirestore,
  readsAt,
  releaseRead,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

const MANCHESTER = "manchester-marathon";
const COHORT = `raceCohorts/${MANCHESTER}`;

/** A local date key `days` from today. */
const inDays = (days: number) =>
  localDateString(addLocalDays(new Date(), days));

/** The viewer's goal and the race's date, both `days` from today. */
function trainingFor(days: number) {
  h.raceGoal = {
    distance: "marathon",
    targetDate: inDays(days),
    eventName: "Manchester Marathon",
    eventSpaceId: MANCHESTER,
  };
  h.overrides = { [MANCHESTER]: { dateKey: inDays(days) } };
}

function renderCard() {
  return render(
    <MemoryRouter>
      <PlanGroupCard />
    </MemoryRouter>
  );
}

/** The card once its count has been read. */
const card = () => screen.findByTestId("plan-group-card");

beforeEach(() => {
  resetFirestore();
  h.raceGoal = null;
  h.overrides = {};
});

afterEach(() => cleanup());

describe("the plan group card", () => {
  it.each([
    [12, "You and 11 others are training for Manchester Marathon"],
    [3, "You and 2 others are training for Manchester Marathon"],
    [2, "You're training for Manchester Marathon"],
    [1, "You're training for Manchester Marathon"],
  ])("at a count of %i says %j, then the weeks to go", async (count, line) => {
    trainingFor(63);
    seedFirestore({ [COHORT]: { count, updatedAt: new Date() } });
    renderCard();
    const link = await card();
    expect(link.textContent).toBe(`${line} · 9 weeks to go`);
    expect(link).toHaveAttribute("href", `/space/${MANCHESTER}`);
  });

  it("names no number before the race has a count", async () => {
    trainingFor(63);
    renderCard();
    expect((await card()).textContent).toBe(
      "You're training for Manchester Marathon · 9 weeks to go"
    );
    expect(readsAt(COHORT)).toHaveLength(1);
  });

  it("says only what is true of the viewer when the count cannot be read", async () => {
    trainingFor(63);
    seedFirestore({ [COHORT]: { count: 12, updatedAt: new Date() } });
    failNextFirestore("getDoc", { path: COHORT });
    renderCard();
    expect((await card()).textContent).toBe(
      "You're training for Manchester Marathon · 9 weeks to go"
    );
    expect(unfiredFailures()).toEqual([]);
  });

  it("holds the card's place while the count is read, then fills it", async () => {
    trainingFor(63);
    seedFirestore({ [COHORT]: { count: 12, updatedAt: new Date() } });
    deferReads();
    renderCard();
    expect(screen.getByTestId("plan-group-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-group-card")).toBeNull();
    await waitFor(() => expect(releaseRead()).toBe(true));
    expect((await card()).textContent).toContain("You and 11 others");
    expect(screen.queryByTestId("plan-group-loading")).toBeNull();
  });

  it("counts the weeks from the viewer's own today, across a clock change", async () => {
    // Thirty weeks always spans one of Auckland's clock changes.
    trainingFor(210);
    seedFirestore({ [COHORT]: { count: 12, updatedAt: new Date() } });
    renderCard();
    expect((await card()).textContent).toContain("· 30 weeks to go");
  });

  it("says Race week inside the last seven days, and 1 week before them", async () => {
    trainingFor(6);
    const { unmount } = renderCard();
    expect((await card()).textContent).toContain("· Race week");
    unmount();
    trainingFor(7);
    renderCard();
    expect((await card()).textContent).toContain("· 1 week to go");
  });

  it("shows nothing, and reads no count, once the race has passed", async () => {
    seedFirestore({ [COHORT]: { count: 12, updatedAt: new Date() } });
    trainingFor(-1);
    const { container, unmount } = renderCard();
    expect(container).toBeEmptyDOMElement();
    unmount();
    // The same harness shows the card for a race ahead: the empty render
    // above was the race's date, not a card that cannot draw.
    trainingFor(1);
    renderCard();
    expect((await card()).textContent).toContain("You and 11 others");
    expect(readsAt(COHORT)).toHaveLength(1);
  });

  it("shows nothing for last edition's goal, even once the race has a new date", async () => {
    seedFirestore({ [COHORT]: { count: 12, updatedAt: new Date() } });
    trainingFor(-20);
    h.overrides = { [MANCHESTER]: { dateKey: inDays(300) } };
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
    expect(readsAt(COHORT)).toHaveLength(0);
    // Picked again for the new date, it is that race's group.
    cleanup();
    trainingFor(300);
    renderCard();
    expect((await card()).textContent).toContain("You and 11 others");
  });

  it("shows nothing without a goal bound to a race space", async () => {
    h.raceGoal = { distance: "10k", targetDate: inDays(40) };
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
    cleanup();
    h.raceGoal = null;
    expect(renderCard().container).toBeEmptyDOMElement();
    expect(readsAt(COHORT)).toHaveLength(0);
    cleanup();
    trainingFor(40);
    renderCard();
    expect((await card()).textContent).toBe(
      "You're training for Manchester Marathon · 5 weeks to go"
    );
  });
});
