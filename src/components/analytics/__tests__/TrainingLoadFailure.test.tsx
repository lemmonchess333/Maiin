import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TrainingLoadCard from "../TrainingLoadCard";

describe("training load read failures", () => {
  it("shows an error and retries instead of claiming there are no sessions", () => {
    const retry = vi.fn();
    render(
      <TrainingLoadCard points={[]} loading={false} failed onRetry={retry} />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load your training history"
    );
    expect(
      screen.queryByText("Your training load curve builds here")
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("still uses the empty state for a successful read with no history", () => {
    render(<TrainingLoadCard points={[]} loading={false} failed={false} />);
    expect(
      screen.getByText("Your training load curve builds here")
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows loading rather than a previous error during retry", () => {
    render(<TrainingLoadCard points={[]} loading failed />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.queryByText("Your training load curve builds here")
    ).toBeNull();
  });
});

it("uses the history-backed advisory when the visible chart cannot hold its baseline", () => {
  render(
    <TrainingLoadCard
      points={[
        {
          dateKey: "2026-09-28",
          load: 30,
          runLoad: 30,
          liftLoad: 0,
          fitness: 5,
          fatigue: 6,
          form: -1,
        },
        {
          dateKey: "2026-09-29",
          load: 30,
          runLoad: 30,
          liftLoad: 0,
          fitness: 5,
          fatigue: 6,
          form: -1,
        },
        {
          dateKey: "2026-09-30",
          load: 30,
          runLoad: 30,
          liftLoad: 0,
          fitness: 5,
          fatigue: 6,
          form: -1,
        },
      ]}
      loading={false}
      guardrails={{
        acwr: 2,
        monotony: null,
        strain: null,
        advisory: { kind: "ramp_spike", line: "History-backed ramp warning" },
      }}
    />
  );
  expect(screen.getByText("History-backed ramp warning")).toBeInTheDocument();
});
