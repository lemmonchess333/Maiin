// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  prefs: { enabled: true, primingShown: false },
  requestPermission: vi.fn(async () => true),
  updatePrefs: vi.fn(async () => {}),
}));

vi.mock("@/hooks/RemindersProvider", () => ({
  useStreakReminder: () => ({
    prefs: h.prefs,
    loading: false,
    requestPermission: h.requestPermission,
    updatePrefs: h.updatePrefs,
  }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("../FirstWeekReturnOffer", () => ({
  default: () => <p>First-week offer</p>,
}));

import CompletionReminderChoice from "../CompletionReminderChoice";

beforeEach(() => {
  vi.clearAllMocks();
  h.prefs = { enabled: true, primingShown: false };
  h.requestPermission.mockResolvedValue(true);
});

describe("saved-session reminder control", () => {
  it("shows a legacy preference as off until permission is confirmed", async () => {
    render(
      <CompletionReminderChoice kind="lift" activationJourneyV2={false} />
    );
    const toggle = screen.getByRole("switch", {
      name: "Evening reminder if you haven't logged",
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(h.updatePrefs).toHaveBeenCalledWith({
        enabled: true,
        primingShown: true,
      })
    );
  });

  it("leaves the legacy control off when system permission is denied", async () => {
    h.requestPermission.mockResolvedValue(false);
    render(<CompletionReminderChoice kind="run" activationJourneyV2={false} />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(h.requestPermission).toHaveBeenCalledOnce());
    expect(h.updatePrefs).not.toHaveBeenCalled();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("shows the optional offer in the new journey", () => {
    render(<CompletionReminderChoice kind="run" activationJourneyV2 />);
    expect(screen.getByText("First-week offer")).toBeVisible();
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
