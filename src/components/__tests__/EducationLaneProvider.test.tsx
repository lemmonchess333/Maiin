import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useState } from "react";
import {
  EducationLaneProvider,
  useEducationCard,
} from "../EducationLaneProvider";

function Card({
  id,
  priority,
  eligible,
}: {
  id: string;
  priority: number;
  eligible: boolean;
}) {
  const { visible } = useEducationCard({ id, priority, eligible });
  return <div data-testid={id}>{visible ? "VISIBLE" : "hidden"}</div>;
}

// flush the 0ms recompute timer
function flush() {
  act(() => {
    vi.advanceTimersByTime(5);
  });
}

describe("EducationLaneProvider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows only the highest-priority eligible card", () => {
    render(
      <EducationLaneProvider>
        <Card id="welcome" priority={30} eligible />
        <Card id="body-metrics" priority={20} eligible />
        <Card id="expenditure" priority={10} eligible />
      </EducationLaneProvider>
    );
    flush();
    expect(screen.getByTestId("welcome")).toHaveTextContent("VISIBLE");
    expect(screen.getByTestId("body-metrics")).toHaveTextContent("hidden");
    expect(screen.getByTestId("expenditure")).toHaveTextContent("hidden");
  });

  it("promotes the next card when the winner becomes ineligible (dismissed)", () => {
    function Harness() {
      const [welcomeEligible, setWelcomeEligible] = useState(true);
      return (
        <EducationLaneProvider>
          <button onClick={() => setWelcomeEligible(false)}>dismiss</button>
          <Card id="welcome" priority={30} eligible={welcomeEligible} />
          <Card id="body-metrics" priority={20} eligible />
        </EducationLaneProvider>
      );
    }
    render(<Harness />);
    flush();
    expect(screen.getByTestId("welcome")).toHaveTextContent("VISIBLE");
    expect(screen.getByTestId("body-metrics")).toHaveTextContent("hidden");

    act(() => {
      screen.getByText("dismiss").click();
    });
    flush();
    expect(screen.getByTestId("welcome")).toHaveTextContent("hidden");
    expect(screen.getByTestId("body-metrics")).toHaveTextContent("VISIBLE");
  });

  it("shows nothing when no card is eligible", () => {
    render(
      <EducationLaneProvider>
        <Card id="a" priority={20} eligible={false} />
        <Card id="b" priority={10} eligible={false} />
      </EducationLaneProvider>
    );
    flush();
    expect(screen.getByTestId("a")).toHaveTextContent("hidden");
    expect(screen.getByTestId("b")).toHaveTextContent("hidden");
  });

  it("fails open outside a provider — visible mirrors eligible", () => {
    render(
      <>
        <Card id="a" priority={20} eligible />
        <Card id="b" priority={10} eligible={false} />
      </>
    );
    expect(screen.getByTestId("a")).toHaveTextContent("VISIBLE");
    expect(screen.getByTestId("b")).toHaveTextContent("hidden");
  });
});
