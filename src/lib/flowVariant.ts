/**
 * Which version of a first-run flow to show: the seam an A/B test plugs
 * into (A6).
 *
 * Today every answer is the default. The lock (A6) runs flow tests on
 * Firebase A/B Testing with Remote Config once installs reach about 7,700
 * per test; that wiring goes in here, behind this one function, so no
 * screen has to change to be tested. Each flow lists only the versions the
 * app can draw: a test of sign-up before setup against after it needs the
 * anonymous-account arm the lock left for later, so it is not listed.
 *
 * The first-run events (`firstRunEvents.ts`) are sent either way, so the
 * default's numbers are in hand before any test starts.
 */

export const FLOW_VARIANTS = {
  /** After setup builds the plan: the trial offer, or straight to Home. */
  setupTrialOffer: ["offer", "none"],
} as const;

export type Flow = keyof typeof FLOW_VARIANTS;
export type FlowVariant<F extends Flow> = (typeof FLOW_VARIANTS)[F][number];

/** What each flow shows until a test says otherwise. */
const DEFAULTS: { [F in Flow]: FlowVariant<F> } = {
  setupTrialOffer: "offer",
};

/** The version of `flow` this person sees. */
export function flowVariant<F extends Flow>(flow: F): FlowVariant<F> {
  return DEFAULTS[flow];
}
