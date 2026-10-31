// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import ScheduleLayoutSheet from "../ScheduleLayoutSheet";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

afterEach(cleanup);

const profile = {
  uid: "u1",
  weeklyWorkoutsTarget: 4,
  weeklyRunDaysTarget: 0,
  runMode: "freeform",
  weekSchedule: [
    { day: 0, type: "rest" },
    { day: 1, type: "lift" },
    { day: 2, type: "rest" },
    { day: 3, type: "lift" },
    { day: 4, type: "lift" },
    { day: 5, type: "lift" },
    { day: 6, type: "rest" },
  ],
} as UserProfile;

function setup(updateResult: UpdateProfileResult = { ok: true }) {
  const callbacks = {
    onClose: vi.fn(),
    onSaved: vi.fn(),
    updateProfile: vi.fn(async () => updateResult),
    refreshRunSchedule: vi.fn(async () => {}),
    regenerateProgram: vi.fn(async () => {}),
  };
  const view = render(
    <ScheduleLayoutSheet open guided profile={profile} {...callbacks} />
  );
  return { ...callbacks, ...view };
}

function chooseTuesdayRun() {
  fireEvent.click(screen.getByRole("button", { name: /Tue: Rest/ }));
  fireEvent.click(screen.getByRole("button", { name: /Tue: Lift/ }));
}

describe("guided usual-week change", () => {
  it("requires an accurate recurring-scope review before the profile write", async () => {
    const callbacks = setup();
    chooseTuesdayRun();
    expect(callbacks.updateProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Review change" }));
    expect(screen.getByText(/not a one-week adjustment/i)).toBeVisible();
    expect(screen.getByText("Rest → Run")).toBeVisible();
    expect(screen.getByText("4 → 4")).toBeVisible();
    expect(screen.getByText("0 → 1")).toBeVisible();
    expect(callbacks.updateProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm usual week" }));
    await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledOnce());
    expect(callbacks.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        weeklyWorkoutsTarget: 4,
        weeklyRunDaysTarget: 1,
        weekSchedule: expect.arrayContaining([{ day: 2, type: "run" }]),
      })
    );
    expect(callbacks.onClose).toHaveBeenCalledOnce();
  });

  it("retains the separate rebuild confirmation when lift-day count changes", async () => {
    const callbacks = setup();
    fireEvent.click(screen.getByRole("button", { name: /Tue: Rest/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review change" }));
    expect(screen.getByText("4 → 5")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Confirm usual week" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(callbacks.regenerateProgram).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledOnce());
    expect(callbacks.regenerateProgram).toHaveBeenCalledWith(
      undefined,
      5,
      expect.objectContaining({
        weekSchedule: expect.arrayContaining([{ day: 2, type: "lift" }]),
      })
    );
  });

  it("blocks a draft when the source profile changes while it is open", () => {
    const callbacks = setup();
    chooseTuesdayRun();
    fireEvent.click(screen.getByRole("button", { name: "Review change" }));
    callbacks.rerender(
      <ScheduleLayoutSheet
        open
        guided
        profile={{ ...profile, weeklyRunDaysTarget: 2 }}
        onClose={callbacks.onClose}
        onSaved={callbacks.onSaved}
        updateProfile={callbacks.updateProfile}
        refreshRunSchedule={callbacks.refreshRunSchedule}
        regenerateProgram={callbacks.regenerateProgram}
      />
    );
    expect(
      screen.getByText(
        "Your plan changed while this was open. Close it and try again."
      )
    ).toBeVisible();
    expect(
      screen.getByText("This changes every week from now on.")
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confirm usual week" })
    ).toBeDisabled();
    expect(callbacks.updateProfile).not.toHaveBeenCalled();
  });

  it("does not carry a draft into another account with the same layout", () => {
    const callbacks = setup();
    chooseTuesdayRun();
    callbacks.rerender(
      <ScheduleLayoutSheet
        open
        guided
        profile={{ ...profile, uid: "u2" }}
        onClose={callbacks.onClose}
        onSaved={callbacks.onSaved}
        updateProfile={callbacks.updateProfile}
        refreshRunSchedule={callbacks.refreshRunSchedule}
        regenerateProgram={callbacks.regenerateProgram}
      />
    );
    expect(
      screen.getByRole("button", { name: "Review change" })
    ).toBeDisabled();
    expect(callbacks.updateProfile).not.toHaveBeenCalled();
  });

  it("blocks a rebuild if the profile changes after its final confirmation opens", async () => {
    const callbacks = setup();
    fireEvent.click(screen.getByRole("button", { name: /Tue: Rest/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review change" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm usual week" }));
    await waitFor(() =>
      expect(
        screen.getByRole("alertdialog", { name: "Restructure programme?" })
      ).toBeVisible()
    );
    callbacks.rerender(
      <ScheduleLayoutSheet
        open
        guided
        profile={{ ...profile, weeklyRunDaysTarget: 2 }}
        onClose={callbacks.onClose}
        onSaved={callbacks.onSaved}
        updateProfile={callbacks.updateProfile}
        refreshRunSchedule={callbacks.refreshRunSchedule}
        regenerateProgram={callbacks.regenerateProgram}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(callbacks.regenerateProgram).not.toHaveBeenCalled();
    expect(callbacks.onSaved).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Confirm usual week" })
    ).toBeDisabled();
  });

  it("asks before discarding a dirty guided draft", () => {
    const callbacks = setup();
    fireEvent.click(screen.getByRole("button", { name: /Tue: Rest/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const dialog = screen.getByRole("alertdialog");
    expect(callbacks.onClose).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep editing" })
    );
    expect(
      screen.getByRole("button", { name: /Tue: Lift/ })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(callbacks.onClose).toHaveBeenCalledOnce();
    expect(callbacks.updateProfile).not.toHaveBeenCalled();
  });

  it("keeps a failed save on the preview without claiming completion", async () => {
    const callbacks = setup({ ok: false, error: new Error("unavailable") });
    chooseTuesdayRun();
    fireEvent.click(screen.getByRole("button", { name: "Review change" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm usual week" }));
    await waitFor(() => expect(callbacks.updateProfile).toHaveBeenCalledOnce());
    expect(callbacks.onSaved).not.toHaveBeenCalled();
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Confirm usual week" })
    ).toBeEnabled();
  });
});
