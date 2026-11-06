import { doc, getDocFromServer } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  readStringChecked,
  writeJson,
  remove,
  scopedKey,
} from "@/lib/localStore";
import { runningReviewTransport } from "@/features/program/runningReviewTransport";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const revision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
export function activityLinkKey(uid: string, activityId: string) {
  return scopedKey(`canonicalActivityLink:${activityId}`, uid);
}
export function hasRegisteredActivity(
  value: unknown,
  uid: string,
  activityId: string
) {
  return (
    record(value) &&
    value.schemaVersion === 1 &&
    value.accountId === uid &&
    value.activityId === activityId &&
    id(activityId) &&
    id(uid) &&
    typeof value.launchId === "string" &&
    /^launch_[a-f0-9]{64}$/.test(value.launchId) &&
    record(value.session) &&
    id(value.session.id)
  );
}
export function activityLinkErrorCode(error: unknown) {
  return record(error) &&
    record(error.details) &&
    typeof error.details.errorCode === "string"
    ? error.details.errorCode
    : null;
}
/** Only called after an explicit click. Local queue acceptance is not server
 * persistence. The immutable request survives lost responses and remounts. */
async function performActivityLink(
  uid: string,
  activityId: string,
  proof: unknown
) {
  const user = auth.currentUser;
  const check = () => {
    if (
      !user ||
      user.uid !== uid ||
      auth.currentUser !== user ||
      !navigator.onLine
    )
      throw Error("Account or connection changed.");
  };
  check();
  if (
    !hasRegisteredActivity(proof, uid, activityId) ||
    !record(proof) ||
    !record(proof.session)
  )
    throw Error("Registered start evidence is unavailable.");
  const saved = await getDocFromServer(
    doc(db, "users", uid, "runs", activityId)
  );
  check();
  if (
    !saved.exists() ||
    saved.metadata.hasPendingWrites ||
    saved.metadata.fromCache
  )
    throw Error("The run has not reached the server yet.");
  // The backend verifies the exact server-owned receipt and saved provenance.
  // Never substitute the screen's payload for server-saved activity evidence.
  const key = activityLinkKey(uid, activityId);
  const stored = readStringChecked(key);
  if (!stored.ok) throw Error("Could not read the safe retry request.");
  const raw = stored.value;
  let request: {
    expectedUid: string;
    expectedRevision: number;
    activityId: string;
  };
  if (raw !== null) {
    let prior: unknown;
    try {
      prior = JSON.parse(raw);
    } catch {
      throw Error("Saved linkage request needs review.");
    }
    if (
      !record(prior) ||
      Object.keys(prior).length !== 3 ||
      prior.expectedUid !== uid ||
      prior.activityId !== activityId ||
      !revision(prior.expectedRevision)
    )
      throw Error("Saved linkage request needs review.");
    request = {
      expectedUid: uid,
      expectedRevision: prior.expectedRevision,
      activityId,
    };
  } else {
    const snapshot = await getDocFromServer(
      doc(db, "users", uid, "runningState", "current")
    );
    check();
    const authority: unknown = snapshot.data();
    if (
      !snapshot.exists() ||
      snapshot.metadata.hasPendingWrites ||
      snapshot.metadata.fromCache ||
      !record(authority) ||
      authority.schemaVersion !== 1 ||
      authority.accountId !== uid ||
      !revision(authority.revision)
    )
      throw Error("Current running review is unavailable.");
    request = {
      expectedUid: uid,
      expectedRevision: authority.revision,
      activityId,
    };
    if (!writeJson(key, request))
      throw Error("Could not preserve a safe retry request.");
  }
  check();
  let response: unknown;
  try {
    response = await runningReviewTransport.reconcileActivity(request);
  } catch (error) {
    if (activityLinkErrorCode(error) === "revision-conflict")
      throw {
        details: { errorCode: "revision-conflict" },
        rejectedRequest: request,
      };
    throw error;
  }
  check();
  if (
    !record(response) ||
    !["linked", "replayed"].includes(response.outcome as string) ||
    !record(response.receipt)
  )
    throw Error("Linkage confirmation is unavailable. Retry the same request.");
  const receipt = response.receipt;
  if (
    receipt.schemaVersion !== 1 ||
    receipt.accountId !== uid ||
    receipt.activityId !== activityId ||
    receipt.launchId !== proof.launchId ||
    receipt.sessionId !== proof.session.id ||
    receipt.baseRevision !== request.expectedRevision ||
    receipt.appliedRevision !== request.expectedRevision + 1 ||
    receipt.classification !== "user_reported_activity" ||
    receipt.progressionEligible !== false
  )
    throw Error("Linkage confirmation is unavailable. Retry the same request.");
  return response;
}
/** A known revision-conflict rejection made no change. Never reset an uncertain
 * request after a timeout, transport failure or malformed success response. */
export async function resetRejectedActivityLink(
  uid: string,
  activityId: string,
  error: unknown
) {
  const user = auth.currentUser;
  if (
    activityLinkErrorCode(error) !== "revision-conflict" ||
    !record(error) ||
    !record(error.rejectedRequest) ||
    error.rejectedRequest.expectedUid !== uid ||
    error.rejectedRequest.activityId !== activityId ||
    !revision(error.rejectedRequest.expectedRevision) ||
    !user ||
    user.uid !== uid ||
    !navigator.locks?.request
  )
    return false;
  const rejected = error.rejectedRequest;
  return navigator.locks.request(activityLinkKey(uid, activityId), async () => {
    if (auth.currentUser !== user) return false;
    const stored = readStringChecked(activityLinkKey(uid, activityId));
    if (!stored.ok || stored.value === null) return false;
    let current: unknown;
    try {
      current = JSON.parse(stored.value);
    } catch {
      return false;
    }
    if (
      !record(current) ||
      Object.keys(current).length !== 3 ||
      current.expectedUid !== uid ||
      current.activityId !== activityId ||
      current.expectedRevision !== rejected.expectedRevision
    )
      return false;
    return remove(activityLinkKey(uid, activityId));
  });
}

/** Browser-wide lock prevents two tabs/remounts from creating different retry
 * revisions for one activity. Unsupported clients fail closed. */
export async function linkCanonicalActivity(
  uid: string,
  activityId: string,
  proof: unknown
) {
  const user = auth.currentUser;
  if (
    !id(uid) ||
    !id(activityId) ||
    !user ||
    user.uid !== uid ||
    !navigator.onLine ||
    !navigator.locks?.request
  )
    throw Error("Safe activity linkage is unavailable on this device.");
  return navigator.locks.request(activityLinkKey(uid, activityId), async () => {
    if (auth.currentUser !== user)
      throw Error("The signed-in session changed.");
    return performActivityLink(uid, activityId, proof);
  });
}
