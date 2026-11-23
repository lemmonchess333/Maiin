/**
 * Getting a place in a race (Reg1, 23 November 2026): which official
 * domains a race's entry link may sit on, and what the race page shows.
 *
 * A race's official domains are its website's host, without "www.",
 * and any `entryDomains` the organiser also runs. A link is on one when
 * its host is that domain or a subdomain of it. The race page, the
 * server overrides' sanitiser and the monthly link check all ask
 * `isOfficialRaceUrl`, so a link the test accepts is the link the page
 * opens and the check follows.
 */
import type { SpaceEventInfo } from "./spaceDefs";

type EntryFields = Pick<
  SpaceEventInfo,
  "websiteUrl" | "entryUrl" | "entryNote" | "entryDomains"
>;

/** The longest entry link the server overrides may carry. */
export const ENTRY_URL_MAX_LENGTH = 300;
/** The longest entry note: one short sentence. */
export const ENTRY_NOTE_MAX_LENGTH = 60;

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    // A user name or port in a link is how one dresses up another host.
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** The domains a race's entry link may sit on. */
export function raceOfficialDomains(
  event: Pick<SpaceEventInfo, "websiteUrl" | "entryDomains">
): string[] {
  const site = hostOf(event.websiteUrl)?.replace(/^www\./, "");
  return [...new Set([...(site ? [site] : []), ...(event.entryDomains ?? [])])];
}

/** True for an https link whose host is one of the race's domains. */
export function isOfficialRaceUrl(
  url: string,
  event: Pick<SpaceEventInfo, "websiteUrl" | "entryDomains">
): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return raceOfficialDomains(event).some(
    (d) => host === d || host.endsWith(`.${d}`)
  );
}

export interface RaceEntryLink {
  url: string;
  note: string | null;
  /** The entry page is the website's own page, so the page shows one
   *  link to it, not two. */
  isWebsite: boolean;
}

/**
 * The entry button a race page shows, or null: none without a link,
 * none off the race's domains, and none once the race day has passed,
 * when the next edition's date is not known and "Enter this race" could
 * not be true.
 */
export function raceEntryLink(
  event: EntryFields & Pick<SpaceEventInfo, "dateKey">,
  todayKey: string
): RaceEntryLink | null {
  const url = event.entryUrl;
  if (!url || event.dateKey < todayKey) return null;
  if (!isOfficialRaceUrl(url, event)) return null;
  return {
    url,
    note: event.entryNote ?? null,
    isWebsite: url === event.websiteUrl,
  };
}
