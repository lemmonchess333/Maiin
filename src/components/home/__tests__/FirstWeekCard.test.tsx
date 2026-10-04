import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FirstWeekCard from "../FirstWeekCard";
import { firstWeek } from "@/lib/firstWeek";

function week(overrides: Partial<Parameters<typeof firstWeek>[0]> = {}) {
  const w = firstWeek({
    startKey: "2026-10-02",
    todayKey: "2026-10-02",
    lifts: true,
    runs: true,
    workoutCount: 1,
    runCount: 0,
    mealCount: 2,
    weighInCount: 1,
    dismissed: false,
    ...overrides,
  });
  if (!w) throw new Error("expected a first week");
  return w;
}

describe("FirstWeekCard", () => {
  it("shows the day, each item, and which are done", () => {
    render(<FirstWeekCard week={week()} onDismiss={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "Your first week" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Day/).textContent).toBe("Day 1 of 7");
    expect(screen.getByText("Finish your first workout").textContent).toMatch(
      /, done$/
    );
    expect(screen.getByText("Go for your first run").textContent).not.toMatch(
      /done/
    );
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("names the day the first recap comes, in en-GB", () => {
    render(<FirstWeekCard week={week()} onDismiss={vi.fn()} />);
    expect(
      screen.getByText("Your first weekly recap comes on Monday 5 October.")
    ).toBeInTheDocument();
  });

  it("closes from its button", () => {
    const onDismiss = vi.fn();
    render(<FirstWeekCard week={week()} onDismiss={onDismiss} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Hide your first week" })
    );
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  /* FV1: an item still to do opens its step (Home decides what that is:
     a session card pointed out, Food's composer, the weigh-in sheet). */
  it("opens the step an item still to do names", () => {
    const onOpen = vi.fn();
    render(<FirstWeekCard week={week()} onDismiss={vi.fn()} onOpen={onOpen} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Go for your first run/ })
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Weigh in on three mornings/ })
    );
    expect(onOpen.mock.calls).toEqual([["run"], ["weigh-in"]]);
  });

  it("a ticked item is plain text, not a button", () => {
    render(
      <FirstWeekCard week={week()} onDismiss={vi.fn()} onOpen={vi.fn()} />
    );
    expect(
      screen.queryByRole("button", { name: /Finish your first workout/ })
    ).toBeNull();
    expect(screen.getByText("Finish your first workout")).toBeInTheDocument();
  });

  it("without somewhere to open, no row is a button", () => {
    render(<FirstWeekCard week={week()} onDismiss={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(1); // the close X
  });
});
