/**
 * The In progress strip: what a session under way says, and Resume.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ unlock: vi.fn() }));
vi.mock("@/lib/speechUnlock", () => ({ unlockSpeech: h.unlock }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import InProgressStrip from "../InProgressStrip";
import type { SessionInProgress } from "@/lib/sessionsInFlight";

const PULL: SessionInProgress = {
  sport: "lift",
  name: "Pull B",
  sets: 5,
  elapsedSeconds: 1120,
  resumeTarget: "/program?day=1&resume=1",
};

afterEach(() => {
  cleanup();
  h.unlock.mockClear();
});

describe("InProgressStrip", () => {
  it("says what was done, and resumes", () => {
    const onResume = vi.fn();
    render(<InProgressStrip session={PULL} onResume={onResume} />);
    const strip = screen.getByRole("group", { name: "Pull B in progress" });
    expect(strip).toHaveTextContent("In progress");
    expect(strip).toHaveTextContent("Pull B");
    expect(strip).toHaveTextContent("5 sets");
    expect(strip).toHaveTextContent("18:40");
    fireEvent.click(screen.getByRole("button", { name: "Resume Pull B" }));
    expect(onResume).toHaveBeenCalledOnce();
    expect(h.unlock).not.toHaveBeenCalled();
  });

  it("leaves the name to the card it sits on", () => {
    render(<InProgressStrip session={PULL} onCard onResume={() => {}} />);
    const strip = screen.getByRole("group", { name: "Pull B in progress" });
    expect(strip).not.toHaveTextContent("Pull B");
    expect(strip).toHaveTextContent("5 sets");
  });

  /* jsdom lays nothing out, so the floor is read off its class. The words
     keep 9em beside Resume, wrapping it below them when they cannot, and
     the floor never passes the strip's own width: a bare 9em is wider
     than the card at large text on a small phone, and the words ran past
     it (large text, 320 px at 200%). */
  it("keeps the words' floor inside the strip, wrapping Resume below", () => {
    render(<InProgressStrip session={PULL} onResume={() => {}} />);
    const strip = screen.getByRole("group", { name: "Pull B in progress" });
    expect(strip).toHaveClass("flex-wrap");
    const words = screen.getByText("In progress").parentElement!;
    expect(words).toHaveClass("min-w-[min(9em,100%)]");
    expect(words.className).not.toMatch(/(^|\s)min-w-\[9em\]/);
  });

  it("names no sets before one is ticked, and unlocks a run's voice inside the tap", () => {
    render(
      <InProgressStrip
        session={{
          sport: "run",
          name: "Free run",
          sets: null,
          elapsedSeconds: 65,
          resumeTarget: "/run?resume=1",
        }}
        onResume={() => {}}
      />
    );
    const strip = screen.getByRole("group", { name: "Free run in progress" });
    expect(strip).not.toHaveTextContent("set");
    expect(strip).toHaveTextContent("1:05");
    fireEvent.click(screen.getByRole("button", { name: "Resume Free run" }));
    expect(h.unlock).toHaveBeenCalledOnce();
  });

  it("offers review for a finished recording without restarting run audio", () => {
    const onReview = vi.fn();
    render(
      <InProgressStrip
        session={{
          sport: "run",
          name: "Easy run",
          sets: null,
          elapsedSeconds: 1800,
          resumeTarget: "/run-summary",
          reviewPending: true,
        }}
        onResume={onReview}
      />
    );
    expect(
      screen.getByRole("group", { name: "Easy run ready to review" })
    ).toHaveTextContent("Ready to review");
    fireEvent.click(screen.getByRole("button", { name: "Review Easy run" }));
    expect(onReview).toHaveBeenCalledOnce();
    expect(h.unlock).not.toHaveBeenCalled();
  });
});
