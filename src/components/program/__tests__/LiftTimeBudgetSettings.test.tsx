import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LiftTimeBudgetSettings from "../LiftTimeBudgetSettings";
import type { UserProfile } from "@/lib/auth";
const success = vi.fn();
const error = vi.fn();
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (...args: unknown[]) => success(...args),
    error: (...args: unknown[]) => error(...args),
  },
}));

describe("usual lifting time save", () => {
  it("writes only the preference after review and retains a failed draft", async () => {
    success.mockClear();
    error.mockClear();
    const updateProfile = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: new Error("offline") })
      .mockResolvedValue({ ok: true });
    render(
      <LiftTimeBudgetSettings
        profile={{ uid: "owner" } as UserProfile}
        workouts={[]}
        updateProfile={updateProfile}
      />
    );
    fireEvent.change(screen.getByLabelText("Usual time for lifting"), {
      target: { value: "45" },
    });
    expect(updateProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save session time" }));
    await waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    expect(success).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Usual time for lifting")).toHaveValue("45");
    fireEvent.click(screen.getByRole("button", { name: "Save session time" }));
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(updateProfile).toHaveBeenLastCalledWith({
      liftTimeBudgetMinutes: 45,
    });
  });
  it("clears a saved budget", async () => {
    const updateProfile = vi.fn().mockResolvedValue({ ok: true });
    render(
      <LiftTimeBudgetSettings
        profile={{ uid: "owner", liftTimeBudgetMinutes: 45 } as UserProfile}
        workouts={[]}
        updateProfile={updateProfile}
      />
    );
    fireEvent.change(screen.getByLabelText("Usual time for lifting"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save session time" }));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        liftTimeBudgetMinutes: null,
      })
    );
  });
});
