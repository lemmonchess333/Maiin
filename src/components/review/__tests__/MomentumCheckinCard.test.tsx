/**
 * MomentumCheckinCard (CHECKIN-01) — behaviour pins.
 *
 *   1. fresh week → question state; focus + save hidden until a feel
 *      is picked (progressive, never a wall of inputs)
 *   2. saving writes the weekKey-keyed record through the GUARDED
 *      wrapper (focus optional) and flips to the read-back state
 *   3. dismissing writes a dismissed record and hides the card —
 *      no re-nag for the same review week
 *   4. an already-answered week renders the read-back (no questions)
 *   5. an already-dismissed week renders nothing
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import MomentumCheckinCard from "../MomentumCheckinCard";
import { toast } from "@/lib/toast";
import {
  seedFirestore,
  resetFirestore,
  readDoc,
  failNextFirestore,
  deferReads,
  releaseRead,
  flushSnapshots,
  deferWrites,
  releaseAllWrites,
} from "@/test/firestoreHarness";

const PATH = "users/u1/checkins/2026-07-06";

/** Seed the week's check-in doc. Omit to leave the week unanswered. */
function seedCheckin(data?: Record<string, unknown>) {
  if (data) seedFirestore({ [PATH]: data });
}

function renderCard() {
  return render(
    <MemoryRouter>
      <MomentumCheckinCard uid="u1" weekKey="2026-07-06" />
    </MemoryRouter>
  );
}

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
});

describe("MomentumCheckinCard", () => {
  it("shows the feel question first; focus + save appear after a pick", async () => {
    renderCard();
    expect(
      await screen.findByText(/How did this week's plan feel\?/)
    ).toBeInTheDocument();
    expect(screen.queryByText("Save check-in")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "A bit much" }));
    expect(screen.getByText("Save check-in")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Log food consistently" })
    ).toBeInTheDocument();
  });

  it("saves a weekKey-keyed record through the guarded wrapper and reads back", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("radio", { name: "A bit much" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Hit my planned lifts" })
    );
    fireEvent.click(screen.getByText("Save check-in"));

    // Read the record back from the PATH it landed at. The previous
    // assertion inspected the call args, which cannot tell a correct
    // path from a wrong one — the stub returned the same canned snapshot
    // whatever was asked for.
    await waitFor(() => expect(readDoc(PATH)).toBeDefined());
    const record = readDoc(PATH)!;
    expect(record.weekKey).toBe("2026-07-06");
    expect(record.feel).toBe("a_bit_much");
    expect(record.focus).toBe("lifts");
    expect(record.dismissed).toBeUndefined();

    // Read-back replaces the questions with the contextual action.
    expect(await screen.findByText(/Checked in — A bit much/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Make this week fit" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Save check-in")).toBeNull();
  });

  it("dismiss writes a dismissed record and hides the card", async () => {
    renderCard();
    fireEvent.click(
      await screen.findByRole("button", { name: "Dismiss check-in" })
    );
    await waitFor(() => expect(readDoc(PATH)?.dismissed).toBe(true));
    await waitFor(() =>
      expect(screen.queryByText(/Momentum check-in/i)).toBeNull()
    );
  });

  it("an answered week renders the read-back, not the questions", async () => {
    seedCheckin({
      weekKey: "2026-07-06",
      feel: "too_light",
      focus: null,
      createdAt: 1,
    });
    renderCard();
    expect(await screen.findByText(/Checked in — Too light/)).toBeVisible();
    expect(screen.queryByText(/How did this week's plan feel\?/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Review this week's plan" })
    ).toBeInTheDocument();
  });

  it("opens the guided plan and keeps Review as the back destination", async () => {
    seedCheckin({
      weekKey: "2026-07-06",
      feel: "a_bit_much",
      focus: "runs",
      createdAt: 1,
    });
    function Destination() {
      const location = useLocation();
      return (
        <p>{`${location.search}|${(location.state as { returnTo?: string; resetFeel?: string } | null)?.returnTo}|${(location.state as { resetFeel?: string } | null)?.resetFeel}`}</p>
      );
    }
    render(
      <MemoryRouter initialEntries={["/review"]}>
        <Routes>
          <Route
            path="/review"
            element={<MomentumCheckinCard uid="u1" weekKey="2026-07-06" />}
          />
          <Route path="/program/plan" element={<Destination />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Make this week fit" })
    );
    expect(
      await screen.findByText("?reset=1|/review|a_bit_much")
    ).toBeVisible();
  });

  it("a dismissed week renders nothing", async () => {
    /* Anchored via a held read, because the naive form of this test was
     * VACUOUS: the card also renders nothing while LOADING, so
     * `waitFor(innerHTML === "")` was satisfied on its first poll before
     * the read resolved — deleting the entire dismissed branch from the
     * component left it green (found by a 2026-07-27 mutation audit; the
     * suite was saved only by an unrelated interaction test). Holding the
     * read open and releasing it makes "the load completed AND the card
     * still renders nothing" the thing actually asserted. */
    seedCheckin({ weekKey: "2026-07-06", dismissed: true, createdAt: 1 });
    deferReads();
    const { container } = renderCard();
    // Positive anchor: the read is genuinely held, then genuinely answered.
    await waitFor(() => expect(releaseRead()).toBe(true));
    await flushSnapshots();
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText(/How did this week's plan feel\?/)).toBeNull();
  });

  it("a failed load hides the card — never re-asks over an unread answer", async () => {
    failNextFirestore("getDoc", { path: PATH });
    const { container } = renderCard();
    // Stays empty: showing the blank questions here would double-nag a
    // user whose answer we merely failed to READ, and saving would
    // overwrite it.
    await waitFor(() => expect(container.innerHTML).toBe(""));
    expect(screen.queryByText(/How did this week's plan feel\?/)).toBeNull();
  });
});

/* A failed save left the form, or a card a dismissal meant to close, with
   nothing said. Offline the save waited for the connection with the button
   spinning: the SDK has the write on the device, but its promise waits
   for the server (settleWrite.ts). */
describe("MomentumCheckinCard — a save that does not land", () => {
  const setOnline = (online: boolean) =>
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => online,
    });

  it("says so when the save fails, and keeps the questions", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("radio", { name: "A bit much" }));
    failNextFirestore("setDoc", { path: PATH, code: "unavailable" });
    fireEvent.click(screen.getByText("Save check-in"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't save your check-in. Try again."
      )
    );
    expect(screen.getByText("Save check-in")).toBeInTheDocument();
  });

  it("says so when hiding it fails", async () => {
    renderCard();
    const dismiss = await screen.findByRole("button", {
      name: "Dismiss check-in",
    });
    failNextFirestore("setDoc", { path: PATH, code: "unavailable" });
    fireEvent.click(dismiss);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't hide the check-in. Try again."
      )
    );
  });

  it("offline, reads back at once while the write waits for the connection", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("radio", { name: "A bit much" }));
    setOnline(false);
    deferWrites();
    try {
      fireEvent.click(screen.getByText("Save check-in"));
      expect(await screen.findByText(/Checked in — A bit much/)).toBeVisible();
      expect(toast.error).not.toHaveBeenCalled();
    } finally {
      setOnline(true);
      releaseAllWrites();
    }
    await waitFor(() => expect(readDoc(PATH)?.feel).toBe("a_bit_much"));
  });
});
