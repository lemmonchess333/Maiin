/**
 * Community Spaces — curated space definitions (Spc1, locked 2026-07-12).
 *
 * The public community layer is TROPOS-CREATED only (Spc1a): this
 * config is the entire taxonomy, the same pattern as
 * functions/lib/challengeDefs.js — adding/merging a space is a config
 * change, not a schema migration or a release of new infrastructure.
 * Users join and post; they can never create public spaces
 * (S1's rejection of user-created public communities stands).
 *
 * IMPORTANT: the space id list here is mirrored by the literal
 * allowlist in firestore.rules (isKnownSpaceId) — the parity test in
 * __tests__/spaceDefs.test.ts pins the two lists equal, the same
 * D1-parity idiom as profileFieldRegistry. Adding a space touches
 * BOTH files or the test fails.
 */

export type SpaceKind = "interest" | "race" | "location";

/** Engine-recognised race distances (matches RaceGoalPlanner). */
export type RaceEventDistance = "5k" | "10k" | "half" | "marathon";

/**
 * Event metadata for kind === "race" spaces (Races & Events plan,
 * locked 2026-07-19). Evergreen space, dated metadata: one space per
 * event forever; `dateKey` is pasted forward each edition. Everything
 * downstream derives from `dateKey < today` (card hidden from the
 * directory, CTA hidden, header shows the date as passed) — a stale
 * date degrades gracefully, never lies.
 */
export interface SpaceEventInfo {
  /** Race day, local date "YYYY-MM-DD". Verified against the official
   *  site when written — never guessed. */
  dateKey: string;
  distance: RaceEventDistance;
  city: string;
  /** Emoji flag rendered beside the city (Runna's card anatomy). */
  countryFlag: string;
  /** Only set where the official site states it — never inferred. */
  elevation?: "flat" | "rolling" | "hilly";
  /** Official event site (nominative use; no logos/brand assets). */
  websiteUrl: string;
}

export interface SpaceDef {
  /** Firestore path segment (spaces/{id}/…) AND the editorial photo
   *  stem suffix — `space-<id>` in src/assets/editorial/. */
  id: string;
  name: string;
  /** One-line card/header description (the Runna "A space for…" line). */
  tagline: string;
  /** v1 ships interest only; race/location are schema-ready (Spc1d). */
  kind: SpaceKind;
  /** Closed-palette accent for tint washes + the no-photo fallback
   *  band: coral = running-flavoured, purple = lifting, brand = mixed. */
  accent: "running" | "lifting" | "brand";
  /** lucide icon name for the fallback band (resolved in the UI layer,
   *  same string-map idiom as challenge icons). */
  icon: string;
  /** Present on every kind === "race" def; never on interest defs. */
  event?: SpaceEventInfo;
}

export const SPACE_DEFS: SpaceDef[] = [
  {
    id: "new-to-tropos",
    name: "New to Tropos",
    tagline: "Say hi, ask anything — every athlete here started at zero.",
    kind: "interest",
    accent: "brand",
    icon: "sprout",
  },
  {
    id: "hybrid-training",
    name: "Hybrid Training",
    tagline: "Lift and run in the same week — the Tropos way.",
    kind: "interest",
    accent: "brand",
    icon: "zap",
  },
  {
    id: "womens-running",
    name: "Women's Running",
    tagline:
      "A space for women to ask questions and back each other, from first 5Ks to marathons.",
    kind: "interest",
    accent: "running",
    icon: "heart",
  },
  {
    id: "runners",
    name: "Runners",
    tagline: "Routes, races, paces — everything running.",
    kind: "interest",
    accent: "running",
    icon: "footprints",
  },
  {
    id: "trail-running",
    name: "Trail Running",
    tagline:
      "Dirt, hills and long climbs — racing the landscape, not the clock.",
    kind: "interest",
    accent: "running",
    icon: "mountain",
  },
  {
    id: "lifters",
    name: "Lifters",
    tagline: "Programmes, PRs and plates — everything strength.",
    kind: "interest",
    accent: "lifting",
    icon: "dumbbell",
  },
  {
    id: "triathlon-multisport",
    name: "Triathlon & Multisport",
    tagline: "Swim, bike, run — training across disciplines.",
    kind: "interest",
    accent: "running",
    icon: "medal",
  },
  {
    id: "travel-racecations",
    name: "Destination Races",
    tagline:
      "Where are you racing next? Trips, destination races, run-tourism.",
    kind: "interest",
    accent: "brand",
    icon: "plane",
  },
  /* ------------------------------------------------------------------
   * Races & Events — kind "race" (plan locked 2026-07-19, Q5 twelve-
   * race UK catalogue). Dates verified against each race's official
   * site on 2026-07-19; the only annual config duty is pasting the
   * next edition's dateKey forward. Elevation set ONLY where the
   * official site states it. All race spaces are coral (running).
   * ---------------------------------------------------------------- */
  {
    id: "london-marathon",
    name: "London Marathon",
    tagline: "Training for the capital's 26.2? This is your crew.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      // 2027 is the first two-day edition (Sat 24 + Sun 25 April);
      // dateKey carries the Sunday mass day.
      dateKey: "2027-04-25",
      distance: "marathon",
      city: "London",
      countryFlag: "🇬🇧",
      websiteUrl: "https://www.londonmarathonevents.co.uk/london-marathon",
    },
  },
  {
    id: "manchester-marathon",
    name: "Manchester Marathon",
    tagline: "The UK's flat and friendly big-city marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-04-18",
      distance: "marathon",
      city: "Manchester",
      countryFlag: "🇬🇧",
      elevation: "flat",
      websiteUrl: "https://www.manchestermarathon.co.uk",
    },
  },
  {
    id: "brighton-marathon",
    name: "Brighton Marathon",
    tagline: "26.2 by the sea — spring marathon on the south coast.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-04-04",
      distance: "marathon",
      city: "Brighton",
      countryFlag: "🇬🇧",
      websiteUrl:
        "https://www.londonmarathonevents.co.uk/brighton-marathon-weekend",
    },
  },
  {
    id: "edinburgh-marathon",
    name: "Edinburgh Marathon",
    tagline: "Scotland's biggest marathon weekend.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-05-30",
      distance: "marathon",
      city: "Edinburgh",
      countryFlag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
      websiteUrl: "https://www.edinburghmarathon.com",
    },
  },
  {
    id: "great-north-run",
    name: "Great North Run",
    tagline: "The world's biggest half — Newcastle to the sea.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-09-13",
      distance: "half",
      city: "Newcastle",
      countryFlag: "🇬🇧",
      websiteUrl: "https://www.greatrun.org/events/great-north-run/",
    },
  },
  {
    id: "the-big-half",
    name: "The Big Half",
    tagline: "Tower Bridge to Cutty Sark — London's community half.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-09-06",
      distance: "half",
      city: "London",
      countryFlag: "🇬🇧",
      elevation: "flat",
      websiteUrl: "https://www.londonmarathonevents.co.uk/big-half",
    },
  },
  {
    id: "royal-parks-half",
    name: "Royal Parks Half",
    tagline: "13.1 through four Royal Parks in autumn colour.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-10-11",
      distance: "half",
      city: "London",
      countryFlag: "🇬🇧",
      websiteUrl: "https://www.royalparkshalf.com",
    },
  },
  {
    id: "cardiff-half",
    name: "Cardiff Half Marathon",
    tagline: "One of the UK's flattest, best-supported halves.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-10-04",
      distance: "half",
      city: "Cardiff",
      countryFlag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
      elevation: "flat",
      websiteUrl: "https://www.cardiffhalfmarathon.co.uk",
    },
  },
  {
    id: "london-10000",
    name: "London 10,000",
    tagline: "Fast, flat 10K finishing outside Buckingham Palace.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-09-27",
      distance: "10k",
      city: "London",
      countryFlag: "🇬🇧",
      elevation: "flat",
      websiteUrl: "https://www.londonmarathonevents.co.uk/london-10000",
    },
  },
  {
    id: "great-birmingham-run",
    name: "Great Birmingham Run",
    tagline: "Birmingham's biggest running day out.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-05-02",
      distance: "10k",
      city: "Birmingham",
      countryFlag: "🇬🇧",
      websiteUrl: "https://www.greatrun.org/events/great-birmingham-run/",
    },
  },
  {
    id: "great-manchester-run",
    name: "Great Manchester Run",
    tagline: "Europe's biggest 10K, through the heart of Manchester.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-05-23",
      distance: "10k",
      city: "Manchester",
      countryFlag: "🇬🇧",
      websiteUrl: "https://www.greatrun.org/events/great-manchester-run/",
    },
  },
  {
    id: "leeds-10k",
    name: "Leeds 10K",
    tagline: "Yorkshire's flagship summer 10K.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-06-13",
      distance: "10k",
      city: "Leeds",
      countryFlag: "🇬🇧",
      websiteUrl: "https://www.runforall.com/events/10k/leeds-10k/",
    },
  },
];

export const SPACE_IDS = SPACE_DEFS.map((d) => d.id);

export function spaceDef(id: string): SpaceDef | undefined {
  return SPACE_DEFS.find((d) => d.id === id);
}

/** Race-kind defs, soonest race day first — the single feed for both
 *  doors (Races & Events directory section AND the race-goal editor's
 *  "Choose an upcoming race" picker). */
export function raceSpaceDefs(): SpaceDef[] {
  return SPACE_DEFS.filter((d) => d.kind === "race").sort((a, b) =>
    (a.event?.dateKey ?? "").localeCompare(b.event?.dateKey ?? "")
  );
}

/** Density gate (Spc1c, Soc8 idiom): member counts below this render
 *  as "New space" instead of a shame-count. */
export const SPACE_MEMBER_COUNT_MIN_VISIBLE = 5;
