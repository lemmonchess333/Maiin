/**
 * The saved finish screen's order (Pol1): the badge a session earned sits
 * with its new bests on the first screen, and Done comes last, pinned in
 * thumb reach. Done used to sit halfway down with the badge below it, so
 * tapping Done, the obvious move, sent the badge to Home instead of
 * opening it where FW1 says a session's badge opens.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { finishKicker } from "@/lib/finishMoment";
import type { ProgramExercise } from "@/features/program/programTypes";
import type { SetPR } from "@/lib/prTracking";
import { LiftUnitContext } from "@/hooks/useLiftUnit";

const motionPref = vi.hoisted(() => ({ reduce: true }));
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => motionPref.reduce,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    profile: { preferredWeightUnit: "kg" },
    user: { uid: "u1" },
  }),
}));
vi.mock("@/components/WeekPulseCard", () => ({ default: () => null }));
vi.mock("@/components/workout/SessionShareRow", () => ({
  default: () => null,
}));
vi.mock("@/components/workout/ReminderOffer", () => ({
  default: () => <p>Remind you before your next session?</p>,
}));
vi.mock("@/hooks/RemindersProvider", () => ({
  useStreakReminder: () => ({
    prefs: { enabled: false },
    loading: false,
    updatePrefs: vi.fn(),
    requestPermission: vi.fn(),
  }),
}));
const streaks = vi.hoisted(() => ({
  newBadge: null as { id: string; name: string } | null,
}));
vi.mock("@/features/streaks/useStreaks", () => ({
  useStreaks: () => ({
    newBadge: streaks.newBadge,
    dismissNewBadge: vi.fn(),
  }),
}));
/* The seal itself is BadgeEarnedModal's to test; here it only has to be
   somewhere on the screen. */
vi.mock("@/features/streaks/BadgeEarnedModal", () => ({
  BadgeEarnedContent: ({ badge }: { badge: { name: string } }) => (
    <div data-testid="session-badge">{badge.name}</div>
  ),
}));

/* What the finish screen hands its share card, read without drawing it. */
const shareCard = vi.hoisted(() => ({
  data: null as null | Record<string, unknown>,
}));
vi.mock("@/components/share/ShareCardSheet", () => ({
  default: ({ data }: { data: Record<string, unknown> }) => {
    shareCard.data = data;
    return null;
  },
}));

const confetti = vi.hoisted(() => Object.assign(vi.fn(), { reset: vi.fn() }));
vi.mock("canvas-confetti", () => ({ default: confetti }));

import SessionCompleteScreen from "../SessionCompleteScreen";

const bench = {
  name: "Bench Press",
  exerciseId: "bench-press",
  instanceId: "i-bench",
  movementCategory: "horizontal_push",
  sets: 3,
  reps: 8,
  weight: 80,
} as unknown as ProgramExercise;

const benchBest = {
  kind: "best",
  bucket: "8rm",
  weight: 80,
  reps: 8,
  previousBest: { weight: 77.5, reps: 8, date: "2026-09-20" },
  bestBeforeSession: { weight: 77.5, reps: 8, date: "2026-09-20" },
} as unknown as SetPR;

it("uses the kettlebell's displayed pounds for the best, its comparison and session detail", () => {
  const bell = {
    ...bench,
    exerciseId: "kettlebell-swing",
    name: "Kettlebell Swing",
  };
  const best = {
    ...benchBest,
    weight: 16,
    reps: 20,
    previousBest: { weight: 12, reps: 20, date: "2026-09-20" },
    bestBeforeSession: { weight: 12, reps: 20, date: "2026-09-20" },
  };
  render(
    <LiftUnitContext value="lbs">
      <SessionCompleteScreen
        {...screenProps({
          exercises: [bell],
          setLogs: [
            [{ reps: 20, weight: 16, completed: true, type: "working" }],
          ],
          prResults: new Map([["Kettlebell Swing:10rm", best]]),
        })}
      />
    </LiftUnitContext>
  );
  expect(screen.getAllByText("35 lb × 20")).toHaveLength(2);
  expect(screen.getByText(/Was/)).toHaveTextContent("Was 26 lb × 20");
  expect(screen.queryByText(/35\.3 lb/)).toBeNull();
});

it("uses the same kettlebell unit in a first-logged record", () => {
  const bell = {
    ...bench,
    exerciseId: "kettlebell-swing",
    name: "Kettlebell Swing",
  };
  const first: SetPR = {
    kind: "bucket-first",
    bucket: "10rm",
    weight: 16,
    reps: 20,
    previousBest: null,
  };
  render(
    <LiftUnitContext value="lbs">
      <SessionCompleteScreen
        {...screenProps({
          exercises: [bell],
          setLogs: [
            [{ reps: 20, weight: 16, completed: true, type: "working" }],
          ],
          prResults: new Map([["Kettlebell Swing:10rm", first]]),
        })}
      />
    </LiftUnitContext>
  );
  expect(screen.getByText(/First logged at/)).toHaveTextContent(
    "First logged at 35 lb × 20."
  );
});

function screenProps(
  props: Partial<Parameters<typeof SessionCompleteScreen>[0]> = {}
) {
  return {
    dayName: "Push — Chest Focus",
    exercises: [bench],
    setLogs: [
      [{ reps: 8, weight: 80, completed: true, type: "working" as const }],
    ],
    firedPRs: new Map(),
    prResults: new Map([["Bench Press:8rm", benchBest]]),
    sessionDurationMinutes: 41,
    completing: false,
    planContext: {
      next: "Next: Legs · Squat focus",
    },
    onFinish: () => {},
    onClose: () => {},
    ...props,
  };
}

/** Whether `later` is drawn after `earlier`, top to bottom. */
const follows = (earlier: Node, later: Node) =>
  (earlier.compareDocumentPosition(later) &
    Node.DOCUMENT_POSITION_FOLLOWING) !==
  0;

beforeEach(() => {
  motionPref.reduce = true;
  streaks.newBadge = { id: "first-pr", name: "First PR" };
});

describe("SessionCompleteScreen — saved (Pol1)", () => {
  it("shows the session's badge under its new bests, ahead of everything else", async () => {
    render(<SessionCompleteScreen {...screenProps({ saved: true })} />);
    const badge = screen.getByTestId("session-badge");
    const bests = screen.getByRole("heading", { name: /New bests/ });
    expect(follows(bests, badge)).toBe(true);
    // What comes next is the routine first screen's line, said once.
    const next = screen.getByText("Next: Legs · Squat focus");
    expect(next.closest("[data-finish-line]")).not.toBeNull();
    expect(follows(next, bests)).toBe(true);
    expect(screen.getAllByText("Next: Legs · Squat focus")).toHaveLength(1);
    // The week's count is the week card's; the plan line does not repeat it.
    expect(screen.queryByText(/planned lifts complete/)).toBeNull();
    expect(
      follows(
        badge,
        await screen.findByText(
          "Remind you before your next session?",
          {},
          { timeout: 5_000 }
        )
      )
    ).toBe(true);
    // Once: the extras below no longer carry a second copy.
    expect(screen.getAllByTestId("session-badge")).toHaveLength(1);
  });

  it("puts Done last, pinned to the bottom, with the save's state under it", () => {
    render(
      <SessionCompleteScreen
        {...screenProps({ saved: true, onViewWorkout: () => {} })}
      />
    );
    const done = screen.getByRole("button", { name: "Done" });
    const buttons = screen.getAllByRole("button");
    expect(buttons[buttons.length - 1]).toBe(done);
    expect(follows(screen.getByText("Session details"), done)).toBe(true);
    expect(
      follows(screen.getByRole("button", { name: "View workout" }), done)
    ).toBe(true);
    expect(follows(done, screen.getByRole("status"))).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    // Share beside it, its outline; Done the one filled button (DS4 1a).
    const share = screen.getByRole("button", { name: "Share" });
    expect(share.parentElement).toBe(done.parentElement);
    expect(done.parentElement!.parentElement).toHaveClass("sticky", "bottom-0");
  });

  it("opens Session details on the app's chevron, not the browser's triangle", () => {
    render(<SessionCompleteScreen {...screenProps({ saved: true })} />);
    const summary = screen.getByText("Session details");
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary).toHaveClass("list-none");
    expect(summary.querySelector("svg.lucide-chevron-down")).not.toBeNull();
  });

  it("keeps the review's order: the decision before the session's detail", () => {
    render(<SessionCompleteScreen {...screenProps()} />);
    const save = screen.getByRole("button", { name: "Save workout" });
    expect(follows(save, screen.getByText("Session details"))).toBe(true);
    expect(save.parentElement).not.toHaveClass("sticky");
    // Nothing earned is shown before the session is saved.
    expect(screen.queryByTestId("session-badge")).toBeNull();
  });

  it("moves focus to Done when saving takes the focused Save away", () => {
    const view = render(<SessionCompleteScreen {...screenProps()} />);
    screen.getByRole("button", { name: "Save workout" }).focus();
    view.rerender(<SessionCompleteScreen {...screenProps({ saved: true })} />);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Done" })
    );
  });

  it("leaves focus where it is when something else on the screen holds it", () => {
    const view = render(<SessionCompleteScreen {...screenProps()} />);
    const details = screen.getByText("Session details");
    details.focus();
    expect(document.activeElement).toBe(details);
    view.rerender(<SessionCompleteScreen {...screenProps({ saved: true })} />);
    expect(document.activeElement).toBe(details);
  });

  it("lands the new bests a beat after the screen, unless motion is reduced", () => {
    /* framer writes a mark's starting values inline as it mounts. */
    const landing = () =>
      (
        screen
          .getByRole("heading", { name: /New bests/ })
          .closest("section")
          ?.getAttribute("style") ?? ""
      ).includes("opacity: 0");
    motionPref.reduce = false;
    const view = render(<SessionCompleteScreen {...screenProps()} />);
    expect(landing()).toBe(true);
    view.unmount();

    motionPref.reduce = true;
    render(<SessionCompleteScreen {...screenProps()} />);
    expect(
      screen.getByRole("heading", { name: /New bests/ })
    ).toBeInTheDocument();
    expect(landing()).toBe(false);
  });
});

/* DS4 call 3: the saved screen is the full-screen reward for a first, a
   new best, a streak milestone or a finished plan, and the calm summary
   for anything else. */
describe("SessionCompleteScreen — the reward and the summary (DS4)", () => {
  const register = () =>
    document
      .querySelector("[data-finish-register]")!
      .getAttribute("data-finish-register");
  const line = () => document.querySelector("[data-finish-line]");

  it("heads the saved session with what was done, never the save", () => {
    render(<SessionCompleteScreen {...screenProps({ saved: true })} />);
    expect(
      screen.getByRole("heading", { name: "Push done" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /saved/i })).toBeNull();
  });

  it("makes a new best the reward: its lift in a gold light, and the sentence", () => {
    render(
      <SessionCompleteScreen
        {...screenProps({
          saved: true,
          moments: [
            { kind: "pr", exercise: "Bench Press", weightKg: 80, reps: 8 },
          ],
        })}
      />
    );
    expect(register()).toBe("reward");
    expect(document.querySelector("[data-finish-glow]")).toHaveAttribute(
      "data-finish-glow",
      "achievement"
    );
    expect(line()).toHaveTextContent(
      "You benched 80 kg × 8, a new best by 2.5 kg."
    );
    expect(
      line()!.querySelector("span.text-achievement-strong")
    ).toHaveTextContent("80 kg × 8");
    expect(
      document.querySelector("[data-finish-object] [data-lead-drawing]")
    ).toHaveAttribute("data-lead-drawing", "Bench Press");
  });

  it("keeps a routine session calm: no light, no confetti, its next session", async () => {
    motionPref.reduce = false;
    render(
      <SessionCompleteScreen {...screenProps({ saved: true, moments: [] })} />
    );
    expect(register()).toBe("summary");
    expect(document.querySelector("[data-finish-glow]")).toBeNull();
    expect(line()).toHaveTextContent("Next: Legs · Squat focus");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(confetti).not.toHaveBeenCalled();
  });

  it("throws confetti for a first, once, and none under Reduce Motion", async () => {
    confetti.mockClear();
    motionPref.reduce = true;
    const view = render(
      <SessionCompleteScreen
        {...screenProps({ saved: true, moments: [{ kind: "firstSession" }] })}
      />
    );
    expect(line()).toHaveTextContent("You finished your first workout!");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(confetti).not.toHaveBeenCalled();
    view.unmount();

    motionPref.reduce = false;
    render(
      <SessionCompleteScreen
        {...screenProps({ saved: true, moments: [{ kind: "firstSession" }] })}
      />
    );
    await waitFor(() => expect(confetti).toHaveBeenCalledTimes(1));
  });

  it("takes its confetti with it when the screen closes", async () => {
    confetti.mockClear();
    confetti.reset.mockClear();
    motionPref.reduce = false;
    const view = render(
      <SessionCompleteScreen
        {...screenProps({ saved: true, moments: [{ kind: "firstSession" }] })}
      />
    );
    await waitFor(() => expect(confetti).toHaveBeenCalledTimes(1));
    expect(confetti.reset).not.toHaveBeenCalled();
    view.unmount();
    expect(confetti.reset).toHaveBeenCalledTimes(1);
  });

  it("clears nothing when it closes before any was thrown", async () => {
    confetti.mockClear();
    confetti.reset.mockClear();
    motionPref.reduce = false;
    const view = render(
      <SessionCompleteScreen
        {...screenProps({ saved: true, moments: [{ kind: "firstSession" }] })}
      />
    );
    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(confetti).not.toHaveBeenCalled();
    expect(confetti.reset).not.toHaveBeenCalled();
  });

  it("rewards a runner's first workout as a first, though its post claims none", () => {
    render(
      <SessionCompleteScreen
        {...screenProps({ saved: true, moments: [], firstOfSport: true })}
      />
    );
    expect(register()).toBe("reward");
    expect(line()).toHaveTextContent("You finished your first workout!");
  });

  it("gives a streak milestone the flame's purple and no confetti", async () => {
    confetti.mockClear();
    motionPref.reduce = false;
    render(
      <SessionCompleteScreen
        {...screenProps({
          saved: true,
          moments: [{ kind: "streak", days: 7 }],
        })}
      />
    );
    expect(document.querySelector("[data-finish-glow]")).toHaveAttribute(
      "data-finish-glow",
      "lifting"
    );
    expect(line()).toHaveTextContent(
      "You’ve trained 7 days in a row. 14 is next."
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(confetti).not.toHaveBeenCalled();
  });

  it("still says what comes next when a reward takes the first screen's line", () => {
    render(
      <SessionCompleteScreen
        {...screenProps({
          saved: true,
          moments: [
            { kind: "pr", exercise: "Bench Press", weightKg: 80, reps: 8 },
          ],
        })}
      />
    );
    expect(register()).toBe("reward");
    expect(screen.getAllByText("Next: Legs · Squat focus")).toHaveLength(1);
  });

  it("dates its share card by the session's start, and hands it a bodyweight session's reps", async () => {
    shareCard.data = null;
    // Recorded late: started yesterday evening, the screen opened today.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(19, 0, 0, 0);
    render(
      <SessionCompleteScreen
        {...screenProps({
          saved: true,
          startedAt: yesterday.getTime(),
          exercises: [{ ...bench, name: "Pull-up" }],
          setLogs: [
            [{ reps: 12, weight: 0, completed: true, type: "working" }],
          ],
          prResults: new Map(),
        })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(shareCard.data).not.toBeNull());
    expect(shareCard.data!.date).toBe(
      finishKicker(undefined, yesterday.getTime())
    );
    expect(shareCard.data!.totalVolumeKg).toBe(0);
    expect(shareCard.data!.totalReps).toBe(12);
  });

  it("offers no reward before the save", () => {
    render(
      <SessionCompleteScreen
        {...screenProps({ moments: [{ kind: "firstSession" }] })}
      />
    );
    expect(register()).toBe("summary");
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });
});
