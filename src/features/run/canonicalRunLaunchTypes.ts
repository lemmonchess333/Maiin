/** A launch identity, never completion evidence or a legacy scheduled-run id. */
export interface CanonicalRunSession {
  id: string;
  date: string;
  templateId: string;
  minutes: number;
  kind: "easy" | "run_walk";
}
export interface CanonicalRunLaunchIdentity {
  schemaVersion: 1;
  accountId: string;
  revision: number;
  raceGoalId: string | null;
  timeZone: string;
  session: CanonicalRunSession;
}
export interface CanonicalRunLaunchAuthorization extends CanonicalRunLaunchIdentity {
  authorizedAtMs: number;
  expiresAtMs: number;
}
export interface CanonicalRunLaunchRequest {
  expectedUid: string;
  expectedRevision: number;
  sessionId: string;
}
export interface CanonicalRunStartRequest extends CanonicalRunLaunchRequest {
  activityId: string;
}
export interface CanonicalRunStartAuthorization extends CanonicalRunLaunchAuthorization {
  activityId: string;
  launchId: string;
}
export type CanonicalRunLaunchTransport = (
  request: CanonicalRunLaunchRequest | CanonicalRunStartRequest
) => Promise<unknown>;
