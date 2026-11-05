/**
 * Adding photos to a shared session's post, and taking them off (Soc15
 * call 2).
 *
 * Photos go on a post that exists, as its map image does
 * (routeMapUpload.ts): the finish screen's posted row and the author's own
 * post page open PostPhotosSheet, which hands the picked files here. Each
 * one is
 *   1. re-encoded on the device (`encodeJpeg`): no longer than 1600 px on
 *      its longest side, a JPEG at 0.82. The canvas keeps the pixels and
 *      nothing else, so the photo's EXIF, the place it was taken included,
 *      never leaves the phone. Nothing is uploaded as the file picked.
 *   2. sent to uploadActivityMedia under a new random id. The server
 *      checks the current owner, screens the bytes, then saves a JPEG
 *      under 2 MB to `post-photos/{uid}/{activityId}/{photoId}.jpg`
 *      without a bearer token. A refused photo is never saved.
 * The returned URL identifies the object; readers use readActivityMedia,
 * never that URL as an image source.
 * with a 30 s ceiling for each photo. Then ONE update names the post's
 * whole list, the photos already on it and every new one that passed.
 * A photo that was refused or failed is never named; the ones that passed
 * are added all the same, and the sheet says what happened to the rest.
 *
 * Taking a photo off writes the shorter list first, then deletes its file
 * (best-effort: a file left behind goes with the post, onActivityDeleted,
 * or with the account, the deletion executor's `post-photos/{uid}/`
 * sweep). An upload that lands and is never named goes the same way.
 */
import { doc } from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { updateDocGuarded } from "@/lib/firestoreWrite";
import { encodeJpeg } from "@/lib/imageEncode";
import { logger } from "@/lib/logger";
import { PhotoRefusedError } from "@/lib/photoScreen";
import { uploadActivityMedia } from "@/lib/activityMedia";
import {
  newPostPhotoId,
  POST_PHOTO_MAX,
  rememberPostPhotos,
  type PostPhoto,
} from "@/lib/postPhotos";

/** The longest side of a photo as it is uploaded, in pixels. */
export const POST_PHOTO_MAX_EDGE = 1600;
/** The JPEG quality it is encoded at. */
export const POST_PHOTO_JPEG_QUALITY = 0.82;
/** The gateway refuses a photo at 2 MB; normal encoded photos are well
 *  under 1 MB. */
export const POST_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
/** Each photo's ceiling: encoding, uploading and screening it. */
export const POST_PHOTO_CEILING_MS = 30_000;

/** A photo's file. One line, so the deletion drift scan
 *  (accountDeletionDrift) sees the folder. */
const photoRef = (uid: string, activityId: string, id: string) =>
  ref(storage, `post-photos/${uid}/${activityId}/${id}.jpg`);

async function uploadOne(activityId: string, file: Blob): Promise<PostPhoto> {
  const { blob, width, height } = await encodeJpeg(file, {
    maxEdge: POST_PHOTO_MAX_EDGE,
    quality: POST_PHOTO_JPEG_QUALITY,
  });
  if (blob.size >= POST_PHOTO_MAX_BYTES)
    throw new Error(`photo too large (${blob.size} bytes)`);
  const id = newPostPhotoId();
  const url = await uploadActivityMedia(
    { activityId, kind: "photo", id },
    blob
  );
  return { id, url, w: width, h: height };
}

/**
 * One photo, encoded, uploaded beside the post and screened. Resolves to
 * the entry the post can name; rejects with `PhotoRefusedError` when the
 * screen refused it, and with an error of its own on any other failure or
 * after the ceiling.
 */
export async function uploadPostPhoto(
  uid: string,
  activityId: string,
  file: Blob
): Promise<PostPhoto> {
  if (auth.currentUser?.uid !== uid) throw new Error("Media unavailable");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      uploadOne(activityId, file),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("photo upload timed out")),
          POST_PHOTO_CEILING_MS
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export interface AddPostPhotosResult {
  /** The post's list as it now stands. */
  photos: PostPhoto[];
  /** How many photos went on. */
  added: number;
  /** How many the screen refused. */
  refused: number;
  /** The files that could not be added for any other reason, to try
   *  again. */
  failed: Blob[];
}

/**
 * Upload `files` (as many as the post has room for, in order) and name
 * every one that passed on the post, after `current`, in one update.
 * Never rejects: what could not be added comes back in `refused` and
 * `failed`.
 */
export async function addPostPhotos({
  uid,
  activityId,
  current,
  files,
}: {
  uid: string;
  activityId: string;
  current: PostPhoto[];
  files: Blob[];
}): Promise<AddPostPhotosResult> {
  const room = Math.max(0, POST_PHOTO_MAX - current.length);
  const passed: PostPhoto[] = [];
  const passedFiles: Blob[] = [];
  const failed: Blob[] = [];
  let refused = 0;
  // One at a time: four full-size photos decoded at once can be more
  // than a phone's web view will hold.
  for (const file of files.slice(0, room)) {
    try {
      passed.push(await uploadPostPhoto(uid, activityId, file));
      passedFiles.push(file);
    } catch (err) {
      if (err instanceof PhotoRefusedError) refused += 1;
      else {
        logger.warn("[postPhotos] a photo could not be added:", err);
        failed.push(file);
      }
    }
  }
  if (passed.length === 0) {
    return { photos: current, added: 0, refused, failed };
  }
  const photos = [...current, ...passed];
  try {
    await updateDocGuarded(doc(db, "activities", activityId), { photos });
  } catch (err) {
    // Uploaded but not named: those files go with the post. Each is sent
    // again under a new id if the person tries again.
    logger.warn("[postPhotos] the post's photos could not be saved:", err);
    return {
      photos: current,
      added: 0,
      refused,
      failed: [...passedFiles, ...failed],
    };
  }
  rememberPostPhotos(activityId, photos);
  return { photos, added: passed.length, refused, failed };
}

/**
 * Take one photo off a post: the post's shorter list first, then the
 * file, best-effort. Resolves to the list as it now stands; rejects when
 * the post could not be updated, and the photo is still on it.
 */
export async function removePostPhoto({
  uid,
  activityId,
  current,
  photoId,
}: {
  uid: string;
  activityId: string;
  current: PostPhoto[];
  photoId: string;
}): Promise<PostPhoto[]> {
  const photos = current.filter((photo) => photo.id !== photoId);
  await updateDocGuarded(doc(db, "activities", activityId), { photos });
  rememberPostPhotos(activityId, photos);
  try {
    await deleteObject(photoRef(uid, activityId, photoId));
  } catch (err) {
    logger.warn("[postPhotos] a removed photo's file was left:", err);
  }
  return photos;
}
