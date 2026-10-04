import { raceSpaceDefs } from "../../src/features/spaces/spaceDefs";
import type { DateSource } from "./date-parser";

// Dedicated date elements inspected on 2026-10-04. No whole-page date scraping:
// news, entry deadlines and other distances frequently appear on these pages.
const selectors: Record<string, Partial<DateSource>> = {
  "chester-marathon": { render: true, selector: "main h1 + div span" },
  "amsterdam-marathon": {
    url: "https://www.tcsamsterdammarathon.eu/frequently-asked-questions",
    selector: ".faq-item",
    pattern: "The next edition is on \\d{1,2} [A-Za-z]+ 20\\d{2}",
  },
  "houston-marathon": {
    url: "https://www.chevronhoustonmarathon.com/faqs/",
    selector: ".et_pb_toggle_content p",
    pattern:
      "^The Chevron Houston Marathon and Aramco Houston Half Marathon will take place on.*",
  },
  "seville-marathon": {
    url: "https://www.zurichmaratonsevilla.es/en/zms-faq",
    selector: "h3 + p",
    pattern: "^The Zurich Seville Marathon 20\\d{2} will take place on.*",
  },
  "paris-marathon": {
    url: "https://www.asicsmarathondeparis.com/en/faq",
    identity: "Marathon de Paris",
    selector: "details p",
    pattern:
      "^The \\d+(?:st|nd|rd|th) edition of the ASICS Marathon de Paris will take place on.*",
  },
  "new-york-city-marathon": {
    render: true,
    selector: "[data-block-type='countdown-block'] time[datetime]",
    allowedHosts: ["virtualcorral.nyrr.org"],
  },
  "great-birmingham-run": {
    url: "https://info.greatrun.org/support/solutions",
    selector: "a[href='/support/solutions/folders/80000704445']",
    identitySelector: "a[href='/support/solutions/folders/80000704445']",
  },
  "great-manchester-run": {
    url: "https://info.greatrun.org/support/solutions",
    selector: "a[href='/support/solutions/folders/80000699828']",
    identitySelector: "a[href='/support/solutions/folders/80000699828']",
  },
  // Great Run's main site blocks this runner. Require two independent charity
  // entry providers to agree; never use an aggregator or a guessed date.
  "great-bristol-10k": {
    url: "https://www.cancerresearchuk.org/get-involved/find-an-event/great-bristol-10k",
    identity: "Great Bristol 10K",
    selector: "p.css-1ldkydh",
    pattern: "^\\d{1,2}(?:st|nd|rd|th)? [A-Za-z]+ 20\\d{2}$",
    corroborate: [
      {
        url: "https://www.bhf.org.uk/how-you-can-help/events/runs/great-bristol-run-10k",
        identity: "Great Bristol Run 10K",
        selector: ".generic-hero-bannner__copy__text",
      },
    ],
  },
  "great-north-run": {
    url: "https://www.macmillan.org.uk/fundraise/charity-runs/great-north-run",
    selector: ".event-details span",
    pattern: "^\\d{1,2} [A-Za-z]+ 20\\d{2}$",
    corroborate: [
      {
        url: "https://www.bhf.org.uk/greatnorthrun",
        identity: "Great North Run",
        selector: ".generic-hero-bannner__copy__text",
      },
    ],
  },
  "cardiff-half": { selector: "aside.date time" },
  "royal-parks-half": { selector: ".o-header__date" },
  "yorkshire-marathon": { selector: ".start-date" },
  "leeds-marathon": { selector: ".start-date", identity: "Leeds.*Marathon" },
  "leeds-10k": { selector: ".start-date" },
  "tokyo-marathon": { selector: ".race-date" },
  "chicago-marathon": { selector: "header .text-primary.text-right" },
  "brighton-half": { selector: "p.introduction" },
  "manchester-marathon": {
    selector: "#inner-r .sub-content-heading",
  },
  "boston-marathon": { selector: ".header-primary-custom-title span" },
  "copenhagen-marathon": { selector: ".block-block-countdown .label" },
  "dublin-marathon": {
    selector: "h3[data-kb-block='kb-adv-heading2_58317f-8e']",
    dateFormat: "dmy",
  },
  "valencia-marathon": {
    selector: "header .datetorun",
    identity: "Valencia.*Marat|Marat.*Valencia",
  },
  "newport-marathon": { selector: ".home-header-date", dateFormat: "dmy" },
  "barcelona-marathon": {
    selector: ".top-header h2",
    identity: "Marat.*Barcelona|Barcelona.*Marat",
  },
  "rotterdam-marathon": {
    selector: "h2",
    identity: "Marathon Rotterdam|Rotterdam Marathon",
    pattern: "^Sunday \\d{1,2} [A-Za-z]+ 20\\d{2}$",
  },
  "belfast-marathon": {
    selector: ".eventCard:has(img[alt$='Belfast City Marathon']) .card-text",
    pattern: "^Date:.*",
    identity: "Belfast City Marathon",
  },
  "oxford-half": {
    selector: "h3",
    identity: "Oxford Half",
    pattern: "^\\d{1,2} [A-Z]+ 20\\d{2}$",
  },
  "edinburgh-5k": { selector: "title", identity: "EMF 5k" },
  "edinburgh-marathon": {
    url: "https://www.edinburghmarathon.com/marathon",
    selector: "title",
    identity: "Edinburgh Marathon",
  },
  "sydney-marathon": {
    selector: "p.font_7",
    identity: "Sydney Marathon",
    pattern: "^Sunday, \\d{1,2} [A-Za-z]+ 20\\d{2}$",
  },
  "cambridge-half": {
    selector: "h2.style__intro-text-2",
    identity: "Cambridge Half",
  },
  "bath-half": { selector: ".event-meta__date", identity: "Bath Half" },
  "brighton-marathon": { selector: ".event-meta__date" },
  "the-big-half": { selector: ".event-meta__date", identity: "Big Half" },
  "london-10000": { selector: ".event-meta__date", identity: "London 10,?000" },
  "london-marathon": { selector: ".event-meta__date", multipleRaceDays: true },
  "southampton-marathon": { selector: "h1.h1-hero" },
  "milton-keynes-marathon": {
    selector: "h3",
    identity: "MK Marathon|Milton Keynes",
    pattern: "MONDAY \\d{1,2} MAY 20\\d{2}",
  },
  "berlin-marathon": {
    selector: "p",
    identity: "BERLIN.MARATHON",
    pattern: "On [A-Za-z]+ \\d{1,2}, 20\\d{2}, a new chapter begins",
  },
  "loch-ness-marathon": {
    url: "https://caledoniangroupevents.co.uk/loch-ness-marathon",
    selector: "div.visually-hidden + div",
    identity: "Loch Ness Marathon",
    pattern: "^Sunday \\d{1,2} [A-Za-z]+ 20\\d{2}$",
  },
  "river-ness-5k": {
    url: "https://caledoniangroupevents.co.uk/loch-ness-marathon/event/river-ness-5k",
    selector: ".event-stat__label",
    identity: "River Ness 5K",
  },
};

export const DATE_SOURCES: Record<string, DateSource> = Object.fromEntries(
  raceSpaceDefs().map((race) => [
    race.id,
    {
      url: race.event!.websiteUrl,
      identity: race.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      excludeIdentity:
        race.event!.distance === "marathon"
          ? "expo|registration|ballot|kids|junior|relay|virtual|half|5k|10k"
          : "expo|registration|ballot|kids|junior|relay|virtual",
      ...selectors[race.id],
    },
  ])
);
