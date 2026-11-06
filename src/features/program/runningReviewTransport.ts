import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase";
import type {
  CanonicalRunLaunchRequest,
  CanonicalRunStartRequest,
} from "@/features/run/canonicalRunLaunchTypes";
import type { RunningNegotiationRequest } from "./runningPrescriptionGate";
import type {
  AdaptationApplyRequest,
  AdaptationApplyResponse,
} from "./runningAdaptationApply";

/** Account/session identity is checked before and after each awaited call.
 * Errors deliberately do not echo payloads or clinical answers to telemetry. */
async function invoke<T>(
  name: string,
  request: { expectedUid: string }
): Promise<T> {
  const user = auth.currentUser;
  if (!user || user.uid !== request.expectedUid || !navigator.onLine)
    throw Error(
      "Running review is unavailable. Check your account and connection."
    );
  const response = await httpsCallable<{ expectedUid: string }, T>(
    functions,
    name
  )(request);
  if (
    auth.currentUser !== user ||
    auth.currentUser?.uid !== request.expectedUid ||
    !navigator.onLine
  )
    throw Error("Your account or connection changed. Refresh the review.");
  return response.data;
}
export const runningReviewTransport = {
  reconcileActivity: (request: {
    expectedUid: string;
    expectedRevision: number;
    activityId: string;
  }) => invoke<unknown>("reconcileRunningActivity", request),
  registerStart: (request: CanonicalRunStartRequest) =>
    invoke<unknown>("registerRunningStart", request),
  authorizeLaunch: (request: CanonicalRunLaunchRequest) =>
    invoke<unknown>("authorizeRunningLaunch", request),
  negotiate: (request: RunningNegotiationRequest) =>
    invoke<unknown>("negotiateRunningAuthority", request),
  enroll: (request: RunningNegotiationRequest & { confirmed: true }) =>
    invoke<unknown>("enrollRunningAuthority", request),
  adoptInitial: (request: {
    expectedUid: string;
    expectedRevision: number;
    requestId: string;
    raceGoalId: null;
    confirmed: true;
    confirmationVersion: "initial-run-walk-v1";
    dates: string[];
  }) => invoke<unknown>("adoptInitialRunningPlan", request),
  completeMigration: (request: {
    expectedUid: string;
    expectedRevision: number;
    requestId: string;
    raceGoalId: string | null;
    confirmed: true;
    acknowledgedLegacyPrescriptionsRetired: true;
    expectedLegacyDigest?: string;
    confirmedLegacyReview?: true;
  }) => invoke<unknown>("completeRunningMigration", request),
  saveReview: (request: {
    expectedUid: string;
    expectedRevision: number;
    requestId: string;
    raceGoalId: string | null;
    confirmed: true;
    review: unknown;
  }) => invoke<unknown>("saveRunningReview", request),
  createPreview: (request: {
    expectedUid: string;
    expectedRevision: number;
    requestId: string;
    windowStart: string;
    selections: unknown[];
  }) => invoke<unknown>("createRunningProposal", request),
  apply: (request: AdaptationApplyRequest) =>
    invoke<AdaptationApplyResponse>("acceptRunningProposal", request),
};
