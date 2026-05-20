import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useInViewOnce } from "../useInViewOnce";

function Probe({
  onView,
  enabled,
  threshold,
}: {
  onView: () => void;
  enabled?: boolean;
  threshold?: number;
}) {
  const ref = useInViewOnce(onView, { enabled, threshold });
  return <div ref={ref} data-testid="probe" />;
}

describe("useInViewOnce", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fires immediately when IntersectionObserver is unavailable (SSR / old browsers)", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const onView = vi.fn();
    render(<Probe onView={onView} />);
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it("registers an observer with the threshold and fires once on intersection", () => {
    let registeredCallback: IntersectionObserverCallback | null = null;
    let registeredOptions: IntersectionObserverInit | undefined;
    const disconnect = vi.fn();
    const observe = vi.fn();

    class MockIO {
      callback: IntersectionObserverCallback;
      constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        registeredCallback = cb;
        registeredOptions = options;
        this.callback = cb;
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root: Element | null = null;
      rootMargin = "";
      thresholds: ReadonlyArray<number> = [];
    }
    vi.stubGlobal("IntersectionObserver", MockIO as unknown as typeof IntersectionObserver);

    const onView = vi.fn();
    render(<Probe onView={onView} threshold={0.5} />);

    expect(observe).toHaveBeenCalledTimes(1);
    expect(registeredOptions?.threshold).toBe(0.5);
    expect(onView).not.toHaveBeenCalled();

    act(() => {
      registeredCallback!(
        [{ isIntersecting: true, intersectionRatio: 0.8 } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(onView).toHaveBeenCalledTimes(1);
    // disconnect fires from the intersection handler AND can fire
    // again from the effect cleanup if the parent re-renders
    // (both are no-ops on an already-disconnected observer).
    // Asserting "at least once" is the meaningful invariant.
    expect(disconnect).toHaveBeenCalled();
  });

  it("does NOT fire when intersectionRatio is below threshold", () => {
    let registeredCallback: IntersectionObserverCallback | null = null;
    class MockIO {
      callback: IntersectionObserverCallback;
      constructor(cb: IntersectionObserverCallback) {
        registeredCallback = cb;
        this.callback = cb;
      }
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root: Element | null = null;
      rootMargin = "";
      thresholds: ReadonlyArray<number> = [];
    }
    vi.stubGlobal("IntersectionObserver", MockIO as unknown as typeof IntersectionObserver);

    const onView = vi.fn();
    render(<Probe onView={onView} threshold={0.5} />);

    act(() => {
      registeredCallback!(
        [{ isIntersecting: true, intersectionRatio: 0.3 } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(onView).not.toHaveBeenCalled();
  });

  it("does nothing when enabled is false", () => {
    const observe = vi.fn();
    class MockIO {
      constructor() {}
      observe = observe;
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root: Element | null = null;
      rootMargin = "";
      thresholds: ReadonlyArray<number> = [];
    }
    vi.stubGlobal("IntersectionObserver", MockIO as unknown as typeof IntersectionObserver);

    const onView = vi.fn();
    render(<Probe onView={onView} enabled={false} />);
    expect(observe).not.toHaveBeenCalled();
    expect(onView).not.toHaveBeenCalled();
  });
});
