/**
 * The monthly entry-link check (Reg1, 23 November 2026): request each
 * race's `entryUrl`, follow its redirects one at a time, and say what is
 * wrong with it, if anything.
 *
 * Broken: an error status (4xx or 5xx), a name that does not resolve, no
 * answer after a retry, a redirect to a domain that is not the race's
 * (`isOfficialRaceUrl`), more than 10 redirects, or a link whose path
 * names an earlier year than the race's (an old edition's page that
 * still answers 200). Unverified: an answer from a bot check (Cloudflare's
 * `cf-mitigated: challenge`), which says nothing about the page behind
 * it; those go in the run summary, not the issue.
 */
import { isOfficialRaceUrl } from "../../src/features/spaces/raceEntry";
import type { SpaceDef } from "../../src/features/spaces/spaceDefs";

export type EntryLinkResult =
  | { id: string; name: string; url: string; status: "ok"; finalUrl: string }
  | {
      id: string;
      name: string;
      url: string;
      status: "broken" | "unverified";
      reason: string;
    };

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const MAX_REDIRECTS = 10;
const TIMEOUT_MS = 20_000;
/** Some organisers answer a bare client with 403; a browser's agent
 *  string gets the page a runner sees. */
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const DNS_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "EAI_NONAME"]);

function errorCode(err: unknown): string | undefined {
  const cause = (err as { cause?: { code?: string } })?.cause;
  return cause?.code ?? (err as { code?: string })?.code;
}

/** The year an entry link's path names, when it names one before the
 *  race's own year: `info-registration-2026` for a 2027 race. */
export function staleYear(url: string, raceDateKey: string): number | null {
  const raceYear = Number(raceDateKey.slice(0, 4));
  const years = [...new URL(url).pathname.matchAll(/(?<!\d)(20\d\d)(?!\d)/g)]
    .map((m) => Number(m[1]))
    .filter((y) => y < raceYear);
  return years.length ? Math.max(...years) : null;
}

async function request(
  fetcher: Fetcher,
  url: string
): Promise<Response | { error: unknown }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetcher(url, {
        method: "GET",
        redirect: "manual",
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-GB,en;q=0.9",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      if (DNS_CODES.has(errorCode(error) ?? "") || attempt === 1)
        return { error };
    }
  }
  return { error: new Error("unreachable") };
}

export async function checkEntryLink(
  def: SpaceDef,
  fetcher: Fetcher = fetch
): Promise<EntryLinkResult | null> {
  const event = def.event;
  if (!event?.entryUrl) return null;
  const base = { id: def.id, name: def.name, url: event.entryUrl };
  const broken = (reason: string): EntryLinkResult => ({
    ...base,
    status: "broken",
    reason,
  });
  if (!isOfficialRaceUrl(event.entryUrl, event))
    return broken("Not on the race’s own domains");
  const year = staleYear(event.entryUrl, event.dateKey);
  if (year !== null)
    return broken(
      `Names the ${year} edition; the race is in ${event.dateKey.slice(0, 4)}`
    );

  let url = event.entryUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await request(fetcher, url);
    if ("error" in res) {
      const code = errorCode(res.error);
      return broken(
        DNS_CODES.has(code ?? "")
          ? `Name does not resolve (${code})`
          : `No answer (${code ?? String(res.error).slice(0, 80)})`
      );
    }
    await res.body?.cancel().catch(() => {});
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return broken(`${res.status} redirect with no Location`);
      const next = new URL(location, url).toString();
      // Some organisers bounce through plain http on their own host
      // (Tokyo, Nov 2026). That is the organiser's page, not a broken
      // link, so the hop is judged by its host alone. The stored link
      // itself must still be https (checked above).
      if (!isOfficialRaceUrl(next.replace(/^http:/, "https:"), event))
        return broken(
          `Redirects off the race’s domains, to ${new URL(next).host}`
        );
      url = next;
      continue;
    }
    if (res.headers.get("cf-mitigated") === "challenge")
      return {
        ...base,
        status: "unverified",
        reason: `Bot check (${res.status})`,
      };
    if (res.status >= 400) return broken(`HTTP ${res.status}`);
    return { ...base, status: "ok", finalUrl: url };
  }
  return broken(`More than ${MAX_REDIRECTS} redirects`);
}

/** Every race's check, a few at a time so no organiser sees a burst. */
export async function checkEntryLinks(
  defs: SpaceDef[],
  fetcher: Fetcher = fetch,
  concurrency = 4
): Promise<EntryLinkResult[]> {
  const queue = defs.filter((d) => d.event?.entryUrl);
  const results: EntryLinkResult[] = [];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let def = queue.shift(); def; def = queue.shift()) {
        const r = await checkEntryLink(def, fetcher);
        if (r) results.push(r);
      }
    })
  );
  return results.sort((a, b) => a.id.localeCompare(b.id));
}
