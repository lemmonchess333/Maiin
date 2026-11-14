/**
 * "Your year with Pro" (App1 Q56): a row on Home in the week before a
 * yearly renewal, opening the recap full screen on a tap, recorded on the
 * account once the year has drawn so it shows once on every device.
 * When it is due is `yearRecapDue`'s, tested in proReport.test.ts.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const DAY = 86_400_000;
const mockUpdateProfile = vi.fn(async () => ({ ok: true }));
let mockProfile: Record<string, unknown> | null = null;
let mockYear: {
  loading: boolean;
  failed: boolean;
  data: unknown;
  retry: () => void;
};

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1" },
    profile: mockProfile,
    updateProfile: mockUpdateProfile,
  }),
}));
vi.mock("@/hooks/useYearRecap", () => ({
  useYearRecap: () => mockYear,
}));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));
vi.mock("@/components/share/ShareCardSheet", () => ({ default: () => null }));

import YearRecapRow from "../YearRecapRow";

function yearly(store = "app_store", period = "year") {
  const renews = new Date(Date.now() + 3 * DAY).toISOString();
  return {
    subscriptionTier: "pro",
    subscriptionExpiresAt: renews,
    revenueCat: {
      entitlementActive: true,
      productId: "com.tropos.app.pro.yearly",
      store,
      expiresAt: renews,
      period,
      willRenew: true,
      periodType: "normal",
    },
  };
}

const YEAR = {
  training: { lifts: 120, runs: 80, km: 640.5, bests: 14, tonnageKg: 900000 },
  lines: [{ kind: "photo_scans", count: 210 }],
};

function renderRow() {
  return render(
    <MemoryRouter>
      <YearRecapRow />
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  mockProfile = null;
  mockUpdateProfile.mockClear();
});

describe("YearRecapRow", () => {
  it("shows nothing when no yearly renewal is a week away", () => {
    mockProfile = yearly("app_store", "month");
    mockYear = { loading: false, failed: false, data: YEAR, retry: vi.fn() };
    renderRow();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("opens the year on a tap, then records it for this renewal", async () => {
    mockProfile = yearly();
    mockYear = { loading: false, failed: false, data: YEAR, retry: vi.fn() };
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: /Your year with Pro/ }));
    expect(
      await screen.findByRole("heading", { name: "Your year", level: 2 })
    ).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(
      screen.getByText("sessions, 120 lifts and 80 runs")
    ).toBeInTheDocument();
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1));
    const key = (
      mockUpdateProfile.mock.calls[0] as unknown as [
        { yearRecapShownFor: string },
      ]
    )[0].yearRecapShownFor;
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // What Pro did over it, the day it renews and where to manage it.
    expect(screen.getByText("210")).toBeInTheDocument();
    expect(screen.getByText(/^Your Pro year renews on /)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Pro" })).toHaveAttribute(
      "href",
      "https://apps.apple.com/account/subscriptions"
    );
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Your year" })).toBeNull()
    );
  });

  it("sends a plan bought on the website to Account to manage", async () => {
    mockProfile = yearly("rc_billing");
    mockYear = { loading: false, failed: false, data: YEAR, retry: vi.fn() };
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: /Your year with Pro/ }));
    expect(
      await screen.findByRole("link", { name: "Manage Pro" })
    ).toHaveAttribute("href", "/settings/account");
  });

  it("records nothing when the year could not be read, so the row stays", async () => {
    mockProfile = yearly();
    const retry = vi.fn();
    mockYear = { loading: false, failed: true, data: null, retry };
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: /Your year with Pro/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t load your year"
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
});
