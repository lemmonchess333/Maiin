/** Deliberately hard disabled. The settings flow and authenticated transport exist behind explicit release gates. */
export const RUNNING_ADAPTATION_ENABLED = false;

export interface AdaptationApplyRequest {
  expectedUid: string;
  accepted: true;
  proposalId: string;
  expectedRevision: number;
  idempotencyKey: string;
}
export interface AdaptationApplyReceipt {
  accountId: string;
  proposalId: string;
  idempotencyKey: string;
  baseRevision: number;
  appliedRevision: number;
}
export interface AdaptationApplyResponse {
  outcome: "applied" | "replayed";
  receipt: AdaptationApplyReceipt;
}
export function matchingAdaptationReceipt(request: AdaptationApplyRequest, response: AdaptationApplyResponse): boolean {
  const r = response?.receipt;
  return !!r && ["applied", "replayed"].includes(response.outcome) &&
    r.accountId === request.expectedUid && r.proposalId === request.proposalId &&
    r.idempotencyKey === request.idempotencyKey && r.baseRevision === request.expectedRevision &&
    r.appliedRevision === request.expectedRevision + 1;
}
