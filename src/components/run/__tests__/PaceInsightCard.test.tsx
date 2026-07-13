/**
 * PaceInsightCard — honest approve/dismiss for the pace-recalibration engine.
 *
 * Success is announced only AFTER persistence succeeds; a failure leaves the
 * card mounted + retryable; a "stale" result (account switch mid-write) is
 * silent; dismiss never writes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import PaceInsightCard from "../PaceInsightCard";
import type { PaceInsight } from "@/lib/runPaces";
import type { PaceInsightAcceptResult } from "@/hooks/usePaceInsight";

const haptic = vi.fn();
vi.mock("@/lib/haptic", () => ({ haptic: (...a: unknown[]) => haptic(...a) }));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

const insight = (direction: "faster" | "slower"): PaceInsight => ({
  currentVdot: 42,
  suggestedVdot: 45,
  suggestedBenchmark: { distanceM: 5000, timeS: 1200 },
  direction,
});

beforeEach(() => {
  haptic.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
});
afterEach(cleanup);

// Deferred accept so we can inspect the pending state.
function deferredAccept() {
  let resolve!: (r: PaceInsightAcceptResult) => void;
  const promise = new Promise<PaceInsightAcceptResult>((r) => (resolve = r));
  return { onAccept: () => promise, resolve };
}

describe("PaceInsightCard", () => {
  it("shows the faster / slower copy", () => {
    const { rerender } = render(
      <PaceInsightCard
        insight={insight("faster")}
        onAccept={async () => "success"}
        onDismiss={() => {}}
      />
    );
    expect(
      screen.getByText(/recent runs support faster targets/i)
    ).toBeInTheDocument();
    rerender(
      <PaceInsightCard
        insight={insight("slower")}
        onAccept={async () => "success"}
        onDismiss={() => {}}
      />
    );
    expect(screen.getByText(/may be too quick right now/i)).toBeInTheDocument();
  });

  it("disables both actions while the accept is pending", async () => {
    const { onAccept } = deferredAccept();
    render(
      <PaceInsightCard
        insight={insight("faster")}
        onAccept={onAccept}
        onDismiss={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /update paces/i }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /not now/i }) as HTMLButtonElement)
          .disabled
      ).toBe(true)
    );
  });

  it("announces success (haptic + toast) only after persistence succeeds", async () => {
    render(
      <PaceInsightCard
        insight={insight("faster")}
        onAccept={async () => "success"}
        onDismiss={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /update paces/i }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(haptic).toHaveBeenCalledWith("success");
    // Card unmounts its content after acceptance.
    expect(screen.queryByLabelText("Pace insight")).toBeNull();
  });

  it("a failure toasts and leaves the card mounted (retryable)", async () => {
    render(
      <PaceInsightCard
        insight={insight("faster")}
        onAccept={async () => "failure"}
        onDismiss={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /update paces/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Pace insight")).toBeInTheDocument();
  });

  it("a stale result (account switch) shows no toast or haptic", async () => {
    render(
      <PaceInsightCard
        insight={insight("faster")}
        onAccept={async () => "stale"}
        onDismiss={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /update paces/i }));
    await waitFor(() =>
      expect(screen.getByLabelText("Pace insight")).toBeInTheDocument()
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("dismiss calls onDismiss and never accepts", () => {
    const onDismiss = vi.fn();
    const onAccept = vi.fn();
    render(
      <PaceInsightCard
        insight={insight("faster")}
        onAccept={onAccept}
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });
});
