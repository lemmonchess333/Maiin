// @vitest-environment jsdom
/** A6's first-run events. The welcome and setup started are counted on
 *  Tropos's own server and never sent to Google; the trial offer goes once
 *  an account. */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/setupCounts", () => ({ countSetupStep: vi.fn() }));

import { track } from "@/lib/lifecycleAnalytics";
import { countSetupStep } from "@/lib/setupCounts";
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
  it("counts the welcome and setup started on Tropos's server, never to Google", () => {
    trackWelcomeViewed();
    trackSetupStarted();
    expect(vi.mocked(countSetupStep).mock.calls).toEqual([
      ["welcome_viewed"],
      ["setup_started"],
    ]);
    expect(track).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
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
