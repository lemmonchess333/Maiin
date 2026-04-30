/**
 * Profile photo upload + removal service.
 *
 * The contract this enforces — non-negotiable for safety:
 *
 *   1. **Single-blob policy.** We track the user's currently-active
 *      photo storage path on the public profile (`photoStoragePath`).
 *      Every new upload deletes the prior path BEFORE writing the new
 *      blob. ProgressPhotos accumulates orphans because it never
 *      deletes; profile photos must not repeat that mistake — every
 *      orphaned blob is a privacy leak (token-embedded URL stays
 *      valid forever, even after the user "changes" their photo).
 *
 *   2. **Cache-bust on every upload.** Browsers cache by URL. The
 *      Firebase download URL contains the access token and the file's
 *      generation, so a fresh upload to the same path produces a new
 *      URL — but if we ever upload to the same FILENAME, browsers may
 *      hold on to the old image. Appending `?v={timestamp}` after the
 *      Firebase token forces a fresh fetch. Firebase ignores unknown
 *      query params.
 *
 *   3. **Mirror to both the public profile and the Firebase Auth user.**
 *      `auth.updateProfile()` is what populates `cred.user.photoURL`
 *      for downstream consumers (ActivityCard's denormalized author
 *      photo, third-party Firebase tooling). Keeping them aligned
 *      avoids the "user changed photo, old activities still show old
 *      photo" surprise.
 *
 *   4. **Atomic-ish mutation order.** Upload first → write Firestore
 *      pointer → delete old blob. If the delete fails, we've still
 *      changed the photoURL successfully — better to leak one blob
 *      than to leave the user with a broken or empty avatar.
 *
 * Removal flow is symmetric: clear Firestore, clear Auth, then delete
 * the Storage blob. Same trade-off.
 */

import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { doc, getDoc, writeBatch } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { db, storage, auth } from "./firebase";

const STORAGE_PREFIX = "profile-photos";

export interface UploadProfilePhotoResult {
  photoURL: string;
  photoStoragePath: string;
}

/**
 * Upload a processed photo Blob and update both the public profile
 * doc and the Firebase Auth user. Deletes the prior storage blob if
 * one was tracked.
 *
 * Caller must have already passed the input through processProfilePhoto.
 * Throws on Storage / Firestore / Auth failure; the caller wraps for UI.
 */
export async function uploadProfilePhoto(
  uid: string,
  blob: Blob,
): Promise<UploadProfilePhotoResult> {
  if (!auth.currentUser) {
    throw new Error("Not signed in.");
  }
  if (auth.currentUser.uid !== uid) {
    /* Defense-in-depth: rules already enforce this server-side, but
       refusing client-side is one less round-trip on misuse. */
    throw new Error("Cannot upload a profile photo for another user.");
  }

  /* New upload always gets a unique filename. Two reasons:
     - Avoids browser caching the wrong content under a stable path.
     - Lets the cleanup step delete the *exact* prior path we tracked,
       independent of when Firebase Storage rotates download tokens. */
  const filename = `${Date.now()}.jpg`;
  const newPath = `${STORAGE_PREFIX}/${uid}/${filename}`;
  const newRef = ref(storage, newPath);

  /* Look up the previous path BEFORE writing the new one. The public
     profile doc is the source of truth; the rule constrains its
     `photoStoragePath` to `profile-photos/{uid}/.*` so we can trust
     the value won't trick us into deleting someone else's blob. */
  const profileRef = doc(db, "users", uid, "public", "profile");
  const prevSnap = await getDoc(profileRef);
  const prevPath = (prevSnap.data()?.photoStoragePath as string | null) ?? null;

  /* Step 1 — upload the new blob. If this fails we haven't touched
     anything yet, so the user keeps their old photo. */
  await uploadBytes(newRef, blob, {
    contentType: "image/jpeg",
    cacheControl: "public, max-age=31536000, immutable",
  });

  /* Step 2 — get a fresh download URL and append a cache-bust query
     param. Firebase's URL is `?alt=media&token=...`; appending `&v=`
     after that is benign (Firebase ignores unknown params) and forces
     a fresh fetch in any consumer that's been holding the prior URL. */
  const baseURL = await getDownloadURL(newRef);
  const photoURL = `${baseURL}&v=${Date.now()}`;

  /* Step 3 — write the new pointer. Mirror-write to BOTH the
     owner-only main doc (`users/{uid}`) and the cross-user-readable
     public profile mirror (`users/{uid}/public/profile`). The
     owner-only doc is what `useAuth().profile` reads for local UI
     (Settings avatar, etc.); the public mirror is what every other
     user reads (leaderboard, feed, comments, search). Skipping
     either side leaves the photo half-visible — leaderboard updates
     but Settings doesn't, or vice versa.

     `photoStoragePath` only goes on the public mirror — it's an
     internal pointer for the cleanup flow, and the main doc's rule
     allowlist doesn't include it. The cleanup logic reads from the
     public mirror anyway.

     writeBatch makes the two writes atomic from Firestore's
     perspective: either both land or neither does. If Firestore
     fails here the new blob exists but no consumer sees it; the
     user can retry and the prior-path deletion below won't have
     happened yet. */
  const batch = writeBatch(db);
  batch.update(profileRef, { photoURL, photoStoragePath: newPath });
  batch.update(doc(db, "users", uid), { photoURL });
  await batch.commit();

  /* Step 4 — best-effort: keep Firebase Auth's user object in sync.
     The Auth profile is what `cred.user.photoURL` returns elsewhere
     and what gets denormalized onto activity docs at post time. */
  try {
    await updateProfile(auth.currentUser, { photoURL });
  } catch {
    /* Non-fatal: Firestore is the canonical store. Auth being out of
       sync only affects future activity-doc denormalization; existing
       posts already captured at write time. */
  }

  /* Step 5 — delete the prior blob. Last so a failure here never
     leaves the user without a photo. Worst case: one orphaned blob,
     not a broken avatar. The Cloud Function deleteMyAccount cleans
     up the whole `profile-photos/{uid}/` prefix on account delete,
     so even orphans are eventually swept on offboarding. */
  if (prevPath && prevPath !== newPath) {
    try {
      await deleteObject(ref(storage, prevPath));
    } catch {
      /* Non-fatal: prior blob may already be gone, or rules changed,
         or network blip. Don't unwind the successful upload over it. */
    }
  }

  return { photoURL, photoStoragePath: newPath };
}

/**
 * Remove the user's uploaded profile photo. Clears the Firestore
 * pointer, the Auth profile, then deletes the Storage blob.
 *
 * If the user signed in with Google/Apple and their Tropos photo is
 * the OAuth-provided one (hosted by Google/Apple, no `photoStoragePath`
 * tracked), removal just clears the Firestore field — no Storage to
 * delete because the blob isn't ours. The user falls back to the
 * initial-letter avatar.
 */
export async function removeProfilePhoto(uid: string): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) {
    throw new Error("Cannot remove another user's profile photo.");
  }

  const profileRef = doc(db, "users", uid, "public", "profile");
  const snap = await getDoc(profileRef);
  const path = (snap.data()?.photoStoragePath as string | null) ?? null;

  /* Clear the visible state first. Mirror-write to BOTH the
     owner-only main doc and the cross-user-readable public mirror,
     same as uploadProfilePhoto. If we only cleared the public mirror
     the leaderboard would lose the photo but the user's own Settings
     avatar would keep showing it (until the next refresh). Atomic
     writeBatch keeps the two surfaces in sync.

     If Storage delete fails after this, the user already sees the
     change and can retry later. */
  const batch = writeBatch(db);
  batch.update(profileRef, { photoURL: "", photoStoragePath: null });
  batch.update(doc(db, "users", uid), { photoURL: "" });
  await batch.commit();
  try {
    await updateProfile(auth.currentUser, { photoURL: "" });
  } catch {
    /* Non-fatal — see uploadProfilePhoto. */
  }

  if (path) {
    try {
      await deleteObject(ref(storage, path));
    } catch {
      /* Non-fatal — orphan gets cleaned at account deletion. */
    }
  }
}
