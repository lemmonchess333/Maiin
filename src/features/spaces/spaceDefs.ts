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
    name: "Travel & Racecations",
    tagline:
      "Where are you racing next? Trips, destination races, run-tourism.",
    kind: "interest",
    accent: "brand",
    icon: "plane",
  },
];

export const SPACE_IDS = SPACE_DEFS.map((d) => d.id);

export function spaceDef(id: string): SpaceDef | undefined {
  return SPACE_DEFS.find((d) => d.id === id);
}

/** Density gate (Spc1c, Soc8 idiom): member counts below this render
 *  as "New space" instead of a shame-count. */
export const SPACE_MEMBER_COUNT_MIN_VISIBLE = 5;
