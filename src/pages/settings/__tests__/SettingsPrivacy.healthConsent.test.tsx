/**
 * Social & privacy's line about the health-details agreement (Priv1 call
 * 1): when the account agreed, that withdrawing is deleting the account,
 * and the way to Account's Delete account.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  HEALTH_CONSENT_SETTINGS_COPY,
  HEALTH_DATA_CONSENT_VERSION,
} from "@/lib/healthConsent";
import { formatDayMonthYear } from "@/utils/formatters";

const day = new Date(2026, 10, 21, 10, 30);
const auth = vi.hoisted(() => ({
  profile: { uid: "u1" } as Record<string, unknown>,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1" },
    profile: auth.profile,
    updateProfile: vi.fn(),
    updateShareDefaults: vi.fn(),
    refreshProfile: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("@/hooks/usePrivacyZones", () => ({
  usePrivacyZones: () => ({ zones: [], addZone: vi.fn(), removeZone: vi.fn() }),
}));
vi.mock("@/components/settings/PrivacySection", () => ({
  default: () => null,
}));
vi.mock("@/components/settings/RestrictionExplainer", () => ({
  default: () => null,
}));
vi.mock("@/lib/settingsAnalytics", () => ({ track: vi.fn() }));

import SettingsPrivacy from "../SettingsPrivacy";

function Where() {
  const location = useLocation();
  return (
    <output aria-label="Current route">
      {location.pathname}
      {location.hash}
    </output>
  );
}

function show() {
  render(
    <MemoryRouter initialEntries={["/settings/privacy"]}>
      <SettingsPrivacy />
      <Where />
    </MemoryRouter>
  );
}

afterEach(cleanup);

describe("Social & privacy, the health-details agreement", () => {
  it("says when the account agreed and how to withdraw, and opens Delete account", () => {
    auth.profile = {
      uid: "u1",
      healthDataConsent: {
        at: { toDate: () => day },
        version: HEALTH_DATA_CONSENT_VERSION,
      },
    };
    show();
    const row = screen.getByRole("button", {
      name: new RegExp(`^${HEALTH_CONSENT_SETTINGS_COPY.label}`),
    });
    expect(row).toHaveTextContent(
      `Agreed on ${formatDayMonthYear(day)}. ${HEALTH_CONSENT_SETTINGS_COPY.withdraw}`
    );
    fireEvent.click(row);
    expect(screen.getByLabelText("Current route")).toHaveTextContent(
      "/settings/account#delete-account"
    );
  });

  it("has no line for an account with no agreement", () => {
    auth.profile = { uid: "u1" };
    show();
    // Anchor: the page drew its other rows.
    expect(
      screen.getByRole("button", { name: /^Hidden posts/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: new RegExp(`^${HEALTH_CONSENT_SETTINGS_COPY.label}`),
      })
    ).not.toBeInTheDocument();
  });
});
