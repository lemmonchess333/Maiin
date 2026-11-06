import type { ProgramState, ScheduledRunDay } from "./programTypes";

import { RUNNING_PRESCRIPTION_GATE_ENABLED } from "./runningPrescriptionFeature";
export { RUNNING_PRESCRIPTION_GATE_ENABLED } from "./runningPrescriptionFeature";

export interface RunningNegotiationRequest {
  expectedUid: string;
  supportedSchemaVersions: [1];
}
export interface RunningNegotiationResponse {
  status: "ready" | "held" | "not_enrolled" | "unavailable";
  accountId: string;
  checkedAtMs: number;
  schemaVersion?: 1;
  revision?: number;
  authority?: Record<string, unknown>;
  reason?: string;
  legacyReconciliation?: { version: 1; snapshotDigest: string; evidence: string[]; holds: string[] };
}
/** Must be an authenticated SERVER request, never a cache/snapshot adapter.
 * unknown is intentional: the response is validated at this boundary. */
export type RunningNegotiationTransport = (
  request: RunningNegotiationRequest
) => Promise<unknown>;

export interface RunningGateContext {
  accountId: string | null;
  /** Auth session identity, not a uid. A -> B -> A must invalidate old reads. */
  session: object | null;
  online: boolean;
}
export interface RunningPrescriptionAccess {
  status:
    "inactive" | "pending" | "unavailable" | "not_enrolled" | "held" | "ready";
  /** No enabled state is ever permission to use legacy runDays. */
  legacyAllowed: boolean;
  /** Ready authority is kept separate. A reviewed render/launch adapter is
   * still missing, so even ready does not enable prescription UI. */
  authority: Record<string, unknown> | null;
}
export const INACTIVE_RUNNING_ACCESS: RunningPrescriptionAccess = {
  status: "inactive",
  legacyAllowed: true,
  authority: null,
};
export const UNAVAILABLE_RUNNING_ACCESS: RunningPrescriptionAccess = {
  status: "unavailable",
  legacyAllowed: false,
  authority: null,
};
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A render projection only: never save this stripped object. Completed runs,
 * lift workouts, week history, nutrition and manual completion records remain
 * untouched. The authority is NOT converted to the old runDays schema. */
export function gateLegacyRunningProgram(
  state: ProgramState | null,
  access: Pick<RunningPrescriptionAccess, "legacyAllowed">
): ProgramState | null {
  // The source-time inactive build must not ship the dormant projection. In
  // enabled builds this remains synchronous, even before the runtime loads.
  if (!RUNNING_PRESCRIPTION_GATE_ENABLED || !state || access.legacyAllowed)
    return state;
  const historical = (day: ScheduledRunDay) => {
    // Date alone is not completion. A missed/unknown future prescription must
    // not reappear as history merely because the calendar moved on.
    const manual =
      day.id &&
      state.manualCompletions &&
      Object.prototype.hasOwnProperty.call(state.manualCompletions, day.id) &&
      record(state.manualCompletions[day.id]);
    return (
      day.completed === true ||
      !!manual ||
      [
        "skipped",
        "race_no_show",
        "completed_exact",
        "completed_modified",
        "completed_late",
      ].includes(day.status ?? "")
    );
  };
  const projected = {
    ...state,
    runDays: (state.runDays ?? []).filter(historical),
  };
  delete projected.runPlan;
  delete projected.pendingFellBehindPrompt;
  if (projected.easeSnapshot)
    projected.easeSnapshot = {
      ...projected.easeSnapshot,
      runDays: projected.easeSnapshot.runDays.filter(historical),
    };
  if (projected.deloadSnapshot?.runDays)
    projected.deloadSnapshot = {
      ...projected.deloadSnapshot,
      runDays: projected.deloadSnapshot.runDays.filter(historical),
    };
  return projected;
}
