/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// framer-motion → render the actual element synchronously so tests
// can observe the banner DOM without waiting on AnimatePresence.
vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get:
        (_t: any, prop: string) =>
        (props: any) => {
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
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

vi.mock("@/lib/haptic", () => ({
  haptic: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/logger", () => ({ logger: mocks.logger }));

import DeloadBanner from "../DeloadBanner";

describe("DeloadBanner", () => {
  beforeEach(() => {
    mocks.logger.log.mockClear();
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("does not render when visible is false (deloadRecommended off)", () => {
    render(<DeloadBanner visible={false} weekKey="w14" />);
    expect(screen.queryByText(/Consider a deload week/i)).toBeNull();
  });

  it("renders the locked copy when visible and not dismissed", () => {
    render(<DeloadBanner visible weekKey="w14" />);
    expect(screen.getByText(/Consider a deload week/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Dismiss deload banner/i)).toBeInTheDocument();
  });

  it("fires programme_deload_banner_viewed exactly once on first visible render", () => {
    render(<DeloadBanner visible weekKey="w14" />);
    const viewed = mocks.logger.log.mock.calls.filter((c) =>
      String(c[0]).includes("programme_deload_banner_viewed"),
    );
    expect(viewed).toHaveLength(1);
  });

  it("fires programme_deload_banner_action with action='dismissed' on dismiss tap", () => {
    render(<DeloadBanner visible weekKey="w14" />);
    fireEvent.click(screen.getByLabelText(/Dismiss deload banner/i));
    const dismissed = mocks.logger.log.mock.calls.filter(
      (c) =>
        String(c[0]).includes("programme_deload_banner_action") &&
        (c[1] as Record<string, unknown>)?.action === "dismissed",
    );
    expect(dismissed).toHaveLength(1);
  });

  it("persists dismissal in localStorage per-week and stays hidden on re-mount", () => {
    const { unmount } = render(<DeloadBanner visible weekKey="w14" />);
    fireEvent.click(screen.getByLabelText(/Dismiss deload banner/i));
    unmount();

    render(<DeloadBanner visible weekKey="w14" />);
    expect(screen.queryByText(/Consider a deload week/i)).toBeNull();
  });

  it("reopens on a new weekKey even if the prior week was dismissed", () => {
    const { unmount } = render(<DeloadBanner visible weekKey="w14" />);
    fireEvent.click(screen.getByLabelText(/Dismiss deload banner/i));
    unmount();

    render(<DeloadBanner visible weekKey="w15" />);
    expect(screen.getByText(/Consider a deload week/i)).toBeInTheDocument();
  });
});
