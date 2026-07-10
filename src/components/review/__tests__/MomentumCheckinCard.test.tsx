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
import { MemoryRouter } from "react-router-dom";

const getDocMock = vi.fn();
vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
}));

const setDocGuardedMock = vi.fn(async () => undefined);
vi.mock("@/lib/firestoreWrite", () => ({
  setDocGuarded: (...args: unknown[]) =>
    setDocGuardedMock(...(args as Parameters<typeof setDocGuardedMock>)),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import MomentumCheckinCard from "../MomentumCheckinCard";

function mockDoc(data: Record<string, unknown> | null) {
  getDocMock.mockResolvedValue(
    data === null
      ? { exists: () => false, data: () => undefined }
      : { exists: () => true, data: () => data }
  );
}

function renderCard() {
  return render(
    <MemoryRouter>
      <MomentumCheckinCard uid="u1" weekKey="2026-07-06" />
    </MemoryRouter>
  );
}

beforeEach(() => {
  getDocMock.mockReset();
  setDocGuardedMock.mockClear();
});

describe("MomentumCheckinCard", () => {
  it("shows the feel question first; focus + save appear after a pick", async () => {
    mockDoc(null);
    renderCard();
    expect(
      await screen.findByText(/How did this week's plan feel\?/)
    ).toBeInTheDocument();
    expect(screen.queryByText("Save check-in")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "A bit much" }));
    expect(screen.getByText("Save check-in")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Log food consistently" })
    ).toBeInTheDocument();
  });

  it("saves a weekKey-keyed record through the guarded wrapper and reads back", async () => {
    mockDoc(null);
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "A bit much" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Hit my planned lifts" })
    );
    fireEvent.click(screen.getByText("Save check-in"));

    await waitFor(() => expect(setDocGuardedMock).toHaveBeenCalledTimes(1));
    const [ref, record] = setDocGuardedMock.mock.calls[0] as unknown as [
      { path: string },
      Record<string, unknown>,
    ];
    expect(ref.path).toBe("users/u1/checkins/2026-07-06");
    expect(record.weekKey).toBe("2026-07-06");
    expect(record.feel).toBe("a_bit_much");
    expect(record.focus).toBe("lifts");
    expect(record.dismissed).toBeUndefined();

    // Read-back replaces the questions with the contextual action.
    expect(await screen.findByText(/Checked in — A bit much/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Review programme options" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Save check-in")).toBeNull();
  });

  it("dismiss writes a dismissed record and hides the card", async () => {
    mockDoc(null);
    renderCard();
    fireEvent.click(
      await screen.findByRole("button", { name: "Dismiss check-in" })
    );
    await waitFor(() => expect(setDocGuardedMock).toHaveBeenCalledTimes(1));
    const [, record] = setDocGuardedMock.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ];
    expect(record.dismissed).toBe(true);
    await waitFor(() =>
      expect(screen.queryByText(/Momentum check-in/i)).toBeNull()
    );
  });

  it("an answered week renders the read-back, not the questions", async () => {
    mockDoc({
      weekKey: "2026-07-06",
      feel: "too_light",
      focus: null,
      createdAt: 1,
    });
    renderCard();
    expect(await screen.findByText(/Checked in — Too light/)).toBeVisible();
    expect(screen.queryByText(/How did this week's plan feel\?/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Review progression" })
    ).toBeInTheDocument();
  });

  it("a dismissed week renders nothing", async () => {
    mockDoc({ weekKey: "2026-07-06", dismissed: true, createdAt: 1 });
    const { container } = renderCard();
    await waitFor(() => expect(getDocMock).toHaveBeenCalled());
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });
});
