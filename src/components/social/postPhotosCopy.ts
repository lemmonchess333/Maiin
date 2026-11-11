/** PostPhotosSheet's words, one place, so the sheet and its tests agree
 *  (Soc15 call 2). */
export const POST_PHOTOS_COPY = {
  title: "Photos",
  about:
    "Up to 4. Each photo is checked before anyone else sees it, and any location saved in it is removed.",
  add: "Add photos",
  /** The way in, once the post has photos. */
  edit: "Edit photos",
  full: "This post has 4 photos, the most it can hold. Remove one to add another.",
  offline: "Photos need a connection.",
  done: "Done",
  retry: "Try again",
} as const;
