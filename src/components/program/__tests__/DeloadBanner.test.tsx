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

  /* Active copy must describe the recipe the deload actually applied
     (backlog #8 tier split, mirrored client + server): beginner/unknown
     cuts a set AND load; intermediate/advanced cuts a set and targets at
     HELD load. The old fixed "lighter weights" sentence was false for
     every post-novice user (evidence-handoff LIFT-EV-03). Both matrices
     assert the WRONG tier's sentence absent, not just the right one
     present — the copy must never say two contradictory things. */
  it.each(["beginner", undefined] as const)(
    "active copy for %s promises lighter weights (the novice recipe cuts load)",
    (experience) => {
      render(
        <DeloadBanner
          visible
          weekKey="w20"
          deloadActive
          experience={experience}
        />
      );
      expect(screen.getByText(/lighter weights/i)).toBeInTheDocument();
      expect(screen.queryByText(/at the same weights/i)).toBeNull();
    }
  );

  it.each(["intermediate", "advanced"] as const)(
    "active copy for %s says same weights, lower volume (the post-novice recipe holds load)",
    (experience) => {
      render(
        <DeloadBanner
          visible
          weekKey="w21"
          deloadActive
          experience={experience}
        />
      );
      expect(screen.getByText(/at the same weights/i)).toBeInTheDocument();
      expect(screen.queryByText(/lighter weights/i)).toBeNull();
    }
  );

  it("an ACTIVE deload confirms even when nothing recommends one", () => {
    /**
     * The automatic week-4 deload sets `programState.currentPhase ===
     * "deload"` server-side without the week's performance doc
     * recommending anything. Before 2026-08-10 the gate was
     * `visible && (…)`, so the active confirmation was a strict SUBSET of
     * the recommendation and those users saw nothing at all — not the
     * banner, not the tier-split copy LIFT-EV-03 wrote for them.
     */
    render(<DeloadBanner visible={false} weekKey="w4" deloadActive />);
    expect(screen.getByText(/deload week active/i)).toBeTruthy();
  });
});

/**
 * The active copy must name the RUN half too.
 *
 * Since the deload grew a run half (#1930) the confirmation described
 * only the lift recipe, while the athlete's Tuesday tempo had quietly
 * become a shorter one. The applied rule requires a reduction to "state
 * whether sets, reps, load, exercise stress, or schedule changed"; a run
 * swap changes exercise stress.
 *
 * Same shape as LIFT-EV-03, already resolved once for the lift recipe —
 * the run half reintroduced it on a new axis.
 *
 * The count is zero for the AUTOMATIC week-4 deload, which goes through
 * `advanceWeek` and never touches runDays. Silence is correct there, so
 * the same component ends up truthful about whichever deload the athlete
 * is actually in.
 */
describe("DeloadBanner — the active copy names the run half", () => {
  it("adds the run clause when the deload stepped runs down", () => {
    render(
      <DeloadBanner
        visible
        weekKey="w30"
        deloadActive
        runsEased={3}
        experience="intermediate"
      />
    );
    expect(
      screen.getByText(/3 runs are a step shorter too/i)
    ).toBeInTheDocument();
    // and the lift half is still described
    expect(screen.getByText(/at the same weights/i)).toBeInTheDocument();
  });

  it("says ONE run, singular", () => {
    render(
      <DeloadBanner
        visible
        weekKey="w31"
        deloadActive
        runsEased={1}
        experience="beginner"
      />
    );
    expect(
      screen.getByText(/One run is a step shorter too/i)
    ).toBeInTheDocument();
  });

  it("stays silent for a lift-only deload", () => {
    /* The automatic week-4 path. Mentioning runs here would be the
       mirror-image lie of the one this fixes. */
    render(
      <DeloadBanner
        visible
        weekKey="w32"
        deloadActive
        runsEased={0}
        experience="intermediate"
      />
    );
    expect(screen.queryByText(/step shorter/i)).toBeNull();
    expect(screen.getByText(/at the same weights/i)).toBeInTheDocument();
  });

  it("stays silent when the count is not supplied at all", () => {
    // Every other DeloadBanner call site omits the prop; none of them
    // should start claiming a run change.
    render(
      <DeloadBanner visible weekKey="w33" deloadActive experience="advanced" />
    );
    expect(screen.queryByText(/step shorter/i)).toBeNull();
  });

  it("never appears on the RECOMMENDATION state", () => {
    // Nothing has been applied yet, so there is no run change to report.
    render(
      <DeloadBanner
        visible
        weekKey="w34"
        runsEased={3}
        experience="intermediate"
        onApply={async () => true}
      />
    );
    expect(screen.queryByText(/step shorter/i)).toBeNull();
  });
});
