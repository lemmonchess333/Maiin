/**
 * Who gave a post props, as its card says it: up to three faces and
 * "Ann and 4 others gave props" under the action row (Mob2's Mobbin
 * finding 8; Strava, Hevy and Garmin all name the people).
 *
 * The server keeps the newest givers on the post (`recentPropsBy`,
 * `functions/lib/socialCounters.js`), with each one's public name and
 * photo, so a card names them without a read per card. Tapping the line
 * still opens the full list.
 */

/** The givers a post names. Pinned to the server's by
 *  `propsGivers.cross.test.ts`. */
export const RECENT_PROPS_MAX = 3;

export interface PropsGiver {
  uid: string;
  name: string;
  photoURL?: string;
}

/** The givers stored on a post, keeping only well-formed entries. */
export function readPropsGivers(value: unknown): PropsGiver[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (g): g is PropsGiver =>
        !!g &&
        typeof (g as PropsGiver).uid === "string" &&
        typeof (g as PropsGiver).name === "string"
    )
    .slice(0, RECENT_PROPS_MAX)
    .map((g) => ({
      uid: g.uid,
      name: g.name,
      ...(typeof g.photoURL === "string" && g.photoURL
        ? { photoURL: g.photoURL }
        : {}),
    }));
}

/**
 * The givers a reader is shown: nobody either side of a block with them,
 * and the reader as "You", first, once they have given props (a tap that
 * has not reached the post yet included).
 */
export function shownPropsGivers(
  givers: PropsGiver[],
  {
    viewerUid,
    viewerGave,
    blocked,
  }: { viewerUid: string | null; viewerGave: boolean; blocked: Set<string> }
): PropsGiver[] {
  const others = givers.filter(
    (g) => g.uid !== viewerUid && !blocked.has(g.uid)
  );
  if (!viewerGave || !viewerUid) return others.slice(0, RECENT_PROPS_MAX);
  const photo = givers.find((g) => g.uid === viewerUid)?.photoURL;
  const you: PropsGiver = {
    uid: viewerUid,
    name: "You",
    ...(photo ? { photoURL: photo } : {}),
  };
  return [you, ...others].slice(0, RECENT_PROPS_MAX);
}

/**
 * The line under the action row: "Ann gave props", "You and Bo gave
 * props", "Ann and 4 others gave props", as Strava says it. Names one or
 * two of the givers shown and counts the rest; null when it can name
 * nobody.
 */
export function propsLine(shown: PropsGiver[], count: number): string | null {
  if (shown.length === 0 || count <= 0) return null;
  const first = shown[0].name;
  if (count === 1) return `${first} gave props`;
  if (count === 2 && shown.length >= 2)
    return `${first} and ${shown[1].name} gave props`;
  const others = count - 1;
  return `${first} and ${others.toLocaleString("en-GB")} ${
    others === 1 ? "other" : "others"
  } gave props`;
}
