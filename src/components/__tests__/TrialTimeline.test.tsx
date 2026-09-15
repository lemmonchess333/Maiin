/**
 * TrialTimeline — the ladder promises only what the app does.
 *
 * The Day-5 step was kept off this strip for months because no reminder
 * existed; it is on now because `useTrialReminder` schedules one off
 * the server-recorded trial end. If the reminder ever goes, this pin is
 * the place that says the promise must go with it.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import TrialTimeline from "../TrialTimeline";

afterEach(cleanup);

describe("TrialTimeline", () => {
  it("runs Today → Day 5 (the reminder) → Day 7 (the subscription starts)", () => {
    render(<TrialTimeline />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatch(/^Today/);
    expect(items[1]).toMatch(/^Day 5/);
    expect(items[1]).toMatch(/reminder/i);
    expect(items[1]).toMatch(/notification/i);
    expect(items[2]).toMatch(/^Day 7/);
    expect(items[2]).toMatch(/cancel/i);
  });

  it("never says 'unlock'", () => {
    const { container } = render(<TrialTimeline />);
    expect(container.textContent).not.toMatch(/unlock/i);
  });
});
