import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import WeekPhaseRow from "../WeekPhaseRow";

afterEach(cleanup);

/* Train's week as the header's line (DS4): the week, then the line's
   suffix, with chevrons only once there is another week to see. */
describe("WeekPhaseRow — the week on the header's line", () => {
  it("reads as one line with its suffix and no chevrons in week one", () => {
    const { container } = render(
      <WeekPhaseRow
        weekNumber={1}
        label="Week 1 · General fitness"
        suffix=" · 6 days/week"
        onPrevWeek={() => {}}
        onNextWeek={() => {}}
        canGoPrev={false}
        canGoNext={false}
      />
    );
    expect(container.textContent).toBe(
      "Week 1 · General fitness · 6 days/week"
    );
    expect(screen.queryByRole("button")).toBeNull();
    // Inline, so it sits in the subtitle's line rather than a row.
    expect((container.firstElementChild as HTMLElement).tagName).toBe("SPAN");
  });

  it("keeps the week's label findable on its own beside the suffix", () => {
    /* The marathon-with-lifting journey finds Train's week by its exact
       label ("Week 21 of 53 · Build"). InlineNumerals is a fragment, so a
       label and suffix sharing one parent read as a single run of text
       and no element carried the label alone. */
    render(
      <WeekPhaseRow
        weekNumber={21}
        label="Week 21 of 53 · Build"
        suffix=" · 6 days/week"
        onPrevWeek={() => {}}
        onNextWeek={() => {}}
        canGoPrev
        canGoNext={false}
      />
    );
    // Matched as Playwright's getByText({ exact: true }) matches: on an
    // element's whole text, numerals included (InlineNumerals puts them in
    // child spans, which RTL's default own-text matcher would not read).
    const label = "Week 21 of 53 · Build";
    expect(
      screen.getByText((_, el) => el?.textContent === label)
    ).toBeInTheDocument();
  });

  it("moves between weeks from chevrons with a 44pt hit area", () => {
    const prev = vi.fn();
    const next = vi.fn();
    render(
      <WeekPhaseRow
        weekNumber={3}
        onPrevWeek={prev}
        onNextWeek={next}
        canGoPrev
        canGoNext
      />
    );
    const back = screen.getByRole("button", { name: "Previous week" });
    // 24pt drawn, 10pt more each side from the pseudo-element: 44.
    expect(back.className).toMatch(/\bsize-6\b/);
    expect(back.className).toMatch(/before:-inset-2\.5/);
    fireEvent.click(back);
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(prev).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Week/)).toBeInTheDocument();
  });
});
