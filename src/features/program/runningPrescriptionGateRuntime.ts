import { runningReviewTransport } from "./runningReviewTransport";
import { createRunningPrescriptionGate } from "./runningPrescriptionGateController";

/** Loaded only when the source gate is enabled. Authenticated negotiation is read-only; this does not enroll anyone or
 * authorize legacy prescriptions. Server transport remains default-off. */
export const runningPrescriptionGate = createRunningPrescriptionGate({
  enabled: true,
  transport: runningReviewTransport.negotiate,
});
