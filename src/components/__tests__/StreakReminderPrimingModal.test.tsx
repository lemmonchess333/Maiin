import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { StreakReminderPrimingModal } from "../StreakReminderPrimingModal";

/*
 * Trigger-timing regression guard for the streak-priming modal (audit #10).
 *
 * The bug the audit caught: the modal fired on app-open / first-render /
 * visibilitychange, so it popped over the Programme page the moment a user
 * navigated there to train. The retuned rule is that it fires ONLY after a
 * `tropos:workout-completed` event (a successful-completion moment), never on
 * mount or any page visit. These tests pin that rule plus the two gates the
 * fix must preserve (streak floor + once-ever primingShown).
 *
 * The component reads the SurfaceCoordinator via useSurface, which FAILS OPEN
 * outside a provider (active mirrors eligible) — so rendering the modal alone
 * exercises the real eligibility→active path without the settle window.
 */

// Mutable stub so each test can vary the gate inputs the modal reads.
const streakStub = {
  prefs: { enabled: true, time: "20:00", primingShown: false },
  loading: false,
  updatePrefs: vi.fn().mockResolvedValue(undefined),
  requestPermission: vi.fn().mockResolvedValue(true),
  currentStreak: 3,
  hasLoggedToday: false,
};

vi.mock("@/hooks/RemindersProvider", () => ({
  useStreakReminder: () => streakStub,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

function fireWorkoutCompleted() {
  act(() => {
    window.dispatchEvent(new CustomEvent("tropos:workout-completed"));
  });
}

describe("StreakReminderPrimingModal — trigger timing (audit #10)", () => {
  beforeEach(() => {
    streakStub.prefs = { enabled: true, time: "20:00", primingShown: false };
    streakStub.loading = false;
    streakStub.currentStreak = 3;
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it("does NOT open on mount / page visit (no interruption on Programme)", () => {
    render(<StreakReminderPrimingModal />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens only after a workout-completed event", () => {
    render(<StreakReminderPrimingModal />);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireWorkoutCompleted();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Keep your streak alive")).toBeInTheDocument();
  });

  it("stays closed after completion when the streak is below 2 (floor gate)", () => {
    streakStub.currentStreak = 1;
    render(<StreakReminderPrimingModal />);

    fireWorkoutCompleted();

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays closed after completion once priming has already been shown (once-ever gate)", () => {
    streakStub.prefs = { enabled: true, time: "20:00", primingShown: true };
    render(<StreakReminderPrimingModal />);

    fireWorkoutCompleted();

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays closed while prefs are still loading", () => {
    streakStub.loading = true;
    render(<StreakReminderPrimingModal />);

    fireWorkoutCompleted();

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
