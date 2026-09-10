/**
 * The weekly logging focus counts what is logged NOW.
 *
 * The card used to read its meals once, in an effect keyed on
 * [uid, weekKey]. Neither of those moves when you log a meal, so the
 * count froze at whatever it was when the page opened: logging the
 * day's first meal did not advance it, and deleting the day's last meal
 * left the day still counted. Both are asserted here by driving a real
 * write into the store after the first render, with no remount.
 */
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/features/goalSpace/useGoalSpaces", () => ({
  useGoalSpaces: () => ({ circles: [], publishEvent: vi.fn() }),
}));
import FoodConsistencyCard from "../FoodConsistencyCard";
import {
  resetFirestore,
  seedFirestore,
  flushSnapshots,
} from "@/test/firestoreHarness";
import { firestoreFake } from "@/test/firestoreFake";
import { localWeekKey, localDateString } from "@/lib/dateHelpers";

const WEEK = localWeekKey(new Date());
const TODAY = localDateString(new Date());

/** A second in-week day, so the fixture is never a one-day edge case. */
function otherDayInWeek(): string {
  const start = new Date(`${WEEK}T12:00:00`);
  const candidate = new Date(start);
  candidate.setDate(candidate.getDate() + (TODAY === WEEK ? 1 : 0));
  return localDateString(candidate);
}

beforeEach(() => {
  resetFirestore();
  seedFirestore({
    [`users/u1/nutritionCommitments/${WEEK}`]: {
      weekKey: WEEK,
      intent: "log_3_days",
      createdAt: 1,
    },
    "users/u1/meals/m1": { date: otherDayInWeek(), calories: 300 },
  });
});
afterEach(cleanup);

describe("weekly logging focus — the count is live", () => {
  it("advances when the day's first meal is logged", async () => {
    render(<FoodConsistencyCard uid="u1" />);
    await waitFor(() =>
      expect(screen.getByText(/2 more days to go/i)).toBeInTheDocument()
    );

    // A meal logged elsewhere in the app lands in the same collection.
    seedFirestore({ "users/u1/meals/m2": { date: TODAY, calories: 500 } });
    await flushSnapshots();

    await waitFor(() =>
      expect(screen.getByText(/1 more day to go/i)).toBeInTheDocument()
    );
  });

  it("gives the day back when its last meal is soft-deleted", async () => {
    seedFirestore({ "users/u1/meals/m2": { date: TODAY, calories: 500 } });
    render(<FoodConsistencyCard uid="u1" />);
    await waitFor(() =>
      expect(screen.getByText(/1 more day to go/i)).toBeInTheDocument()
    );

    /* F5c soft-delete: the doc stays, `deletedAt` appears. `activeMealDocs`
       is what must see the change — the count going back up is the whole
       point of filtering before projecting to dates. */
    firestoreFake.setDoc(
      { path: "users/u1/meals/m2" } as never,
      { date: TODAY, calories: 500, deletedAt: Date.now() },
      undefined as never
    );
    await flushSnapshots();

    await waitFor(() =>
      expect(screen.getByText(/2 more days to go/i)).toBeInTheDocument()
    );
  });
});
