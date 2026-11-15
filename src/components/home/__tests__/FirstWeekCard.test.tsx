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
    dismissed: false,
    ...overrides,
  });
  if (!w) throw new Error("expected a first week");
  return w;
}

/** The line under the heading, as it reads. */
const dayLine = () =>
  screen.getByText(
    (_, el) => el?.tagName === "P" && /^Day /.test(el.textContent ?? "")
  ).textContent;

describe("FirstWeekCard", () => {
  it("shows the day, each item, and which are done", () => {
    render(<FirstWeekCard week={week()} onDismiss={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "Your first week" })
    ).toBeInTheDocument();
    // The day, and how many of the week's things are done (Mob2 call 1).
    expect(dayLine()).toBe("Day 1 of 7 · 1 of 2 done");
    expect(screen.getByText("Finish your first workout").textContent).toMatch(
      /, done$/
    );
    expect(screen.getByText("Go for your first run").textContent).not.toMatch(
      /done/
    );
  });

  it("counts what is done as it is done", () => {
    render(
      <FirstWeekCard
        week={week({ todayKey: "2026-10-04", workoutCount: 0 })}
        onDismiss={vi.fn()}
      />
    );
    expect(dayLine()).toBe("Day 3 of 7 · 0 of 2 done");
  });

  it("closes from its button", () => {
    const onDismiss = vi.fn();
    render(<FirstWeekCard week={week()} onDismiss={onDismiss} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Hide your first week" })
    );
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  /* An item still to do opens its session (Home decides where: its Start,
     Resume, or the plan, `firstWeekAction`). */
  it("opens the session an item still to do names", () => {
    const onOpen = vi.fn();
    render(
      <FirstWeekCard
        week={week({ workoutCount: 0 })}
        onDismiss={vi.fn()}
        onOpen={onOpen}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Finish your first workout/ })
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Go for your first run/ })
    );
    expect(onOpen.mock.calls).toEqual([["workout"], ["run"]]);
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
