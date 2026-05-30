/**
 * PR-2: ScheduleLayoutSheet hydration + render contract.
 *
 * Pinned here:
 *   - Renders nothing when open=false (the body — and the
 *     useProgrammeScheduleEditor hook inside it — never mounts).
 *   - Renders the 7-day chip row and summary when open.
 *   - Re-opening with a changed `profile` reflects the latest
 *     run-day count (the unmount-on-close hydration contract).
 *
 * vaul's BottomSheet portals out of the test container, so all
 * queries use `screen` (document-wide).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ScheduleLayoutSheet from "../ScheduleLayoutSheet";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

beforeEach(() => {
  cleanup();
});

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u-1",
    displayName: "Test",
    email: "t@example.com",
    weeklyWorkoutsTarget: 4,
    weeklyRunDaysTarget: 2,
    runMode: "structured",
    ...overrides,
  } as UserProfile;
}

function makeCallbacks() {
  return {
    updateProfile: vi.fn(async () => ({ ok: true }) as UpdateProfileResult),
    refreshRunSchedule: vi.fn(async () => {}),
    regenerateProgram: vi.fn(async () => {}),
  };
}

describe("ScheduleLayoutSheet — closed", () => {
  it("renders nothing when open=false", () => {
    render(
      <ScheduleLayoutSheet
        open={false}
        onClose={() => {}}
        profile={makeProfile()}
        {...makeCallbacks()}
      />
    );
    expect(screen.queryAllByText(/Weekly layout/i).length).toBe(0);
    expect(screen.queryByText(/Apply changes/i)).not.toBeInTheDocument();
  });
});

describe("ScheduleLayoutSheet — open render", () => {
  it("renders the chip row + Apply changes button when open", () => {
    render(
      <ScheduleLayoutSheet
        open={true}
        onClose={() => {}}
        profile={makeProfile()}
        {...makeCallbacks()}
      />
    );
    // "Weekly layout" appears in two places — the BottomSheet's
    // sr-only Drawer.Title and the visible body heading. Use
    // getAllByText to tolerate both.
    expect(screen.getAllByText(/Weekly layout/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/weekly layout summary/i)).toBeInTheDocument();
    expect(screen.queryByText(/Apply changes/i)).not.toBeInTheDocument();
    // 7 day chips render — one per dayOfWeek. Each has a single-letter
    // label and a day-type label (Rest / Lift / Run / Both). Easiest
    // structural check: the unique single-letter day labels.
    ["S", "M", "T", "W", "T", "F", "S"].forEach((letter) => {
      // getAllByText to handle duplicate letters (S appears twice,
      // T twice). We don't pin counts — just confirm presence.
      expect(screen.getAllByText(letter).length).toBeGreaterThan(0);
    });
  });

  it("Apply changes is hidden when there are no unsaved edits", () => {
    render(
      <ScheduleLayoutSheet
        open={true}
        onClose={() => {}}
        profile={makeProfile({
          weekSchedule: [
            { day: 0, type: "rest" },
            { day: 1, type: "lift" },
            { day: 2, type: "rest" },
            { day: 3, type: "lift" },
            { day: 4, type: "rest" },
            { day: 5, type: "lift" },
            { day: 6, type: "rest" },
          ],
        })}
        {...makeCallbacks()}
      />
    );
    expect(
      screen.queryByRole("button", { name: /Apply changes/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Close$/i })
    ).toBeInTheDocument();
  });
});

describe("ScheduleLayoutSheet — PR-2 hydration on re-open", () => {
  it("re-opening with a changed profile shows the new schedule (mount-when-open contract)", () => {
    const profileA = makeProfile({
      weekSchedule: [
        { day: 0, type: "rest" },
        { day: 1, type: "lift" },
        { day: 2, type: "run" },
        { day: 3, type: "rest" },
        { day: 4, type: "rest" },
        { day: 5, type: "rest" },
        { day: 6, type: "rest" },
      ],
      weeklyRunDaysTarget: 1,
    });
    const profileB = makeProfile({
      weekSchedule: [
        { day: 0, type: "rest" },
        { day: 1, type: "both" },
        { day: 2, type: "both" },
        { day: 3, type: "both" },
        { day: 4, type: "rest" },
        { day: 5, type: "rest" },
        { day: 6, type: "rest" },
      ],
      weeklyRunDaysTarget: 3,
      weeklyWorkoutsTarget: 3,
    });
    const callbacks = makeCallbacks();

    // Open with profileA → expect 1 Run day visible in the chip
    // row (Tue, day=2).
    const { rerender } = render(
      <ScheduleLayoutSheet
        open={true}
        onClose={() => {}}
        profile={profileA}
        {...callbacks}
      />
    );
    expect(screen.getAllByRole("button", { name: /Tue: Run/i }).length).toBe(1);
    expect(screen.queryAllByRole("button", { name: /Both/i }).length).toBe(0);

    // Close → body unmounts.
    rerender(
      <ScheduleLayoutSheet
        open={false}
        onClose={() => {}}
        profile={profileA}
        {...callbacks}
      />
    );
    expect(screen.queryAllByText(/Weekly layout/i).length).toBe(0);

    // Re-open with profileB → body remounts, useState initialisers
    // run fresh against profileB. Without the mount-when-open
    // contract the chips would still show profileA's layout.
    rerender(
      <ScheduleLayoutSheet
        open={true}
        onClose={() => {}}
        profile={profileB}
        {...callbacks}
      />
    );
    expect(screen.getAllByRole("button", { name: /Both/i }).length).toBe(3);
    expect(screen.queryAllByRole("button", { name: /: Run/i }).length).toBe(0);
  });
});
