/**
 * The pull, drawn: the indicator follows the finger down from the top of
 * the page, ticks once as a release would refresh, springs back short of
 * it, and holds with "Refreshing" while the refresh runs.
 *
 * Driven through a mounted container, as a page binds it, so the
 * non-passive touchmove listener is the one the browser would call.
 * Reduce Motion is on here so every settle is immediate and readable.
 */
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { MotionValue } from "framer-motion";

const h = vi.hoisted(() => ({ haptic: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: h.haptic }));

import {
  PULL_HOLD,
  PULL_MAX,
  pullDistance,
  usePullToRefresh,
} from "../usePullToRefresh";
import PullToRefreshIndicator from "@/components/ui/PullToRefreshIndicator";

let pull: MotionValue<number>;
const keepPull = (value: MotionValue<number>) => {
  pull = value;
};

function Page({
  onRefresh,
  excludeSelector,
}: {
  onRefresh: () => Promise<void>;
  excludeSelector?: string;
}) {
  const hook = usePullToRefresh({ onRefresh, excludeSelector });
  useEffect(() => keepPull(hook.pull), [hook.pull]);
  return (
    <div data-testid="page" {...hook.bindProps}>
      <PullToRefreshIndicator
        pull={hook.pull}
        readyAt={hook.readyAt}
        refreshing={hook.isRefreshing}
      />
      <div data-food-row>
        <span data-testid="row">A row</span>
      </div>
    </div>
  );
}

const originalMatchMedia = window.matchMedia;
beforeEach(() => {
  h.haptic.mockClear();
  Object.defineProperty(window, "scrollY", {
    value: 0,
    writable: true,
    configurable: true,
  });
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduce"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
});

const page = () => screen.getByTestId("page");
const start = (y: number, on: Element = page()) =>
  fireEvent.touchStart(on, { touches: [{ clientY: y }] });
const move = (y: number, on: Element = page()) =>
  fireEvent.touchMove(on, { touches: [{ clientY: y }] });
const end = (y: number, on: Element = page()) =>
  fireEvent.touchEnd(on, { changedTouches: [{ clientY: y }] });

describe("pullDistance", () => {
  it("is half the finger's travel at first, slowing towards the most", () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(-40)).toBe(0);
    expect(pullDistance(10)).toBeCloseTo(5, 0);
    expect(pullDistance(200)).toBeGreaterThan(pullDistance(100));
    expect(pullDistance(5000)).toBeLessThan(PULL_MAX);
    expect(pullDistance(5000)).toBeGreaterThan(PULL_MAX - 1);
  });
});

describe("the pull, drawn", () => {
  it("follows the finger down, and back up with it", () => {
    render(<Page onRefresh={vi.fn(async () => {})} />);
    start(100);
    move(140);
    expect(pull.get()).toBeCloseTo(pullDistance(40));
    move(260);
    expect(pull.get()).toBeCloseTo(pullDistance(160));
    move(90);
    expect(pull.get()).toBe(0);
  });

  it("ticks once as a release would refresh, and again only after going back", () => {
    render(<Page onRefresh={vi.fn(async () => {})} />);
    start(100);
    move(150);
    expect(h.haptic).not.toHaveBeenCalled();
    move(200);
    move(260);
    expect(h.haptic).toHaveBeenCalledTimes(1);
    expect(h.haptic).toHaveBeenCalledWith("light");
    move(150);
    move(220);
    expect(h.haptic).toHaveBeenCalledTimes(2);
  });

  it("springs back without refreshing when let go short of the threshold", () => {
    const onRefresh = vi.fn(async () => {});
    render(<Page onRefresh={onRefresh} />);
    start(100);
    move(150);
    end(150);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(pull.get()).toBe(0);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("holds with Refreshing while the refresh runs, then goes", async () => {
    let finish!: () => void;
    const onRefresh = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve))
    );
    render(<Page onRefresh={onRefresh} />);
    start(100);
    move(300);
    end(300);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("status", { name: "Refreshing" })
    ).toBeInTheDocument();
    expect(pull.get()).toBe(PULL_HOLD);
    // A second pull while it runs neither moves it nor refreshes again.
    start(100);
    move(300);
    expect(pull.get()).toBe(PULL_HOLD);
    end(300);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(screen.queryByRole("status")).toBeNull();
    expect(pull.get()).toBe(0);
  });

  it("does nothing below the top of the page, or from an excluded row", () => {
    const onRefresh = vi.fn(async () => {});
    render(<Page onRefresh={onRefresh} excludeSelector="[data-food-row]" />);
    window.scrollY = 200;
    start(100);
    move(300);
    end(300);
    expect(pull.get()).toBe(0);
    window.scrollY = 0;
    const row = screen.getByTestId("row");
    start(100, row);
    move(300, row);
    end(300, row);
    expect(pull.get()).toBe(0);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(h.haptic).not.toHaveBeenCalled();
  });

  it("is hidden from a screen reader until a refresh runs", () => {
    const { container } = render(<Page onRefresh={vi.fn(async () => {})} />);
    expect(container.querySelector("[data-pull-indicator]")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  });
});
