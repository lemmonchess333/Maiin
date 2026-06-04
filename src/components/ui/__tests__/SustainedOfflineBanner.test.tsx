/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.mock("framer-motion", () => ({
  get m() {
    return (this as { motion: unknown }).motion;
  },
  motion: new Proxy(
    {},
    {
      get: (_t: any, prop: string) => (props: any) => {
        const {
          initial: _i,
          animate: _a,
          exit: _e,
          transition: _t2,
          ...rest
        } = props;
        const Tag = prop === "create" ? "div" : prop;
        return <Tag {...rest} />;
      },
    }
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

let mockIsOnline = true;
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({ isOnline: mockIsOnline, wasOffline: false }),
}));

import SustainedOfflineBanner from "../SustainedOfflineBanner";

describe("SustainedOfflineBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockIsOnline = true;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not render the body when online", () => {
    mockIsOnline = true;
    render(<SustainedOfflineBanner>Some copy</SustainedOfflineBanner>);
    expect(screen.queryByText(/Some copy/i)).toBeNull();
  });

  it("does not render in the first 30 seconds after going offline", () => {
    mockIsOnline = false;
    render(<SustainedOfflineBanner>Some copy</SustainedOfflineBanner>);
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(screen.queryByText(/Some copy/i)).toBeNull();
  });

  it("renders the children copy after sustained offline (>=30s)", () => {
    mockIsOnline = false;
    render(<SustainedOfflineBanner>Cached data shown</SustainedOfflineBanner>);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText(/Cached data shown/i)).toBeInTheDocument();
  });

  it("honours a custom threshold", () => {
    mockIsOnline = false;
    render(
      <SustainedOfflineBanner thresholdMs={100}>
        Custom copy
      </SustainedOfflineBanner>
    );
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText(/Custom copy/i)).toBeInTheDocument();
  });
});
