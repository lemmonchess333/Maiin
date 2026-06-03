import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import {
  SurfaceCoordinatorProvider,
  useSurface,
  type SurfaceConfig,
} from "../SurfaceCoordinatorProvider";

// A surface consumer that renders its own active/idle status.
function Surface(props: SurfaceConfig) {
  const s = useSurface(props);
  return <div data-testid={props.id}>{s.active ? "ACTIVE" : "idle"}</div>;
}

const SETTLE = 400;

function settle() {
  act(() => {
    vi.advanceTimersByTime(SETTLE + 10);
  });
}

describe("SurfaceCoordinatorProvider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows only the highest-priority eligible surface after the settle window", () => {
    render(
      <SurfaceCoordinatorProvider>
        <Surface id="trial-expired" priority={40} eligible />
        <Surface id="fell-behind" priority={30} eligible />
        <Surface id="priming" priority={10} eligible />
      </SurfaceCoordinatorProvider>
    );
    // Before settle, nothing is active (we wait for all to register).
    expect(screen.getByTestId("trial-expired")).toHaveTextContent("idle");

    settle();

    expect(screen.getByTestId("trial-expired")).toHaveTextContent("ACTIVE");
    expect(screen.getByTestId("fell-behind")).toHaveTextContent("idle");
    expect(screen.getByTestId("priming")).toHaveTextContent("idle");
  });

  it("suppresses the badge under fell-behind AND fires its onDrop (celebration dropped)", () => {
    const onDrop = vi.fn();
    render(
      <SurfaceCoordinatorProvider>
        <Surface id="fell-behind" priority={30} eligible />
        <Surface
          id="badge"
          priority={20}
          eligible
          suppressedBy={["fell-behind"]}
          dropWhenMissed
          onDrop={onDrop}
        />
      </SurfaceCoordinatorProvider>
    );
    settle();

    expect(screen.getByTestId("fell-behind")).toHaveTextContent("ACTIVE");
    expect(screen.getByTestId("badge")).toHaveTextContent("idle");
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it("drops a losing celebration even when not suppressed (budget spent by a higher decision)", () => {
    const onDrop = vi.fn();
    render(
      <SurfaceCoordinatorProvider>
        <Surface id="trial-expired" priority={40} eligible />
        <Surface
          id="badge"
          priority={20}
          eligible
          dropWhenMissed
          onDrop={onDrop}
        />
      </SurfaceCoordinatorProvider>
    );
    settle();

    expect(screen.getByTestId("trial-expired")).toHaveTextContent("ACTIVE");
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it("shows the badge (and never drops it) when it is the sole eligible surface", () => {
    const onDrop = vi.fn();
    render(
      <SurfaceCoordinatorProvider>
        <Surface
          id="badge"
          priority={20}
          eligible
          dropWhenMissed
          onDrop={onDrop}
        />
      </SurfaceCoordinatorProvider>
    );
    settle();

    expect(screen.getByTestId("badge")).toHaveTextContent("ACTIVE");
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("fails open outside a provider — active mirrors eligible", () => {
    render(
      <>
        <Surface id="a" priority={40} eligible />
        <Surface id="b" priority={30} eligible={false} />
      </>
    );
    // No provider, no settle needed.
    expect(screen.getByTestId("a")).toHaveTextContent("ACTIVE");
    expect(screen.getByTestId("b")).toHaveTextContent("idle");
  });
});
