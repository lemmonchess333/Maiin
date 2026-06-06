import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatCard from "../StatCard";

/* Pins the delta-chip sentiment → token-class mapping. The chip colour
 * is the running copy of the trend-sentiment rule (up-good vs down-good
 * vs neutral); a regression here is invisible in tsc/lint, so it's
 * pinned explicitly. Tokens: good → text-success, bad → text-destructive,
 * neutral/no-delta → text-muted-foreground. */
describe("StatCard delta sentiment colour", () => {
  function deltaEl() {
    return screen.getByText(/vs last/).closest("p");
  }

  it("increase on an up-good metric is success-coloured", () => {
    render(
      <StatCard
        label="Volume"
        value="20,000"
        direction="up-good"
        delta={{ value: "20%", positive: true }}
      />
    );
    expect(deltaEl()).toHaveClass("text-success");
  });

  it("decrease on an up-good metric is destructive-coloured", () => {
    render(
      <StatCard
        label="Volume"
        value="16,000"
        direction="up-good"
        delta={{ value: "20%", positive: false }}
      />
    );
    expect(deltaEl()).toHaveClass("text-destructive");
  });

  it("decrease on a down-good metric (e.g. weight on a cut) is success-coloured", () => {
    render(
      <StatCard
        label="Weight"
        value="80"
        direction="down-good"
        delta={{ value: "2%", positive: false }}
      />
    );
    expect(deltaEl()).toHaveClass("text-success");
  });

  it("neutral direction greys the chip regardless of sign", () => {
    render(
      <StatCard
        label="Calories"
        value="2,100"
        direction="neutral"
        delta={{ value: "1%", positive: true }}
      />
    );
    expect(deltaEl()).toHaveClass("text-muted-foreground");
  });
});
