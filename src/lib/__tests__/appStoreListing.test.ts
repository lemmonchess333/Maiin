/**
 * The App Store listing is pasted into App Store Connect by hand, from
 * `docs/app-store/listing.md`. Pin what a paste would otherwise find out
 * too late, and the claims in it that the code can contradict.
 *
 *  - Each pasteable field fits Apple's limit. App Store Connect refuses
 *    an over-long field at save time, which is the wrong moment to be
 *    rewording a description.
 *  - The description carries the Terms and Privacy links that
 *    auto-renewable subscriptions need (Guideline 3.1.2).
 *  - Numbers quoted to Apple and to buyers match the code: the trial
 *    length, the 2.5 kg step, how long meal photos stay on the phone,
 *    the product IDs and the minimum age.
 *  - Nothing says "unlimited" while Pro has a daily cap, and nothing
 *    claims a feature the app doesn't have.
 *
 * Read as source, the way `legalCopyClaims.test.ts` reads the legal
 * pages: the claim is about the text, and importing the modules behind
 * the numbers would pull in Capacitor plugins to read a constant.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

const LISTING = read("../../../docs/app-store/listing.md");

/** Apple's limits (App Store Connect Help → Reference). Characters unless
 *  the unit says bytes; the keywords and the review notes are counted in
 *  bytes, so a pound sign or a bullet costs more there than it looks. */
const LIMITS: Record<
  string,
  { max: number; unit: "characters" | "bytes"; min?: number }
> = {
  name: { min: 2, max: 30, unit: "characters" },
  subtitle: { max: 30, unit: "characters" },
  "promotional-text": { max: 170, unit: "characters" },
  description: { max: 4000, unit: "characters" },
  keywords: { max: 100, unit: "bytes" },
  "review-notes": { max: 4000, unit: "bytes" },
  "iap-monthly-name": { min: 2, max: 30, unit: "characters" },
  "iap-monthly-description": { max: 45, unit: "characters" },
  "iap-yearly-name": { min: 2, max: 30, unit: "characters" },
  "iap-yearly-description": { max: 45, unit: "characters" },
};

/** Every `<!-- field: key -->` marker and the text box straight after it. */
function readFields(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const box = /<!-- field: ([a-z-]+) -->\s*```text\n([\s\S]*?)\n```/g;
  for (const [, key, text] of LISTING.matchAll(box)) {
    found.set(key, [...(found.get(key) ?? []), text]);
  }
  return found;
}

const FIELDS = readFields();
const field = (key: string): string => {
  const values = FIELDS.get(key);
  if (!values || values.length !== 1) {
    throw new Error(`expected one "${key}" field in the listing`);
  }
  return values[0];
};

const measure = (text: string, unit: "characters" | "bytes") =>
  unit === "bytes" ? new TextEncoder().encode(text).length : [...text].length;

describe("App Store listing: the pasteable fields", () => {
  it("has each field exactly once, and only fields with a known limit", () => {
    for (const key of Object.keys(LIMITS)) {
      expect(FIELDS.get(key)?.length ?? 0, key).toBe(1);
    }
    for (const key of FIELDS.keys()) {
      expect(Object.keys(LIMITS), `unknown field "${key}"`).toContain(key);
    }
  });

  it("puts a text box straight after every marker", () => {
    // A marker whose box went missing in an edit would otherwise drop
    // out of every check below without failing any of them.
    const markers = LISTING.match(/<!-- field: /g) ?? [];
    const boxes = [...FIELDS.values()].flat();
    expect(boxes.length).toBe(markers.length);
  });

  it.each(Object.entries(LIMITS))(
    "%s fits Apple's limit",
    (key, { min = 1, max, unit }) => {
      const size = measure(field(key), unit);
      expect(size, `${key}: ${size} ${unit}`).toBeLessThanOrEqual(max);
      expect(size, `${key}: ${size} ${unit}`).toBeGreaterThanOrEqual(min);
    }
  );

  it("separates keywords with bare commas and spends no bytes twice", () => {
    const keywords = field("keywords").split(",");
    for (const keyword of keywords) {
      expect(keyword, "a space or an empty keyword").toMatch(/^\S+$/);
    }
    expect(new Set(keywords).size).toBe(keywords.length);
    // Apple indexes the name and subtitle already, so a keyword that
    // repeats one of their words buys nothing.
    const indexed = `${field("name")} ${field("subtitle")}`
      .toLowerCase()
      .split(/[^a-z0-9]+/);
    for (const keyword of keywords) {
      expect(
        indexed,
        `"${keyword}" is already in the name or subtitle`
      ).not.toContain(keyword.toLowerCase());
    }
  });

  it("links the Terms and the Privacy Policy from the description", () => {
    // Guideline 3.1.2: an app selling auto-renewable subscriptions needs
    // a working Terms of Use link in the description (or a custom EULA)
    // as well as the Privacy Policy URL field.
    const description = field("description");
    expect(description).toMatch(/^Terms of Use: https:\/\/\S+\/terms$/m);
    expect(description).toMatch(/^Privacy Policy: https:\/\/\S+\/privacy$/m);
  });
});

describe("App Store listing: claims the code can contradict", () => {
  const everything = [...FIELDS.values()].flat().join("\n");

  it("quotes the trial length the paywall offers", () => {
    const paywall = read("../proPlans.ts").match(
      /Start your (\d+)-day free trial/
    );
    expect(paywall).not.toBeNull();
    const quoted = [...everything.matchAll(/(\d+)-day free trial/g)].map(
      (m) => m[1]
    );
    expect(quoted.length).toBeGreaterThan(0);
    for (const days of quoted) expect(days).toBe(paywall![1]);
  });

  it("quotes the progression step the workout suggests", () => {
    const step = read("../progressionSuggestion.ts").match(
      /INCREMENT_KG\s*=\s*([\d.]+)/
    );
    expect(step).not.toBeNull();
    expect(field("description")).toContain(`adding ${step![1]} kg`);
  });

  it("quotes how long the phone keeps meal photos", () => {
    const days = read("../foodPhotoStore.ts").match(/MAX_AGE_DAYS\s*=\s*(\d+)/);
    expect(days).not.toBeNull();
    expect(field("review-notes")).toContain(
      `on the phone for ${days![1]} days`
    );
  });

  it("names the product IDs the app asks Apple for", () => {
    const ids = [
      ...read("../purchaseProvider.ts").matchAll(
        /(?:monthly|yearly): "(com\.tropos\.app\.pro\.[a-z]+)"/g
      ),
    ].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(LISTING).toContain(`\`${id}\``);
  });

  it("rates the app at the minimum age setup enforces", () => {
    const minimum = read("../../pages/Onboarding.tsx").match(
      /You need to be at least (\d+) to use Tropos/
    );
    expect(minimum).not.toBeNull();
    expect(LISTING).toContain(`raise the rating to **${minimum![1]}+**`);
  });

  it("never says unlimited while Pro has a daily cap", () => {
    // The paywall's own "Unlimited AI photo food logging" is the copy
    // this guards against repeating: Pro is capped per day.
    const cap = read("../subscription.ts").match(
      /pro:\s*\{\s*text_ai:\s*(\d+),\s*image_ai:\s*(\d+)\s*\}/
    );
    expect(cap).not.toBeNull();
    expect(everything).not.toMatch(/unlimited/i);
  });

  it("claims no feature the app doesn't have", () => {
    // No heart-rate source exists (`heartRateSource.ts`), there is no
    // watch app or Live Activity, and iPhone gets no push for social
    // activity. Each would be a 2.3 rejection waiting for a reviewer.
    const forSale = [
      field("name"),
      field("subtitle"),
      field("promotional-text"),
      field("description"),
      field("keywords"),
    ].join("\n");
    expect(forSale).not.toMatch(
      /apple watch|heart rate|live activit|dynamic island|push notification/i
    );
  });
});

describe("App Store listing: house voice", () => {
  const prose = [...FIELDS.values()].flat().join("\n");

  it("uses no exclamation marks", () => {
    expect(prose).not.toContain("!");
  });

  it("avoids the words the house voice bans", () => {
    expect(prose).not.toMatch(/\b(unlock|elevate|seamless|journey)/i);
  });

  it("spaces its units", () => {
    expect(prose).not.toMatch(/\d(kg|km)\b/);
  });
});
