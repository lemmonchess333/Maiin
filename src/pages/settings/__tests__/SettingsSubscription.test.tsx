/**
 * Settings → Subscription — the plan row says what the account is on,
 * and its tap does the one thing that makes sense for that state.
 *
 * A billed trial is a live subscription: the row shows when it ends and
 * what it becomes, and MANAGES it — never sells one. Pro shows the
 * renewal. Free and the legacy free week go to the offer page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom"
    );
  return { ...actual, useNavigate: () => navigateMock };
});

const manageMock = vi.fn();
vi.mock("@/lib/purchaseProvider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/purchaseProvider")>(
    "@/lib/purchaseProvider"
  );
  return {
    ...actual,
    manageSubscription: (...args: unknown[]) => manageMock(...args),
    isNativeIOS: () => false,
  };
});

let mockProfile: Record<string, unknown> | null = null;
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: mockProfile ? { uid: "u1" } : null,
    profile: mockProfile,
    loading: false,
  }),
  useUid: () => (mockProfile ? "u1" : null),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/components/settings/AiUsageSection", () => ({
  default: () => null,
}));
vi.mock("@/components/settings/TrackSettingsSectionView", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/settings/SettingsSection", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import SettingsSubscription from "../SettingsSubscription";

const future = (days: number) =>
  new Date(Date.now() + days * 864e5).toISOString();

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsSubscription />
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  manageMock.mockReset().mockResolvedValue({ success: true });
  mockProfile = null;
});
afterEach(cleanup);

describe("SettingsSubscription — the plan row", () => {
  it("a billed trial shows when it ends and what it becomes, and the row manages it", async () => {
    mockProfile = {
      subscriptionTier: "pro",
      subscriptionExpiresAt: future(7),
      subscriptionTrialEndsAt: new Date("2026-09-20T09:00:00Z").toISOString(),
      appleProductId: "com.tropos.app.pro.monthly",
    };
    renderPage();
    expect(screen.getByText("Free trial")).toBeInTheDocument();
    expect(
      screen.getByText("Ends 20 Sept, then £3.99/mo unless you cancel")
    ).toBeInTheDocument();
    expect(screen.getByText("Manage")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(manageMock).toHaveBeenCalledWith("u1"));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("a billed trial on an unknown product ends at the date rather than guessing a price", () => {
    mockProfile = {
      subscriptionTier: "pro",
      subscriptionExpiresAt: future(7),
      subscriptionTrialEndsAt: new Date("2026-09-20T09:00:00Z").toISOString(),
    };
    renderPage();
    expect(
      screen.getByText("Ends 20 Sept unless you cancel")
    ).toBeInTheDocument();
  });

  it("Pro shows the renewal date and manages", async () => {
    mockProfile = {
      subscriptionTier: "pro",
      subscriptionExpiresAt: new Date("2026-10-20T09:00:00Z").toISOString(),
    };
    renderPage();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("Renews 20 Oct")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(manageMock).toHaveBeenCalledTimes(1));
  });

  it("free goes to the offer page, tagged as a Settings entry", () => {
    mockProfile = { subscriptionTier: "free" };
    renderPage();
    expect(screen.getByText("Upgrade to Pro")).toBeInTheDocument();
    expect(screen.queryByText("Manage")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(navigateMock).toHaveBeenCalledWith("/upgrade?from=settings");
    expect(manageMock).not.toHaveBeenCalled();
  });

  it("the legacy free week counts down and goes to the offer page", () => {
    mockProfile = { subscriptionTier: "free", trialExpiresAt: future(3) };
    renderPage();
    expect(screen.getByText("Pro trial")).toBeInTheDocument();
    expect(screen.getByText("3 days left")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(navigateMock).toHaveBeenCalledWith("/upgrade?from=settings");
  });
});
