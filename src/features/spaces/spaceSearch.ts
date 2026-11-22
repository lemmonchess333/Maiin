/**
 * Searching Spaces by name (Run27 call 11).
 *
 * Spaces are Tropos's own and live in the app's config (Spc1a,
 * `spaceDefs.ts`), every one of them already on the phone, so the search
 * runs on the device over that list and reads nothing. Firestore could not
 * do it in any case: it has no case-insensitive or "contains" query. The
 * most it offers is a prefix range over a lowercased copy of a field, which
 * finds "brighton" in "Brighton Marathon" but not "marathon", and would
 * need every Space written to the database first.
 *
 * A query matches a Space when every word of it is found somewhere in the
 * Space's name or its race's city, ignoring case, accents and apostrophes
 * ("womens" finds "Women's Running", "zurich" finds Zürich). Results come
 * in the directory's own order, with names that start with the query first.
 */
import type { SpaceDef } from "./spaceDefs";

/** Shortest query that searches; one letter matches half the list. */
export const SPACE_SEARCH_MIN_LENGTH = 2;

/** Lowercase, accents and apostrophes gone, anything else a single space. */
export function searchKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\u0027\u2018\u2019\u0060]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Whether `query` finds `def`: each of its words in the name or city. */
export function spaceMatches(def: SpaceDef, query: string): boolean {
  const words = searchKey(query).split(" ").filter(Boolean);
  if (words.length === 0) return false;
  const haystack = searchKey(`${def.name} ${def.event?.city ?? ""}`);
  return words.every((word) => haystack.includes(word));
}

/**
 * The Spaces `query` finds among `defs`, names that start with it first,
 * then the rest, each group in the order `defs` came in. A query shorter
 * than SPACE_SEARCH_MIN_LENGTH finds nothing.
 */
export function searchSpaces(defs: SpaceDef[], query: string): SpaceDef[] {
  const key = searchKey(query);
  if (key.length < SPACE_SEARCH_MIN_LENGTH) return [];
  const found = defs.filter((def) => spaceMatches(def, query));
  const leads = (def: SpaceDef) => searchKey(def.name).startsWith(key);
  return [...found.filter(leads), ...found.filter((def) => !leads(def))];
}
