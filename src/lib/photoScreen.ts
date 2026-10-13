/**
 * A photo other people will see, checked before the app uses it (Ship1).
 *
 * A Space post's photo and a profile photo are screened for nudity by the
 * `screenPhoto` callable right after they upload (functions/lib/
 * photoScreen.js). A refused photo is already deleted on the server; the
 * app says why and posts nothing. A photo that could not be checked is not
 * used either: the call throws, and the caller's upload failure handling
 * takes it from there.
 */
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export const PHOTO_REFUSED_MESSAGE =
  "This photo can't be used. Photos with nudity aren't allowed.";

/** The photo was refused as nudity; its file is gone. */
export class PhotoRefusedError extends Error {
  constructor() {
    super(PHOTO_REFUSED_MESSAGE);
    this.name = "PhotoRefusedError";
  }
}

/** Screens a just-uploaded photo at `path`. Resolves when it may be used,
 *  rejects with `PhotoRefusedError` when it may not. */
export async function screenUploadedPhoto(path: string): Promise<void> {
  const screen = httpsCallable<{ path: string }, { ok: boolean }>(
    functions,
    "screenPhoto"
  );
  const { data } = await screen({ path });
  if (!data?.ok) throw new PhotoRefusedError();
}
