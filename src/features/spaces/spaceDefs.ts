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
 * all three files (including functions/lib/spaceIds.js for deletion)
 * or the parity tests fail.
 */

export const RACE_COUNTRIES = {
  GB: "United Kingdom",
  US: "United States",
  FR: "France",
  DE: "Germany",
  IE: "Ireland",
  AU: "Australia",
  JP: "Japan",
  ES: "Spain",
  NL: "Netherlands",
  IT: "Italy",
  ZA: "South Africa",
} as const;
export type RaceCountryCode = keyof typeof RACE_COUNTRIES;

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
 *
 * RACE-EVENTS-REMOTE (locked 2026-07-20): merging a change to this
 * file mirrors the event blocks into the Firestore doc
 * `config/raceEvents` (sync-race-events.yml), so date updates reach
 * every platform — including stale native binaries — without an app
 * release. Clients render server values over these bundled ones
 * (raceEventOverrides.ts); this config stays the source of truth and
 * the offline fallback.
 */
export interface SpaceEventInfo {
  /** Race day, local date "YYYY-MM-DD". Verified against the official
   *  site when written — never guessed. */
  dateKey: string;
  distance: RaceEventDistance;
  city: string;
  /** ISO country code for browsing; UK nations share GB. */
  countryCode: RaceCountryCode;
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
  /** Curated interests and evergreen races; location is reserved. */
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
      countryCode: "GB",
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
      countryCode: "GB",
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
      countryCode: "GB",
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
      countryCode: "GB",
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
      countryCode: "GB",
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
      countryCode: "GB",
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
      countryCode: "GB",
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
      countryCode: "GB",
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
      countryCode: "GB",
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
      countryCode: "GB",
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
      countryCode: "GB",
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
      countryCode: "GB",
      countryFlag: "🇬🇧",
      websiteUrl: "https://www.runforall.com/events/10k/leeds-10k/",
    },
  },
  // Marathon expansion — dates and sources: docs/proposals/marathon-expansion.md
  {
    id: "yorkshire-marathon",
    name: "Yorkshire Marathon",
    tagline: "Long runs, race plans and support for 26.2 miles around York.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-10-18",
      distance: "marathon",
      city: "York",
      countryCode: "GB",
      countryFlag: "🇬🇧",
      websiteUrl:
        "https://www.runforall.com/events/marathon/yorkshire-marathon/",
    },
  },
  {
    id: "chester-marathon",
    name: "Chester Marathon",
    tagline: "Build towards 26.2 miles with the Chester community.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-10-11",
      distance: "marathon",
      city: "Chester",
      countryCode: "GB",
      countryFlag: "🇬🇧",
      websiteUrl: "https://www.activeleisureevents.co.uk/marathon",
    },
  },
  {
    id: "loch-ness-marathon",
    name: "Loch Ness Marathon",
    tagline: "Share the journey to a marathon in the Scottish Highlands.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-09-27",
      distance: "marathon",
      city: "Inverness",
      countryCode: "GB",
      countryFlag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
      websiteUrl: "https://www.lochnessmarathon.com/event/loch-ness-marathon/",
    },
  },
  {
    id: "newport-marathon",
    name: "Newport Marathon",
    tagline: "Training and race-day support for Newport, Wales.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-04-18",
      distance: "marathon",
      city: "Newport",
      countryCode: "GB",
      countryFlag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
      websiteUrl: "https://newportwalesmarathon.co.uk/",
    },
  },
  {
    id: "belfast-marathon",
    name: "Belfast City Marathon",
    tagline: "Work towards 26.2 miles through Belfast together.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-05-02",
      distance: "marathon",
      city: "Belfast",
      countryCode: "GB",
      countryFlag: "🇬🇧",
      websiteUrl: "https://belfastcitymarathon.com/",
    },
  },
  {
    id: "leeds-marathon",
    name: "Rob Burrow Leeds Marathon",
    tagline: "Share your build-up to the Rob Burrow Leeds Marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-05-09",
      distance: "marathon",
      city: "Leeds",
      countryCode: "GB",
      countryFlag: "🇬🇧",
      websiteUrl: "https://www.runforall.com/events/marathon/leeds-marathon/",
    },
  },
  {
    id: "milton-keynes-marathon",
    name: "Milton Keynes Marathon",
    tagline: "Long-run company and race plans for Milton Keynes.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-05-03",
      distance: "marathon",
      city: "Milton Keynes",
      countryCode: "GB",
      countryFlag: "🇬🇧",
      websiteUrl: "https://mkmarathon.com/mk-marathon/",
    },
  },
  {
    id: "southampton-marathon",
    name: "Southampton Marathon",
    tagline: "Build towards a full marathon in Southampton together.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-04-11",
      distance: "marathon",
      city: "Southampton",
      countryCode: "GB",
      countryFlag: "🇬🇧",
      websiteUrl: "https://www.southamptonmarathon.co.uk/",
    },
  },
  {
    id: "new-york-city-marathon",
    name: "New York City Marathon",
    tagline: "Five boroughs, one marathon — share your New York build-up.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-11-01",
      distance: "marathon",
      city: "New York City",
      countryCode: "US",
      countryFlag: "🇺🇸",
      websiteUrl: "https://www.nyrr.org/tcsnycmarathon",
    },
  },
  {
    id: "chicago-marathon",
    name: "Chicago Marathon",
    tagline: "Training, travel and race-day plans for Chicago.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-10-11",
      distance: "marathon",
      city: "Chicago",
      countryCode: "US",
      countryFlag: "🇺🇸",
      websiteUrl: "https://www.chicagomarathon.com/",
    },
  },
  {
    id: "boston-marathon",
    name: "Boston Marathon",
    tagline: "Share the preparation for your journey to Boston.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-04-19",
      distance: "marathon",
      city: "Boston",
      countryCode: "US",
      countryFlag: "🇺🇸",
      websiteUrl: "https://www.baa.org/races/boston-marathon/",
    },
  },
  {
    id: "paris-marathon",
    name: "Paris Marathon",
    tagline: "Find company for the long road to 26.2 miles in Paris.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-04-04",
      distance: "marathon",
      city: "Paris",
      countryCode: "FR",
      countryFlag: "🇫🇷",
      websiteUrl: "https://www.asicsmarathondeparis.com/en",
    },
  },
  {
    id: "berlin-marathon",
    name: "Berlin Marathon",
    tagline: "Long runs, race plans and encouragement for Berlin.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-09-27",
      distance: "marathon",
      city: "Berlin",
      countryCode: "DE",
      countryFlag: "🇩🇪",
      websiteUrl: "https://www.bmw-berlin-marathon.com/en/",
    },
  },
  {
    id: "dublin-marathon",
    name: "Dublin Marathon",
    tagline: "Share the miles and the build-up to Dublin race day.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-10-25",
      distance: "marathon",
      city: "Dublin",
      countryCode: "IE",
      countryFlag: "🇮🇪",
      websiteUrl: "https://irishlifedublinmarathon.ie/",
    },
  },
  // Confirmed marathon coverage expansion (2026-09-15).
  {
    id: "richmond-marathon",
    name: "Richmond Marathon",
    tagline: "Share your training and race-day plans for Richmond Marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-09-12",
      distance: "marathon",
      city: "Richmond",
      countryCode: "GB",
      countryFlag: "🇬🇧",
      websiteUrl: "https://run-fest.com/events/richmond-marathon/",
    },
  },
  {
    id: "eryri-marathon",
    name: "Marathon Eryri",
    tagline: "Share your training and race-day plans for Marathon Eryri.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-10-24",
      distance: "marathon",
      city: "Llanberis",
      countryCode: "GB",
      countryFlag: "🇬🇧",
      websiteUrl: "https://www.marathoneryri.com/",
    },
  },
  {
    id: "windermere-marathon",
    name: "Windermere Marathon",
    tagline: "Share your training and race-day plans for Windermere Marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-06-13",
      distance: "marathon",
      city: "Windermere",
      countryCode: "GB",
      countryFlag: "🇬🇧",
      websiteUrl: "https://www.windermeremarathon.co.uk/",
    },
  },
  {
    id: "shakespeare-marathon",
    name: "Shakespeare Marathon",
    tagline: "Share your training and race-day plans for Shakespeare Marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-04-25",
      distance: "marathon",
      city: "Stratford-upon-Avon",
      countryCode: "GB",
      countryFlag: "🇬🇧",
      websiteUrl:
        "https://www.runthrough.co.uk/event/shakespeare-marathon-half-marathon-april-2027",
    },
  },
  {
    id: "portsmouth-marathon",
    name: "Portsmouth Coastal Waterside Marathon",
    tagline:
      "Share your training and race-day plans for Portsmouth Coastal Waterside Marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-12-20",
      distance: "marathon",
      city: "Portsmouth",
      countryCode: "GB",
      countryFlag: "🇬🇧",
      websiteUrl: "https://www.fitprorob.biz/",
    },
  },
  {
    id: "wales-marathon",
    name: "The Wales Marathon",
    tagline: "Share your training and race-day plans for The Wales Marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-07-04",
      distance: "marathon",
      city: "Tenby",
      countryCode: "GB",
      countryFlag: "🇬🇧",
      websiteUrl:
        "https://www.activitywalesevents.com/events/run/the-wales-marathon",
    },
  },
  {
    id: "tokyo-marathon",
    name: "Tokyo Marathon",
    tagline: "Share your training and race-day plans for Tokyo Marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-03-07",
      distance: "marathon",
      city: "Tokyo",
      countryCode: "JP",
      countryFlag: "🇯🇵",
      websiteUrl: "https://www.marathon.tokyo/en/participants/guideline/",
    },
  },
  {
    id: "sydney-marathon",
    name: "Sydney Marathon",
    tagline: "Share your training and race-day plans for Sydney Marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-08-29",
      distance: "marathon",
      city: "Sydney",
      countryCode: "AU",
      countryFlag: "🇦🇺",
      websiteUrl: "https://www.tcssydneymarathon.com/",
    },
  },
  {
    id: "valencia-marathon",
    name: "Valencia Marathon",
    tagline: "Share your training and race-day plans for Valencia Marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-12-06",
      distance: "marathon",
      city: "Valencia",
      countryCode: "ES",
      countryFlag: "🇪🇸",
      websiteUrl: "https://www.valenciaciudaddelrunning.com/",
    },
  },
  {
    id: "amsterdam-marathon",
    name: "Amsterdam Marathon",
    tagline: "Share your training and race-day plans for Amsterdam Marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-10-18",
      distance: "marathon",
      city: "Amsterdam",
      countryCode: "NL",
      countryFlag: "🇳🇱",
      websiteUrl: "https://www.tcsamsterdammarathon.eu/program",
    },
  },
  {
    id: "rotterdam-marathon",
    name: "Rotterdam Marathon",
    tagline: "Share your training and race-day plans for Rotterdam Marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-04-11",
      distance: "marathon",
      city: "Rotterdam",
      countryCode: "NL",
      countryFlag: "🇳🇱",
      websiteUrl:
        "https://nnmarathonrotterdam.nl/en/register/nn-marathon-rotterdam-2/",
    },
  },
  {
    id: "rome-marathon",
    name: "Rome Marathon",
    tagline: "Share your training and race-day plans for Rome Marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-03-14",
      distance: "marathon",
      city: "Rome",
      countryCode: "IT",
      countryFlag: "🇮🇹",
      websiteUrl: "https://www.runromethemarathon.com/en/",
    },
  },
  {
    id: "barcelona-marathon",
    name: "Barcelona Marathon",
    tagline: "Share your training and race-day plans for Barcelona Marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-03-14",
      distance: "marathon",
      city: "Barcelona",
      countryCode: "ES",
      countryFlag: "🇪🇸",
      websiteUrl: "https://zurichmaratobarcelona.es/en/",
    },
  },
  {
    id: "seville-marathon",
    name: "Seville Marathon",
    tagline: "Share your training and race-day plans for Seville Marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-02-21",
      distance: "marathon",
      city: "Seville",
      countryCode: "ES",
      countryFlag: "🇪🇸",
      websiteUrl: "https://www.zurichmaratonsevilla.es/en/",
    },
  },
  {
    id: "cape-town-marathon",
    name: "Cape Town Marathon",
    tagline: "Share your training and race-day plans for Cape Town Marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2027-05-23",
      distance: "marathon",
      city: "Cape Town",
      countryCode: "ZA",
      countryFlag: "🇿🇦",
      websiteUrl: "https://capetownmarathon.com/",
    },
  },
  {
    id: "nice-cannes-marathon",
    name: "Nice–Cannes Marathon",
    tagline: "Share your training and race-day plans for Nice–Cannes Marathon.",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-11-08",
      distance: "marathon",
      city: "Nice to Cannes",
      countryCode: "FR",
      countryFlag: "🇫🇷",
      websiteUrl: "https://www.marathon06.com/2026/AN/",
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

/**
 * Upcoming races only (Q2 lock: everything derives from
 * `dateKey < today`). Race DAY itself still shows — it's the
 * community's biggest day; the card drops out the day after. A race
 * whose next-edition date hasn't been pasted forward simply
 * disappears from browse surfaces while its space stays fully alive.
 * `todayKey` is a local "YYYY-MM-DD" (dateHelpers.localDateString) —
 * lexicographic compare is date order for this shape.
 */
export function upcomingRaceSpaceDefs(todayKey: string): SpaceDef[] {
  return raceSpaceDefs().filter((d) => (d.event?.dateKey ?? "") >= todayKey);
}

/** Density gate (Spc1c, Soc8 idiom): member counts below this render
 *  as "New space" instead of a shame-count. */
export const SPACE_MEMBER_COUNT_MIN_VISIBLE = 5;
