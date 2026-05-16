/**
 * PR-0d: ConfigurePlanModal initialStep + hydration contract.
 *
 * Two properties pinned here that the inline `useState(profile.xxx)`
 * initialisers couldn't deliver alone:
 *
 *   1. initialStep opens directly on the requested step (the run-
 *      mode chips in ProgrammeRunSection pass CONFIGURE_PLAN_RUNNING_STEP
 *      so the user lands in the run-config view rather than the top
 *      of the wizard).
 *
 *   2. Draft state hydrates from `profile` on every open transition,
 *      NOT just first mount. The modal returns null when !open but
 *      does not unmount — so if the user opens, closes, profile is
 *      edited by another path, and they reopen, the draft must
 *      reflect the new profile, not the stale first-mount snapshot.
 *
 * The Cloud Function callable and Firebase functions module are
 * mocked so the modal renders standalone.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ConfigurePlanModal, {
  CONFIGURE_PLAN_RUNNING_STEP,
} from "../ConfigurePlanModal";
import type { UserProfile } from "@/lib/auth";

// Mock firebase/functions so the dynamic httpsCallable import inside
// handleConfirm doesn't try to initialise the real SDK during render.
vi.mock("firebase/functions", () => ({
  httpsCallable: () => vi.fn(async () => ({ data: {} })),
}));

vi.mock("@/lib/firebase", () => ({
  functions: {},
  db: {},
  auth: {},
  storage: {},
}));

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u-1",
    displayName: "Test",
    email: "t@example.com",
    primaryGoal: "hypertrophy",
    weeklyWorkoutsTarget: 4,
    preferredSplit: "ppl",
    runMode: "freeform",
    weeklyRunDaysTarget: 2,
    program: { goal: "recomp" },
    ...overrides,
  } as UserProfile;
}

beforeEach(() => {
  cleanup();
});

describe("ConfigurePlanModal — initialStep prop", () => {
  it("defaults to step 0 (Training focus) when initialStep is omitted", () => {
    render(
      <ConfigurePlanModal
        open={true}
        onClose={() => {}}
        profile={makeProfile()}
        programState={null}
      />,
    );
    // Step header / step indicator
    expect(screen.getByText(/Training focus/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of/i)).toBeInTheDocument();
  });

  it("opens directly on the Running step when initialStep=CONFIGURE_PLAN_RUNNING_STEP", () => {
    render(
      <ConfigurePlanModal
        open={true}
        onClose={() => {}}
        profile={makeProfile()}
        programState={null}
        initialStep={CONFIGURE_PLAN_RUNNING_STEP}
      />,
    );

    // Step indicator says step N+1 of 6 — CONFIGURE_PLAN_RUNNING_STEP
    // is 3, so step 4 of 6 visible.
    expect(
      screen.getByText(
        new RegExp("Step " + (CONFIGURE_PLAN_RUNNING_STEP + 1) + " of"),
      ),
    ).toBeInTheDocument();

    // Running step content visible: all three mode option labels.
    expect(screen.getByText(/Freeform/i)).toBeInTheDocument();
    expect(screen.getByText(/^Structured$/i)).toBeInTheDocument();
    expect(screen.getByText(/Race prep/i)).toBeInTheDocument();

    // The step-0 "Training focus" header should NOT be visible.
    expect(screen.queryByText(/Training focus/i)).not.toBeInTheDocument();
  });
});

describe("ConfigurePlanModal — hydration on every open", () => {
  it("draft state re-reads from profile each time `open` flips to true", () => {
    const profileA = makeProfile({ runMode: "freeform" });
    const profileB = makeProfile({ runMode: "structured" });

    // Initial mount: closed.
    const { rerender } = render(
      <ConfigurePlanModal
        open={false}
        onClose={() => {}}
        profile={profileA}
        programState={null}
        initialStep={CONFIGURE_PLAN_RUNNING_STEP}
      />,
    );

    // OptionCard renders a `lucide-check` icon inside the button
    // when selected. We assert on that as the visible selection
    // indicator.
    const isSelected = (label: RegExp): boolean => {
      const btn = screen.getByText(label).closest("button");
      return !!btn?.querySelector(".lucide-check");
    };

    // Open with profileA — runMode "freeform" should be selected.
    rerender(
      <ConfigurePlanModal
        open={true}
        onClose={() => {}}
        profile={profileA}
        programState={null}
        initialStep={CONFIGURE_PLAN_RUNNING_STEP}
      />,
    );
    expect(isSelected(/Freeform/i)).toBe(true);
    expect(isSelected(/^Structured$/i)).toBe(false);

    // Close.
    rerender(
      <ConfigurePlanModal
        open={false}
        onClose={() => {}}
        profile={profileA}
        programState={null}
        initialStep={CONFIGURE_PLAN_RUNNING_STEP}
      />,
    );

    // Re-open with profileB (runMode changed externally to "structured").
    // Without the hydration effect, the draft would still hold
    // freeform from the first-mount initialiser. With the effect,
    // the draft refreshes to reflect profileB.
    rerender(
      <ConfigurePlanModal
        open={true}
        onClose={() => {}}
        profile={profileB}
        programState={null}
        initialStep={CONFIGURE_PLAN_RUNNING_STEP}
      />,
    );

    expect(isSelected(/^Structured$/i)).toBe(true);
    expect(isSelected(/Freeform/i)).toBe(false);
  });
});
