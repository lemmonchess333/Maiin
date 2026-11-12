/**
 * Where a person's whole badge collection is: their own profile, with the
 * shelf's "See all" open (Trim1 call 3(c)). One spelling of the address,
 * for the profile that reads it and for everything that links to it (the
 * streak sheet, and Analytics for links to the tab it used to be).
 */
export const BADGES_PARAM = "badges";
export const BADGES_ALL = "all";

export function badgeShelfPath(uid: string): string {
  return `/user/${uid}?${BADGES_PARAM}=${BADGES_ALL}`;
}
