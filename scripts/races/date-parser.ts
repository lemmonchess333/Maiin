import { createRequire } from "node:module";

// The CLI uses only this small DOM surface; jsdom is already a dev dependency.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string) => {
    window: { document: Document; close(): void };
  };
};

export interface DateSource {
  url: string;
  /** Reviewed race identity, checked against the page title or structured event. */
  identity: string;
  /** Only the organiser's dedicated date element; never scan the whole page. */
  selector?: string;
  /** Optional tightly scoped statement inside the selected element. */
  pattern?: string;
  dateFormat?: "dmy";
  excludeIdentity?: string;
  /** Explicitly reviewed redirects (e.g. an organiser changes its domain). */
  allowedHosts?: string[];
}

const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

export function validDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function extractDates(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    const key = `${m[1]}-${m[2]}-${m[3]}`;
    if (validDateKey(key)) found.add(key);
  }
  const month =
    "(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";
  for (const [pattern, order] of [
    [`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${month}[,\\s]+(20\\d{2})\\b`, "dmy"],
    [`\\b${month}\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(20\\d{2})\\b`, "mdy"],
  ]) {
    for (const m of text.matchAll(new RegExp(pattern, "gi"))) {
      const day = order === "dmy" ? m[1] : m[2];
      const mon = order === "dmy" ? m[2] : m[1];
      const key = `${m[3]}-${String(months.indexOf(mon.slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
      if (validDateKey(key)) found.add(key);
    }
  }
  return [...found].sort();
}

/** Reject ambiguity, cancellation and multi-day events rather than guessing. */
export function parseOfficialDate(html: string, source: DateSource): string {
  const dom = new JSDOM(html);
  try {
    const doc = dom.window.document;
    const identity = new RegExp(source.identity, "i");
    const values: string[] = [];
    const walk = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      const obj = value as Record<string, unknown>;
      const types = Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]];
      if (
        types.some(
          (t) => typeof t === "string" && /^(SportsEvent|Event)$/.test(t)
        ) &&
        identity.test(String(obj.name ?? "")) &&
        !new RegExp(
          source.excludeIdentity ??
            "expo|registration|ballot|kids|junior|relay|virtual",
          "i"
        ).test(String(obj.name ?? ""))
      ) {
        if (
          obj.eventStatus &&
          !String(obj.eventStatus).endsWith("EventScheduled")
        )
          throw new Error("Event status needs review");
        const start = String(obj.startDate ?? "").slice(0, 10);
        const end = String(obj.endDate ?? start).slice(0, 10);
        if (!validDateKey(start) || end !== start)
          throw new Error("Invalid or multi-day event date");
        values.push(start);
      }
      Object.values(obj).forEach(walk);
    };
    for (const node of source.selector
      ? []
      : doc.querySelectorAll('script[type="application/ld+json"]')) {
      let data: unknown;
      try {
        data = JSON.parse(node.textContent ?? "");
      } catch {
        continue;
      }
      walk(data);
    }
    if (source.selector) {
      if (
        !identity.test(
          `${doc.title} ${doc.querySelector("h1")?.textContent ?? ""}`
        )
      )
        throw new Error("Page identity changed");
      for (const node of doc.querySelectorAll(source.selector)) {
        const raw = (node.getAttribute("datetime") ?? node.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim();
        const text = source.pattern
          ? raw.match(new RegExp(source.pattern, "i"))?.[0]
          : raw;
        if (!text) continue;
        // A date range or cancellation must be handled by a person.
        if (
          /cancelled|canceled|postponed|\b\d{1,2}(?:st|nd|rd|th)?\s*[-–/&]\s*\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]/i.test(
            text
          )
        )
          throw new Error("Ambiguous date or status");
        const normalized =
          source.dateFormat === "dmy"
            ? text.replace(
                /\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/g,
                (_match, d, m, y) =>
                  `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
              )
            : text;
        values.push(
          ...extractDates(
            normalized.replace(/(\d)-([A-Z]{3})-(20\d{2})/gi, "$1 $2 $3")
          )
        );
      }
    }
    const dates = [...new Set(values)];
    if (dates.length !== 1)
      throw new Error(
        dates.length
          ? "Multiple dates need review"
          : "No unambiguous official date found"
      );
    return dates[0];
  } finally {
    dom.window.close();
  }
}

export function isNextEdition(
  candidate: string,
  current: string,
  today: string
): boolean {
  if (![candidate, current, today].every(validDateKey)) return false;
  const advance = (Date.parse(candidate) - Date.parse(current)) / 86_400_000;
  return candidate >= today && advance >= 120 && advance <= 550;
}
