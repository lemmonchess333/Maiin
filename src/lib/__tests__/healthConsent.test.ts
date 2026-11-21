/**
 * The stored health-details agreement, read for Settings › Social &
 * privacy's line (Priv1 call 1): the day it was given, by the server's
 * clock, or that it was given while that date is still on its way.
 */
import { describe, expect, it } from "vitest";
import {
  HEALTH_CONSENT_SETTINGS_COPY,
  HEALTH_DATA_CONSENT_VERSION,
  healthConsentAgreedAt,
  healthConsentSettingsLine,
} from "@/lib/healthConsent";
import { formatDayMonthYear } from "@/utils/formatters";

const day = new Date(2026, 10, 21, 10, 30);
const stamped = { toDate: () => day };

describe("healthConsentAgreedAt", () => {
  it("reads the server's time", () => {
    expect(
      healthConsentAgreedAt({
        at: stamped,
        version: HEALTH_DATA_CONSENT_VERSION,
      })
    ).toEqual(day);
  });

  it("is null while the time is on its way, and for no agreement", () => {
    expect(
      healthConsentAgreedAt({ at: null, version: HEALTH_DATA_CONSENT_VERSION })
    ).toBeNull();
    expect(healthConsentAgreedAt(undefined)).toBeNull();
    expect(healthConsentAgreedAt({ at: stamped, version: 0 })).toBeNull();
    expect(
      healthConsentAgreedAt({
        at: { toDate: () => new Date(Number.NaN) },
        version: HEALTH_DATA_CONSENT_VERSION,
      })
    ).toBeNull();
  });
});

describe("healthConsentSettingsLine", () => {
  it("says the day, and how to withdraw", () => {
    expect(
      healthConsentSettingsLine(
        { at: stamped, version: HEALTH_DATA_CONSENT_VERSION },
        formatDayMonthYear
      )
    ).toBe(
      `Agreed on ${formatDayMonthYear(day)}. ${HEALTH_CONSENT_SETTINGS_COPY.withdraw}`
    );
  });

  it("says it was agreed while the day is on its way", () => {
    expect(
      healthConsentSettingsLine(
        { at: null, version: HEALTH_DATA_CONSENT_VERSION },
        formatDayMonthYear
      )
    ).toBe(`Agreed. ${HEALTH_CONSENT_SETTINGS_COPY.withdraw}`);
  });

  it("says nothing for an account with no agreement", () => {
    expect(healthConsentSettingsLine(undefined, formatDayMonthYear)).toBeNull();
  });
});
