import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import EaseWeekNudgeCard from "../EaseWeekNudgeCard";

describe("easier-week evidence card", () => {
  it("reveals actual saved targets and keeps changes behind the preview action", () => {
    const ease = vi.fn();
    const dismiss = vi.fn();
    render(
      <MemoryRouter>
        <EaseWeekNudgeCard
          trigger="short_sessions"
          count={2}
          total={3}
          evidence={[
            {
              id: "time-run",
              date: "2026-09-12",
              actual: 600,
              target: { unit: "seconds", value: 1800 },
            },
            {
              id: "distance-run",
              date: "2026-09-10",
              actual: 3000,
              target: { unit: "metres", value: 10000 },
            },
          ]}
          unit="mi"
          onEase={ease}
          onDismiss={dismiss}
        />
      </MemoryRouter>
    );
    expect(ease).not.toHaveBeenCalled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "See runs" }));
    expect(screen.getByRole("button", { name: "Hide runs" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    const time = screen.getByRole("link", { name: /12 Sept/ });
    expect(time).toHaveAttribute("href", "/run/time-run");
    expect(time).toHaveTextContent("10:00 / 30:00");
    expect(screen.getByRole("link", { name: /10 Sept/ })).toHaveTextContent(
      "1.9 mi / 6.2 mi"
    );
    expect(ease).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Review easier week" }));
    expect(ease).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
