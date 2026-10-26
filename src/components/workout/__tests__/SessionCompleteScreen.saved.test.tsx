/**
 * The saved finish screen's order (Pol1): the badge a session earned sits
 * with its new bests on the first screen, and Done comes last, pinned in
 * thumb reach. Done used to sit halfway down with the badge below it, so
 * tapping Done, the obvious move, sent the badge to Home instead of
 * opening it where FW1 says a session's badge opens.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ProgramExercise } from "@/features/program/programTypes";
import type { SetPR } from "@/lib/prTracking";

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
  it("shows the session's badge under its new bests, ahead of everything else", () => {
    render(<SessionCompleteScreen {...screenProps({ saved: true })} />);
    const badge = screen.getByTestId("session-badge");
    const bests = screen.getByRole("heading", { name: /New bests/ });
    expect(follows(bests, badge)).toBe(true);
    expect(follows(badge, screen.getByText("Next: Legs · Squat focus"))).toBe(
      true
    );
    // The week's count is the week card's; the plan line does not repeat it.
    expect(screen.queryByText(/planned lifts complete/)).toBeNull();
    expect(
      follows(
        badge,
        screen.getByRole("switch", {
          name: "Evening reminder if you haven't logged",
        })
      )
    ).toBe(true);
    // Once: the extras below no longer carry a second copy.
    expect(screen.getAllByTestId("session-badge")).toHaveLength(1);
  });

  it("puts Done last, pinned to the bottom, with the save's state under it", () => {
    render(<SessionCompleteScreen {...screenProps({ saved: true })} />);
    const done = screen.getByRole("button", { name: "Done" });
    const buttons = screen.getAllByRole("button");
    expect(buttons[buttons.length - 1]).toBe(done);
    expect(follows(screen.getByText("Session details"), done)).toBe(true);
    expect(follows(done, screen.getByRole("status"))).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(done.parentElement).toHaveClass("sticky", "bottom-0");
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
