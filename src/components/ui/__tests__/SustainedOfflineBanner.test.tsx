/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.mock("framer-motion", () => ({
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

  it("renders NO element at all while idle — not even an empty live region", () => {
    // The permanent aria-live wrapper it used to render was a real child
    // in the page's vertical rhythm: as the first child of a space-y-4
    // page it pushed Food's and Train's headers down one step, and inside
    // Analytics' own stack it opened a gap above nothing.
    mockIsOnline = true;
    const { container } = render(
      <SustainedOfflineBanner>Some copy</SustainedOfflineBanner>
    );
    expect(container.childElementCount).toBe(0);
  });

  it("renders the notice through the Banner primitive's neutral variant with role=status", () => {
    mockIsOnline = false;
    render(<SustainedOfflineBanner>Cached data shown</SustainedOfflineBanner>);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Cached data shown");
    expect(notice.className).toMatch(/\brounded-xl\b/);
    expect(notice.className).toMatch(/\bp-3\b/);
    expect(notice.className).toContain("bg-muted/60");
    // No self-margin: the slot owns the rhythm.
    expect(notice.className).not.toMatch(/\bmt-/);
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
