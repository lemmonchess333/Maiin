import { createHash } from "node:crypto";
import { parseOfficialDates, type DateSource } from "./date-parser";
import { fetchSource } from "./fetch-source";

/** Corroborated partner sources are all mandatory: a failed or disagreeing
 * source cannot be silently dropped to turn a disputed date into an update. */
export async function checkDateSource(
  source: DateSource,
  fetcher: typeof fetchSource = fetchSource
) {
  const sources: Array<{ url: string; sha256: string }> = [];
  let dateKeys: string[] | undefined;
  for (const item of [source, ...(source.corroborate ?? [])]) {
    const { html, url } = await fetcher(item);
    const dates = parseOfficialDates(html, item);
    if (dateKeys && JSON.stringify(dates) !== JSON.stringify(dateKeys))
      throw new Error("Independent entry sources disagree on the race date");
    dateKeys = dates;
    sources.push({
      url,
      sha256: createHash("sha256").update(html).digest("hex"),
    });
  }
  return { dateKeys: dateKeys!, sources };
}
