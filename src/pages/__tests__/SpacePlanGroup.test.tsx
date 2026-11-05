/**
 * The race space's hero and your plan group (Soc15).
 *
 * On the race your own goal is bound to, while it is ahead, the hero says
 * how many people on Tropos are training for it, in the third person: "12
 * people on Tropos are training for this race". Under three, the viewer
 * included, it says nothing about them. Anyone else's view of the space
 * reads no count at all.
 *
 * Against the Firestore fake. Every date is derived from the clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false, loading: false }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
/* The signed-in viewer, one object for the whole test as AuthProvider
   keeps it: the race identity switch reads the public profile again
   whenever `user` changes, so a new object each render reads forever. */
const h = vi.hoisted(() => ({
  user: { uid: "viewer" },
  profile: {
    displayName: "Sam",
    uid: "viewer",
    raceGoal: null as Record<string, unknown> | null,
  },
  overrides: {} as Record<string, object>,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: h.user, profile: h.profile }),
  useUid: () => "viewer",
}));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({ blocked: new Set(), addBlocked: vi.fn() }),
}));
vi.mock("@/features/spaces/useRecentSessions", () => ({
  useRecentSessions: () => [],
}));
vi.mock("@/features/spaces/useSpacePostLikes", () => ({
  useSpacePostLikes: () => ({ liked: new Set(), deltas: {}, toggle: vi.fn() }),
}));
vi.mock("@/features/spaces/SpacePostComposer", () => ({
  default: () => null,
}));
vi.mock("@/features/spaces/raceEventOverrides", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/features/spaces/raceEventOverrides")
  >()),
  useRaceEventOverrides: () => h.overrides,
}));

import Space from "../Space";
import {
  flushSnapshots,
  readsAt,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";

const MANCHESTER = "manchester-marathon";
const LONDON = "london-marathon";
const COHORT = `raceCohorts/${MANCHESTER}`;

/** A local date key `days` from today. */
const inDays = (days: number) =>
  localDateString(addLocalDays(new Date(), days));

/** The viewer's goal bound to Manchester, and its race, `days` from today. */
function trainingForManchester(days: number) {
  h.profile = {
    ...h.profile,
    raceGoal: {
      distance: "marathon",
      targetDate: inDays(days),
      eventName: "Manchester Marathon",
      eventSpaceId: MANCHESTER,
    },
  };
  h.overrides = {
    [MANCHESTER]: { dateKey: inDays(days) },
    [LONDON]: { dateKey: inDays(150) },
  };
}

function openSpace(spaceId: string) {
  return render(
    <MemoryRouter initialEntries={[`/space/${spaceId}`]}>
      <Routes>
        <Route path="/space/:spaceId" element={<Space />} />
      </Routes>
    </MemoryRouter>
  );
}

const heroLine = () => screen.queryByTestId("plan-group-hero");
/** The space's name in its hero. */
const title = (name: string) => screen.getByText(name, { selector: "h1" });
const findTitle = (name: string) => screen.findByText(name, { selector: "h1" });

beforeEach(() => {
  resetFirestore();
  h.profile = { ...h.profile, raceGoal: null };
  h.overrides = {};
});

afterEach(() => cleanup());

describe("the race space's hero", () => {
  it("says how many people on Tropos are training for your race", async () => {
    trainingForManchester(63);
    seedFirestore({ [COHORT]: { count: 12, updatedAt: new Date() } });
    openSpace(MANCHESTER);
    expect(await screen.findByTestId("plan-group-hero")).toHaveTextContent(
      "12 people on Tropos are training for this race"
    );
    // In the hero, under the space's name.
    expect(title("Manchester Marathon").parentElement).toContainElement(
      heroLine()
    );
  });

  it("says nothing about the group under three, the viewer included", async () => {
    trainingForManchester(63);
    seedFirestore({ [COHORT]: { count: 2, updatedAt: new Date() } });
    openSpace(MANCHESTER);
    // The count was read and has settled.
    await waitFor(() => expect(readsAt(COHORT)).toHaveLength(1));
    await flushSnapshots();
    expect(title("Manchester Marathon")).toBeInTheDocument();
    expect(heroLine()).toBeNull();

    // The third person in the group brings the line.
    cleanup();
    seedFirestore({ [COHORT]: { count: 3, updatedAt: new Date() } });
    openSpace(MANCHESTER);
    expect(await screen.findByTestId("plan-group-hero")).toHaveTextContent(
      "3 people on Tropos are training for this race"
    );
  });

  it("reads no count on another race's space, or once your race has passed", async () => {
    seedFirestore({
      [COHORT]: { count: 12, updatedAt: new Date() },
      [`raceCohorts/${LONDON}`]: { count: 40, updatedAt: new Date() },
    });
    trainingForManchester(63);
    openSpace(LONDON);
    expect(await findTitle("London Marathon")).toBeInTheDocument();
    await flushSnapshots();
    expect(heroLine()).toBeNull();
    expect(readsAt(`raceCohorts/${LONDON}`)).toHaveLength(0);

    cleanup();
    trainingForManchester(-1);
    openSpace(MANCHESTER);
    expect(await findTitle("Manchester Marathon")).toBeInTheDocument();
    await flushSnapshots();
    expect(heroLine()).toBeNull();
    expect(readsAt(COHORT)).toHaveLength(0);

    // Your own race, ahead: the same page reads it and says it.
    cleanup();
    trainingForManchester(63);
    openSpace(MANCHESTER);
    expect(await screen.findByTestId("plan-group-hero")).toHaveTextContent(
      "12 people on Tropos are training for this race"
    );
    expect(readsAt(COHORT)).toHaveLength(1);
  });
});
