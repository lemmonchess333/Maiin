/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// framer-motion → render synchronously, same shim as DeloadBanner.test.
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

import RecoveryReductionBanner from "../RecoveryReductionBanner";

describe("RecoveryReductionBanner (LIFT-EV-05)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("does not render with no reduced muscles", () => {
    render(<RecoveryReductionBanner muscles={[]} weekKey="w14" />);
    expect(screen.queryByText(/Eased this week/i)).toBeNull();
  });

  it("names the reduced muscles and states the honest trigger + change", () => {
    render(
      <RecoveryReductionBanner muscles={["Chest", "Quads"]} weekKey="w14" />
    );
    expect(
      screen.getByText(/Eased this week: Chest and Quads/i)
    ).toBeInTheDocument();
    // The honest copy: factual trigger, factual change, heuristic label.
    const body = screen.getByText(/Two sessions in a row came in under/i);
    expect(body.textContent).toMatch(/halves sets and reps/i);
    expect(body.textContent).toMatch(/same weight/i);
    expect(body.textContent).toMatch(/heuristic, not a physiology/i);
    // Never MRV / recovery-science language.
    expect(body.textContent).not.toMatch(/MRV/i);
  });

  it("offers the restore CTA only when onUndo is wired", () => {
    const { rerender } = render(
      <RecoveryReductionBanner muscles={["Chest"]} weekKey="w14" />
    );
    expect(
      screen.queryByRole("button", { name: /Restore full volume/i })
    ).toBeNull();
    rerender(
      <RecoveryReductionBanner
        muscles={["Chest"]}
        weekKey="w14"
        onUndo={async () => true}
      />
    );
    expect(
      screen.getByRole("button", { name: /Restore full volume/i })
    ).toBeInTheDocument();
  });

  it("a successful undo dismisses the banner for the week", async () => {
    const onUndo = vi.fn().mockResolvedValue(true);
    render(
      <RecoveryReductionBanner
        muscles={["Chest"]}
        weekKey="w14"
        onUndo={onUndo}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Restore full volume/i })
    );
    await waitFor(() =>
      expect(screen.queryByText(/Eased this week/i)).toBeNull()
    );
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("a failed undo keeps the banner up", async () => {
    const onUndo = vi.fn().mockResolvedValue(false);
    render(
      <RecoveryReductionBanner
        muscles={["Chest"]}
        weekKey="w14"
        onUndo={onUndo}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Restore full volume/i })
    );
    await waitFor(() => expect(onUndo).toHaveBeenCalled());
    expect(screen.getByText(/Eased this week/i)).toBeInTheDocument();
  });

  it("dismissal persists for the week and resets on a new week", () => {
    const { unmount } = render(
      <RecoveryReductionBanner muscles={["Chest"]} weekKey="w14" />
    );
    fireEvent.click(screen.getByLabelText(/Dismiss recovery banner/i));
    expect(screen.queryByText(/Eased this week/i)).toBeNull();
    unmount();
    // Same week: stays dismissed.
    const second = render(
      <RecoveryReductionBanner muscles={["Chest"]} weekKey="w14" />
    );
    expect(screen.queryByText(/Eased this week/i)).toBeNull();
    second.unmount();
    // New week: reopens.
    render(<RecoveryReductionBanner muscles={["Chest"]} weekKey="w15" />);
    expect(screen.getByText(/Eased this week/i)).toBeInTheDocument();
  });
});
