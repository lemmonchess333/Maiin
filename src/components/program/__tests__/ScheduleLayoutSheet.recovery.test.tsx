import { useState } from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
  act,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScheduleLayoutSheet from "../ScheduleLayoutSheet";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

afterEach(cleanup);

const profile = {
  uid: "audit",
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

function setup(result: UpdateProfileResult = { ok: true }) {
  const updateProfile = vi.fn(
    async (_data: Partial<UserProfile>): Promise<UpdateProfileResult> => result
  );
  const regenerateProgram = vi.fn(async () => {});
  const onClose = vi.fn();
  function Host() {
    const [open, setOpen] = useState(true);
    return (
      <ScheduleLayoutSheet
        open={open}
        profile={profile}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        updateProfile={updateProfile}
        regenerateProgram={regenerateProgram}
        refreshRunSchedule={async () => {}}
      />
    );
  }
  render(<Host />);
  return { updateProfile, regenerateProgram, onClose };
}

describe("weekly layout save recovery", () => {
  it("keeps the new lift-day layout open for confirmation before writing", async () => {
    const callbacks = setup();
    fireEvent.click(screen.getByRole("button", { name: /Tue: Rest/i }));
    fireEvent.click(screen.getByRole("button", { name: /Apply changes/i }));
    const confirmation = await screen.findByRole("alertdialog");
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(callbacks.updateProfile).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Confirm" })
    );
    await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledTimes(1));
    expect(callbacks.regenerateProgram).toHaveBeenCalledWith(
      undefined,
      5,
      expect.objectContaining({
        weekSchedule: expect.arrayContaining([{ day: 2, type: "lift" }]),
      })
    );
  });

  it("keeps a failed same-count save editable and retries the same chosen day", async () => {
    const callbacks = setup({
      ok: false,
      error: new Error("permission-denied"),
    });
    fireEvent.click(screen.getByRole("button", { name: /Tue: Rest/i }));
    fireEvent.click(screen.getByRole("button", { name: /Tue: Lift/i }));
    fireEvent.click(screen.getByRole("button", { name: /Apply changes/i }));
    await waitFor(() =>
      expect(callbacks.updateProfile).toHaveBeenCalledTimes(1)
    );
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Tue: Run/i })
    ).toBeInTheDocument();
    callbacks.updateProfile.mockResolvedValue({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: /Apply changes/i }));
    await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledTimes(1));
    expect(callbacks.updateProfile.mock.calls[1][0]).toEqual(
      callbacks.updateProfile.mock.calls[0][0]
    );
  });

  it("does not rebuild when saving the confirmed profile fails", async () => {
    const callbacks = setup({ ok: false, error: new Error("unavailable") });
    fireEvent.click(screen.getByRole("button", { name: /Tue: Rest/i }));
    fireEvent.click(screen.getByRole("button", { name: /Apply changes/i }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Confirm",
      })
    );
    await waitFor(() =>
      expect(callbacks.updateProfile).toHaveBeenCalledTimes(1)
    );
    expect(callbacks.regenerateProgram).not.toHaveBeenCalled();
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("retains confirmation and allows a retry when programme rebuilding fails", async () => {
    const callbacks = setup();
    callbacks.regenerateProgram.mockRejectedValueOnce(new Error("unavailable"));
    fireEvent.click(screen.getByRole("button", { name: /Tue: Rest/i }));
    fireEvent.click(screen.getByRole("button", { name: /Apply changes/i }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Confirm",
      })
    );
    await waitFor(() =>
      expect(callbacks.regenerateProgram).toHaveBeenCalledTimes(1)
    );
    expect(callbacks.onClose).not.toHaveBeenCalled();
    const confirm = await screen.findByRole("button", { name: "Confirm" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledTimes(1));
    expect(callbacks.regenerateProgram).toHaveBeenCalledTimes(2);
  });

  it("keeps the layout fixed during a pending save and accepts only one write", async () => {
    const callbacks = setup();
    let resolve!: (value: UpdateProfileResult) => void;
    callbacks.updateProfile.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    fireEvent.click(screen.getByRole("button", { name: /Tue: Rest/i }));
    fireEvent.click(screen.getByRole("button", { name: /Tue: Lift/i }));
    const apply = screen.getByRole("button", { name: /Apply changes/i });
    fireEvent.click(apply);
    fireEvent.click(apply);
    expect(callbacks.updateProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Tue: Run/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => resolve({ ok: true }));
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
  });
});
