/**
 * An earned anniversary on the finish screen (App1 Q58): the 50th
 * session's finish shows it full screen with Share and Done, records it on
 * the account once it has drawn, and never shows it again, on this finish
 * reopened or anywhere else. Firestore runs on the one fake (ADR-0009).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: { displayName: "Sam" } }),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import AnniversaryGate from "../AnniversaryGate";
import type { FinishedSession } from "@/lib/anniversaries";
import {
  readDoc,
  readsAt,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { savedWorkoutDoc } from "@/test/sessionFixtures";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";

const UID = "u1";
const MARKS = `users/${UID}/stats/anniversaries`;
const TODAY = localDateString(new Date());

const fiftieth: FinishedSession = {
  id: "fiftieth",
  sport: "lift",
  day: TODAY,
  counts: true,
  metres: 0,
};

/** 49 workouts before today, and the 50th, today's. */
function seedFortyNine() {
  const docs: Record<string, Record<string, unknown>> = {
    [`users/${UID}/workouts/fiftieth`]: savedWorkoutDoc(TODAY),
  };
  for (let i = 1; i <= 49; i++)
    docs[`users/${UID}/workouts/w${i}`] = savedWorkoutDoc(
      localDateString(addLocalDays(new Date(), -i))
    );
  seedFirestore(docs);
}

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
});

describe("AnniversaryGate", () => {
  it("shows the 50th session full screen once, and records it shown", async () => {
    seedFortyNine();
    render(<AnniversaryGate uid={UID} session={fiftieth} startDay={null} />);

    expect(
      await screen.findByRole(
        "heading",
        { name: "Your 50th session" },
        { timeout: 5000 }
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    await waitFor(() =>
      expect(readDoc(MARKS)).toMatchObject({
        sessions50: { day: TODAY, shown: true },
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(screen.queryByTestId("anniversary-reveal")).toBeNull()
    );
    cleanup();

    // The same finish opened again: the account's mark is read, and
    // nothing is shown.
    const marksRead = readsAt(MARKS).length;
    render(<AnniversaryGate uid={UID} session={fiftieth} startDay={null} />);
    await waitFor(() =>
      expect(readsAt(MARKS).length).toBeGreaterThan(marksRead)
    );
    // Let the read's answer land before looking.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId("anniversary-reveal")).toBeNull();
  });

  it("waits while one of the finish screen's sheets is open", async () => {
    seedFortyNine();
    const { rerender } = render(
      <AnniversaryGate uid={UID} session={fiftieth} startDay={null} held />
    );
    await waitFor(() =>
      expect(readDoc(MARKS)).toMatchObject({
        sessions50: { day: TODAY, shown: false },
      })
    );
    expect(screen.queryByTestId("anniversary-reveal")).toBeNull();

    rerender(<AnniversaryGate uid={UID} session={fiftieth} startDay={null} />);
    expect(
      await screen.findByRole(
        "heading",
        { name: "Your 50th session" },
        { timeout: 5000 }
      )
    ).toBeInTheDocument();
  });
});
