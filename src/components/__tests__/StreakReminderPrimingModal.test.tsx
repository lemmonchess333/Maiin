import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { StreakReminderPrimingModal } from "../StreakReminderPrimingModal";

/*
 * Trigger-timing guard for the streak-priming modal.
 *
 * The defect this exists for: the modal fired on app-open, first render and
 * visibilitychange, so it popped over the Programme page the moment someone
 * navigated there to train — landing mid-task, over the page they had chosen.
 * The rule now is that it fires ONLY after a completed session, never on mount
 * or any page visit.
 *
 * That fix shipped; nothing held it. The component says so in a comment, which
 * is what this codebase keeps learning is not enough — so the rule is asserted
 * here, along with the three gates the fix has to preserve.
 *
 * The component reads the SurfaceCoordinator via useSurface, which FAILS OPEN
 * outside a provider (active mirrors eligible), so rendering the modal alone
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

function fireCompleted(event: "workout" | "run") {
  act(() => {
    window.dispatchEvent(new CustomEvent(`tropos:${event}-completed`));
  });
}

describe("StreakReminderPrimingModal — trigger timing", () => {
  beforeEach(() => {
    streakStub.prefs = { enabled: true, time: "20:00", primingShown: false };
    streakStub.loading = false;
    streakStub.currentStreak = 3;
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it("does NOT open on mount — a page visit is not a completion", () => {
    render(<StreakReminderPrimingModal />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does NOT open when the tab is merely brought back to the foreground", () => {
    /* visibilitychange was one of the two original triggers, and it is the one
       that fires without any navigation at all — backgrounding the app and
       returning was enough to get the modal. */
    render(<StreakReminderPrimingModal />);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens after a completed workout", () => {
    render(<StreakReminderPrimingModal />);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireCompleted("workout");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opens after a completed run too", () => {
    /* Runs joined workouts when the floor moved to >= 1: a run-first user's
       first session is the same consent moment. Meals deliberately stay out —
       a modal after a routine food log interrupts the Food flow. */
    render(<StreakReminderPrimingModal />);

    fireCompleted("run");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("a meal log is not a completion", () => {
    render(<StreakReminderPrimingModal />);
    act(() => {
      window.dispatchEvent(new CustomEvent("tropos:meal-logged"));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays closed once priming has already been shown (once-ever gate)", () => {
    streakStub.prefs = { enabled: true, time: "20:00", primingShown: true };
    render(<StreakReminderPrimingModal />);

    fireCompleted("workout");

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays closed while prefs are still loading", () => {
    streakStub.loading = true;
    render(<StreakReminderPrimingModal />);

    fireCompleted("workout");

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a first session (streak 1) DOES prompt — the floor is >= 1, not >= 2", () => {
    /* Pinned as a literal because it has already moved once: the floor was 2
       while only workouts counted, and dropped to 1 when runs joined. A test
       that asserted the old value would read as a regression guard while
       actually guarding the wrong number. */
    streakStub.currentStreak = 1;
    render(<StreakReminderPrimingModal />);

    fireCompleted("workout");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("stays closed below the floor (streak 0 — no session yet)", () => {
    streakStub.currentStreak = 0;
    render(<StreakReminderPrimingModal />);

    fireCompleted("workout");

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
