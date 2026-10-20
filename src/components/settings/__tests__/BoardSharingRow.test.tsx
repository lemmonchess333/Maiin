/**
 * Settings → Social & privacy → "Show my week on friends' boards" (Polish2
 * call 5): off until the person says yes, and the answer is the server's
 * to store, so the switch goes through the callable and reads the profile
 * again.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  act,
  render,
  screen,
  cleanup,
  fireEvent,
} from "@testing-library/react";

const H = vi.hoisted(() => ({
  share: vi.fn(async (_share: boolean) => {}),
  toastError: vi.fn(),
  restrictedToast: vi.fn(),
}));
vi.mock("@/lib/boardSharing", () => ({
  setBoardSharing: (share: boolean) => H.share(share),
}));
vi.mock("@/lib/accountRestriction", () => ({
  isRestrictedRefusal: (err: { code?: string }) =>
    err?.code === "functions/failed-precondition",
  showRestrictedToast: () => H.restrictedToast(),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: H.toastError } }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import BoardSharingRow from "../BoardSharingRow";

beforeEach(() => {
  H.share.mockReset().mockResolvedValue(undefined);
  H.toastError.mockClear();
  H.restrictedToast.mockClear();
});
afterEach(cleanup);

function renderWith(shared: boolean | undefined) {
  const refreshProfile = vi.fn().mockResolvedValue(undefined);
  render(<BoardSharingRow shared={shared} refreshProfile={refreshProfile} />);
  return {
    refreshProfile,
    toggle: screen.getByRole("switch", {
      name: "Toggle showing my week on friends' boards",
    }),
  };
}

describe("BoardSharingRow", () => {
  it.each([
    { label: "that never chose", stored: undefined, checked: "false" },
    { label: "that shares", stored: true, checked: "true" },
    { label: "that said no", stored: false, checked: "false" },
  ])("an account $label shows aria-checked $checked", ({ stored, checked }) => {
    const { toggle } = renderWith(stored);
    expect(toggle).toHaveAttribute("aria-checked", checked);
  });

  it.each([
    { label: "that never chose", stored: undefined, next: true },
    { label: "that said no", stored: false, next: true },
    { label: "that shares", stored: true, next: false },
  ])(
    "a tap for an account $label sends $next and reads the profile again",
    async ({ stored, next }) => {
      const { toggle, refreshProfile } = renderWith(stored);
      await act(async () => {
        fireEvent.click(toggle);
      });
      expect(H.share).toHaveBeenCalledWith(next);
      expect(refreshProfile).toHaveBeenCalledOnce();
    }
  );

  it("shows the answer it is waiting for, and only one at a time", async () => {
    let land!: () => void;
    H.share.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          land = resolve;
        })
    );
    const { toggle } = renderWith(undefined);
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(H.share).toHaveBeenCalledOnce();
    await act(async () => {
      land();
    });
  });

  it("a refusal goes back to the stored answer and says why", async () => {
    H.share.mockRejectedValueOnce(new Error("offline"));
    const { toggle } = renderWith(undefined);
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(H.toastError).toHaveBeenCalledWith(
      "Couldn't change who sees your week. Try again."
    );
  });

  it("a restricted account hears that, not a retry", async () => {
    H.share.mockRejectedValueOnce({ code: "functions/failed-precondition" });
    const { toggle } = renderWith(undefined);
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(H.restrictedToast).toHaveBeenCalledOnce();
    expect(H.toastError).not.toHaveBeenCalled();
  });
});
