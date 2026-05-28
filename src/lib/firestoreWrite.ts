/**
 * Guarded Firestore write helpers.
 *
 * Every write in the app should go through these instead of calling
 * `setDoc` / `addDoc` / `updateDoc` from `firebase/firestore` directly.
 * They apply {@link stripUndefined} to the payload first, which removes
 * the single most common silent-write failure: Firestore rejects any
 * document containing an explicit `undefined` (nested or top-level) with
 * "Unsupported field value: undefined". JS objects with optional fields
 * produce such payloads routinely (an interval run with no splits, a run
 * config with `target.type === 'none'`, a profile with an unset field).
 *
 * Before this module, undefined-stripping was opt-in via a manual
 * `stripUndefined(data)` call at the ~5 sites that remembered it; the
 * other ~65 raw writes were one optional field away from a silent
 * rejection. Routing every write through here makes the guard the
 * default, so the bug class can't recur.
 *
 * FieldValue sentinels (`increment()`, `serverTimestamp()`,
 * `arrayUnion()`, `deleteField()`) and Timestamps are class instances,
 * not plain objects, so `stripUndefined` passes them through unchanged —
 * these wrappers are transparent to them.
 *
 * Offline-aware writes (those that should queue and replay when the
 * connection drops) go through `safeSave` / `safeMerge` in
 * `@/lib/offlineQueue`, which strip undefined the same way. Use these
 * direct wrappers for writes that must hit the server immediately
 * (social actions, counters, anything the user expects confirmed now).
 */

import {
  addDoc as fbAddDoc,
  setDoc as fbSetDoc,
  updateDoc as fbUpdateDoc,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type SetOptions,
  type UpdateData,
  type WithFieldValue,
} from "firebase/firestore";
import { stripUndefined } from "@/lib/firestoreGuards";

/** `addDoc` with the payload stripped of `undefined`. */
export function addDocGuarded<T extends DocumentData>(
  reference: CollectionReference<T>,
  data: WithFieldValue<T>,
): Promise<DocumentReference<T>> {
  return fbAddDoc(reference, stripUndefined(data));
}

/** `setDoc` with the payload stripped of `undefined`. Pass `{ merge: true }`
 *  via `options` exactly as you would to the raw `setDoc`. */
export function setDocGuarded<T extends DocumentData>(
  reference: DocumentReference<T>,
  data: WithFieldValue<T>,
  options?: SetOptions,
): Promise<void> {
  const clean = stripUndefined(data);
  return options ? fbSetDoc(reference, clean, options) : fbSetDoc(reference, clean);
}

/** `updateDoc` (object-literal form) with the payload stripped of
 *  `undefined`. The field-path variant — `updateDoc(ref, 'a.b', v, …)` —
 *  is intentionally not wrapped; nothing in the codebase uses it. */
export function updateDocGuarded<T extends DocumentData>(
  reference: DocumentReference<T>,
  data: UpdateData<T>,
): Promise<void> {
  return fbUpdateDoc(reference, stripUndefined(data));
}
