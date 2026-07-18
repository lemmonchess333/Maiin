/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// framer-motion → render the actual element synchronously so tests
// can observe the banner DOM without waiting on AnimatePresence.
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
      String(c[0]).includes("programme_deload_banner_viewed")
    );
    expect(viewed).toHaveLength(1);
  });

  it("fires programme_deload_banner_action with action='dismissed' on dismiss tap", () => {
    render(<DeloadBanner visible weekKey="w14" />);
    fireEvent.click(screen.getByLabelText(/Dismiss deload banner/i));
    const dismissed = mocks.logger.log.mock.calls.filter(
      (c) =>
        String(c[0]).includes("programme_deload_banner_action") &&
        (c[1] as Record<string, unknown>)?.action === "dismissed"
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

  // PROGRAM-DELOAD-01 — the Apply CTA v1 reserved.

  it("shows the Apply CTA only when onApply is provided", () => {
    const { unmount } = render(<DeloadBanner visible weekKey="w14" />);
    expect(
      screen.queryByRole("button", { name: /Apply deload week/i })
    ).toBeNull();
    unmount();

    render(
      <DeloadBanner
        visible
        weekKey="w14"
        onApply={() => Promise.resolve(true)}
      />
    );
    expect(
      screen.getByRole("button", { name: /Apply deload week/i })
    ).toBeInTheDocument();
  });

  it("fires action='applied' only when onApply resolves true", async () => {
    let resolveWith = true;
    const onApply = vi.fn(() => Promise.resolve(resolveWith));
    render(<DeloadBanner visible weekKey="w14" onApply={onApply} />);

    fireEvent.click(screen.getByRole("button", { name: /Apply deload week/i }));
    await screen.findByRole("button", { name: /Apply deload week/i });
    let applied = mocks.logger.log.mock.calls.filter(
      (c) =>
        String(c[0]).includes("programme_deload_banner_action") &&
        (c[1] as Record<string, unknown>)?.action === "applied"
    );
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(applied).toHaveLength(1);

    // A failed apply must NOT fire the telemetry.
    mocks.logger.log.mockClear();
    resolveWith = false;
    fireEvent.click(screen.getByRole("button", { name: /Apply deload week/i }));
    await screen.findByRole("button", { name: /Apply deload week/i });
    applied = mocks.logger.log.mock.calls.filter(
      (c) =>
        String(c[0]).includes("programme_deload_banner_action") &&
        (c[1] as Record<string, unknown>)?.action === "applied"
    );
    expect(applied).toHaveLength(0);
  });

  it("deloadActive renders the calm active state: no Apply, no Dismiss, overrides dismissal", () => {
    // Dismiss the recommendation first…
    const { unmount } = render(<DeloadBanner visible weekKey="w14" />);
    fireEvent.click(screen.getByLabelText(/Dismiss deload banner/i));
    unmount();

    // …then an applied deload still shows the active confirmation.
    render(
      <DeloadBanner
        visible
        weekKey="w14"
        deloadActive
        onApply={() => Promise.resolve(true)}
      />
    );
    expect(screen.getByText(/Deload week active/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Apply deload week/i })
    ).toBeNull();
    expect(screen.queryByLabelText(/Dismiss deload banner/i)).toBeNull();
  });
});
