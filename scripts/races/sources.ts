import { raceSpaceDefs } from "../../src/features/spaces/spaceDefs";
import type { DateSource } from "./date-parser";

// Dedicated date elements inspected on 2026-10-04. No whole-page date scraping:
// news, entry deadlines and other distances frequently appear on these pages.
const selectors: Record<string, Partial<DateSource>> = {
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
  // London has a two-day edition. The parser deliberately reports this for review.
  "london-marathon": { selector: ".event-meta__date" },
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
