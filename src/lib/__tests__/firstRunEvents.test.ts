// @vitest-environment jsdom
/** A6's first-run events: each once, a phone's or an account's. */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));

import { track } from "@/lib/lifecycleAnalytics";
import {
  trackSetupStarted,
  trackTrialOfferViewed,
  trackWelcomeViewed,
} from "../firstRunEvents";
import { FLOW_VARIANTS, flowVariant } from "../flowVariant";

const sent = (event: string) =>
  vi.mocked(track).mock.calls.filter(([name]) => name === event);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("first-run events", () => {
  it("welcome_viewed goes once a phone", () => {
    trackWelcomeViewed(false);
    trackWelcomeViewed(true);
    expect(sent("welcome_viewed")).toEqual([
      ["welcome_viewed", { returningDevice: false }],
    ]);
  });

  it("setup_started goes once a phone, signed out or in", () => {
    trackSetupStarted(false);
    trackSetupStarted(true);
    expect(sent("setup_started")).toEqual([
      ["setup_started", { signedIn: false }],
    ]);
  });

  it("trial_offer_viewed goes once an account", () => {
    trackTrialOfferViewed("uid-a");
    trackTrialOfferViewed("uid-a");
    trackTrialOfferViewed("uid-b");
    expect(sent("trial_offer_viewed")).toHaveLength(2);
  });

  it("sends no second trial_started: that is the launch event's", () => {
    trackTrialOfferViewed("uid-a");
    expect(sent("trial_started")).toEqual([]);
  });
});

describe("which version of a flow to show", () => {
  it("answers the default until a test drives it", () => {
    expect(flowVariant("setupTrialOffer")).toBe("offer");
    expect(FLOW_VARIANTS.setupTrialOffer).toContain(
      flowVariant("setupTrialOffer")
    );
  });
});
