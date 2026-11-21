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
  HEALTH_CONSENT_SAVE_FAILED,
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
vi.mock("@/pages/PrivacyPolicy", () => ({ default: () => <h1>Privacy</h1> }));
vi.mock("@/pages/TermsOfService", () => ({ default: () => <h1>Terms</h1> }));
vi.mock("@/pages/Support", () => ({ default: () => <h1>Support</h1> }));
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

  /* Agreeing is informed only if the policy can be read first: the legal
     pages open as they do in setup, not under the agreement. */
  it.each([
    ["/privacy", "Privacy"],
    ["/terms", "Terms"],
    ["/support", "Support"],
  ])("opens %s, not the agreement", async (at, heading) => {
    show(at);
    expect(
      await screen.findByRole("heading", { name: heading })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: HEALTH_CONSENT_COPY.title })
    ).not.toBeInTheDocument();
  });

  it("opens Account with its way back to the agreement", async () => {
    show("/settings/account");
    expect(
      await screen.findByText("Account, back to Health details at /")
    ).toBeInTheDocument();
  });

  it("says so when the account, read again, never shows the agreement", async () => {
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: HEALTH_CONSENT_COPY.agree })
    );
    // The mock read hands back no agreement on any attempt.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      HEALTH_CONSENT_SAVE_FAILED
    );
  });

  it("goes on quietly when a read shows the agreement", async () => {
    refreshProfile.mockImplementation(
      async (options?: {
        until?: (data: Record<string, unknown>) => boolean;
      }) => {
        options?.until?.({
          healthDataConsent: { at: null, version: HEALTH_DATA_CONSENT_VERSION },
        });
      }
    );
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: HEALTH_CONSENT_COPY.agree })
    );
    await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: HEALTH_CONSENT_COPY.agree })
      ).not.toHaveAttribute("aria-busy")
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
