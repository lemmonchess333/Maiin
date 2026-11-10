/**
 * Together's race hero (Soc16): the person's race, leading the page while
 * they train for it. It took the plan group card's place, and keeps its
 * rules.
 *
 * Driven against the Firestore fake, so the count is read the way the app
 * reads it (`raceCohorts/{spaceId}`). Pinned:
 *   - the race's name, the weeks to go, its date and place;
 *   - the group's line at a count of 3 and 12, the viewer counted in it,
 *     and none at 1 or 2, with no count, or when the read fails;
 *   - the hero draws at once and the group's line joins it once read;
 *   - a race already past, last edition's goal and no goal show nothing,
 *     and read no count;
 *   - the hero opens the race's space;
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

import RaceHero from "../RaceHero";
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

function renderHero() {
  return render(
    <MemoryRouter>
      <RaceHero />
    </MemoryRouter>
  );
}

const hero = () => screen.findByTestId("race-hero");
/** The group's line, once the count has been read. */
const groupLine = () => screen.queryByText(/on Tropos are training for it/);

beforeEach(() => {
  resetFirestore();
  h.raceGoal = null;
  h.overrides = {};
});

afterEach(() => cleanup());

describe("the race hero", () => {
  it("leads with the race's name, the weeks to go and its date and place, and opens its space", async () => {
    trainingFor(63);
    renderHero();
    const link = await hero();
    expect(link).toHaveAttribute("href", `/space/${MANCHESTER}`);
    expect(link.textContent).toContain("Your race · 9 weeks to go");
    expect(
      screen.getByText("Manchester Marathon", { selector: "p" })
    ).toBeInTheDocument();
    expect(link.textContent).toContain("Manchester");
  });

  it.each([
    [12, "You and 11 others on Tropos are training for it"],
    [3, "You and 2 others on Tropos are training for it"],
  ])("at a count of %i says %j", async (count, line) => {
    trainingFor(63);
    seedFirestore({ [COHORT]: { count, updatedAt: new Date() } });
    renderHero();
    await hero();
    await waitFor(() => expect(groupLine()?.textContent).toBe(line));
  });

  it.each([1, 2])("at a count of %i names no group", async (count) => {
    trainingFor(63);
    seedFirestore({ [COHORT]: { count, updatedAt: new Date() } });
    renderHero();
    await hero();
    await waitFor(() => expect(readsAt(COHORT)).toHaveLength(1));
    expect(groupLine()).toBeNull();
  });

  it("names no group before the race has a count", async () => {
    trainingFor(63);
    renderHero();
    await hero();
    await waitFor(() => expect(readsAt(COHORT)).toHaveLength(1));
    expect(groupLine()).toBeNull();
  });

  it("names no group when the count cannot be read", async () => {
    trainingFor(63);
    seedFirestore({ [COHORT]: { count: 12, updatedAt: new Date() } });
    failNextFirestore("getDoc", { path: COHORT });
    renderHero();
    await hero();
    await waitFor(() => expect(unfiredFailures()).toEqual([]));
    expect(groupLine()).toBeNull();
  });

  it("draws at once, and the group's line joins it once read", async () => {
    trainingFor(63);
    seedFirestore({ [COHORT]: { count: 12, updatedAt: new Date() } });
    deferReads();
    renderHero();
    expect(screen.getByTestId("race-hero").textContent).toContain(
      "9 weeks to go"
    );
    expect(groupLine()).toBeNull();
    await waitFor(() => expect(releaseRead()).toBe(true));
    await waitFor(() => expect(groupLine()).not.toBeNull());
  });

  it("counts the weeks from the viewer's own today, across a clock change", async () => {
    // Thirty weeks always spans one of Auckland's clock changes.
    trainingFor(210);
    renderHero();
    expect((await hero()).textContent).toContain("30 weeks to go");
  });

  it("says Race week inside the last seven days, and 1 week before them", async () => {
    trainingFor(6);
    const { unmount } = renderHero();
    expect((await hero()).textContent).toContain("Your race · Race week");
    unmount();
    trainingFor(7);
    renderHero();
    expect((await hero()).textContent).toContain("1 week to go");
  });

  it("shows nothing, and reads no count, once the race has passed", async () => {
    seedFirestore({ [COHORT]: { count: 12, updatedAt: new Date() } });
    trainingFor(-1);
    const { container, unmount } = renderHero();
    expect(container).toBeEmptyDOMElement();
    expect(readsAt(COHORT)).toHaveLength(0);
    unmount();
    // The same harness draws the hero for a race ahead: the empty render
    // above was the race's date, not a hero that cannot draw.
    trainingFor(1);
    renderHero();
    await hero();
    await waitFor(() => expect(groupLine()).not.toBeNull());
  });

  it("shows nothing for last edition's goal, even once the race has a new date", async () => {
    seedFirestore({ [COHORT]: { count: 12, updatedAt: new Date() } });
    trainingFor(-20);
    h.overrides = { [MANCHESTER]: { dateKey: inDays(300) } };
    const { container } = renderHero();
    expect(container).toBeEmptyDOMElement();
    expect(readsAt(COHORT)).toHaveLength(0);
    // Picked again for the new date, it is that race's hero.
    cleanup();
    trainingFor(300);
    renderHero();
    expect((await hero()).textContent).toContain("Manchester Marathon");
  });

  it("shows nothing without a goal bound to a race space", async () => {
    h.raceGoal = { distance: "10k", targetDate: inDays(40) };
    const { container } = renderHero();
    expect(container).toBeEmptyDOMElement();
    cleanup();
    h.raceGoal = null;
    expect(renderHero().container).toBeEmptyDOMElement();
    expect(readsAt(COHORT)).toHaveLength(0);
    cleanup();
    trainingFor(40);
    renderHero();
    expect((await hero()).textContent).toContain("5 weeks to go");
  });
});
