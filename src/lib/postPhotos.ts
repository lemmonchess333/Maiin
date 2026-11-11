/**
 * A shared session's photos (Soc15 call 2): one to four on a feed post.
 *
 * A post's `photos` is a list of `{ id, url, w, h }`, set only by its
 * author's update once each photo is uploaded beside the post and screened
 * (postPhotoUpload.ts). firestore.rules holds every entry to this shape,
 * and the url to this post's own upload of that id; a reader still reads
 * the list whole, so a malformed entry draws nothing rather than a broken
 * tile.
 *
 * Food9 is unchanged and separate: a meal photo never leaves the device
 * to be stored. These are photos a person chose to put on a post other
 * people see.
 */

/** The most photos a post carries; firestore.rules checks the same four. */
export const POST_PHOTO_MAX = 4;

/** One photo on a post: its id (its file's name), its download URL and its
 *  size in pixels, which the card reads to lay it out before it loads. */
export interface PostPhoto {
  id: string;
  url: string;
  w: number;
  h: number;
}

/** A photo's id as the rules and storage.rules take it. */
const PHOTO_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** The largest side, in pixels, the rules take. */
const MAX_SIDE = 4096;

const isSide = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= MAX_SIDE;

/** One entry, read whole, or null. */
function postPhotoOf(value: unknown): PostPhoto | null {
  if (!value || typeof value !== "object") return null;
  const { id, url, w, h } = value as Record<string, unknown>;
  if (typeof id !== "string" || !PHOTO_ID.test(id)) return null;
  if (typeof url !== "string" || !url.startsWith("https://")) return null;
  if (!isSide(w) || !isSide(h)) return null;
  return { id, url, w, h };
}

/** A post's photos as the card draws them: its own entries, in order, at
 *  most four, leaving out any that are not a photo's shape. */
export function postPhotosOf(value: unknown): PostPhoto[] {
  if (!Array.isArray(value)) return [];
  const photos: PostPhoto[] = [];
  for (const entry of value.slice(0, POST_PHOTO_MAX)) {
    const photo = postPhotoOf(entry);
    if (photo) photos.push(photo);
  }
  return photos;
}

const ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A new photo's id: 20 random letters and digits. Never an index: a
 *  photo's URL is cached as immutable, so a photo added after another was
 *  taken off must never take its name. */
export function newPostPhotoId(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

/** What a photo is called where it cannot be seen: "Photo 2 of 3 from
 *  Maya Chen's run". */
export function postPhotoAlt(
  index: number,
  count: number,
  authorName: string,
  kind: "run" | "workout"
): string {
  const name = authorName.trim();
  const whose = name ? `${name}’s ${kind}` : `this ${kind}`;
  return `Photo ${index + 1} of ${count} from ${whose}`;
}

/** The photos this app session last named on each post, so a finish
 *  screen that mounts again for the same post opens with them rather than
 *  writing a list without them. */
const known = new Map<string, PostPhoto[]>();

/** The photos this app session last named on a post, if it named any. */
export function knownPostPhotos(activityId: string): PostPhoto[] | undefined {
  return known.get(activityId);
}

/** Remember the list just named on a post (postPhotoUpload.ts). */
export function rememberPostPhotos(
  activityId: string,
  photos: PostPhoto[]
): void {
  known.set(activityId, photos);
}
