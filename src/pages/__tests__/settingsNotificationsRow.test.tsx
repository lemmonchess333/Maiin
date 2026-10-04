/**
 * The Settings list's Notifications row names push only where there is a
 * push switch to find: on the web. The iPhone app has no remote push
 * (isRemotePushOffered), so its row says what the page holds there.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const platform = vi.hoisted(() => ({ native: false }));
vi.mock("@/lib/pushNotifications", () => ({
  isRemotePushOffered: () => !platform.native,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1", email: "runner@tropos.test" },
    profile: { uid: "u1", displayName: "Runner" },
  }),
}));
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({ isInTrial: false, trialDaysLeft: 0, tier: "free" }),
}));
vi.mock("@/components/settings/SettingsAvatar", () => ({
  default: () => null,
}));
vi.mock("@/components/settings/SettingsOfflineBanner", () => ({
  default: () => null,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import SettingsIndex from "../SettingsIndex";

// Vite defines this at build time; the unit suite does not.
vi.stubGlobal("__APP_VERSION__", "0.0.0-test");

function renderList() {
  render(
    <MemoryRouter initialEntries={["/settings"]}>
      <SettingsIndex />
    </MemoryRouter>
  );
}

beforeEach(() => {
  platform.native = false;
});
afterEach(cleanup);

describe("the Notifications row", () => {
  it("names push on the web, where the switch is", () => {
    renderList();
    expect(screen.getByText("Reminders, push, activity")).toBeInTheDocument();
  });

  it("does not name push on the native app", () => {
    platform.native = true;
    renderList();
    expect(screen.getByText("Reminders, activity")).toBeInTheDocument();
    expect(
      screen.queryByText("Reminders, push, activity")
    ).not.toBeInTheDocument();
  });
});
