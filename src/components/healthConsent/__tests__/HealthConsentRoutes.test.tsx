/**
 * What an account without the health-details agreement reaches before the
 * app (Priv1 call 1). App routes here on the profile it holds, which can be
 * this device's copy from before the person agreed elsewhere: the account
 * is read again first, so the question never flashes for someone who has
 * agreed, and Account (where Delete account is) leads back to it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HealthConsentRoutes from "@/components/healthConsent/HealthConsentRoutes";
import {
  HEALTH_CONSENT_COPY,
  HEALTH_DATA_CONSENT_VERSION,
} from "@/lib/healthConsent";
import { agreeToHealthData } from "@/lib/healthConsentWrite";

const { refreshProfile, signOut } = vi.hoisted(() => ({
  refreshProfile: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u1" }, refreshProfile, signOut }),
}));
vi.mock("@/lib/healthConsentWrite", () => ({
  agreeToHealthData: vi.fn().mockResolvedValue("saved"),
}));
vi.mock("@/pages/settings/SettingsAccount", () => ({
  default: ({ back }: { back?: { to: string; label: string } }) => (
    <p>
      Account, back to {back?.label} at {back?.to}
    </p>
  ),
}));

function show(at = "/") {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <HealthConsentRoutes />
    </MemoryRouter>
  );
}

beforeEach(() => {
  refreshProfile.mockReset().mockResolvedValue(undefined);
  signOut.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("HealthConsentRoutes", () => {
  it("reads the account again before it asks", async () => {
    let answer!: () => void;
    refreshProfile.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          answer = resolve;
        })
    );
    show();
    expect(
      screen.getByRole("status", { name: "Loading Tropos" })
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: HEALTH_CONSENT_COPY.title })
    ).not.toBeInTheDocument();
    expect(refreshProfile).toHaveBeenCalledTimes(1);
    answer();
    expect(
      await screen.findByRole("heading", { name: HEALTH_CONSENT_COPY.title })
    ).toBeInTheDocument();
  });

  it("asks from the copy it holds when the account cannot be read", async () => {
    refreshProfile.mockRejectedValueOnce(new Error("offline"));
    show();
    expect(
      await screen.findByRole("heading", { name: HEALTH_CONSENT_COPY.title })
    ).toBeInTheDocument();
  });

  it("asks wherever the app was opened", async () => {
    show("/run/abc");
    expect(
      await screen.findByRole("heading", { name: HEALTH_CONSENT_COPY.title })
    ).toBeInTheDocument();
  });

  it("opens Account with its way back to the agreement", async () => {
    show("/settings/account");
    expect(
      await screen.findByText("Account, back to Health details at /")
    ).toBeInTheDocument();
  });

  it("reads the account until it shows the agreement, once it is written", async () => {
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: HEALTH_CONSENT_COPY.agree })
    );
    await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(2));
    expect(agreeToHealthData).toHaveBeenCalledWith("u1");
    const until = refreshProfile.mock.calls[1][0]?.until as (
      data: Record<string, unknown>
    ) => boolean;
    expect(until({})).toBe(false);
    expect(
      until({
        healthDataConsent: { at: null, version: HEALTH_DATA_CONSENT_VERSION },
      })
    ).toBe(true);
  });
});
