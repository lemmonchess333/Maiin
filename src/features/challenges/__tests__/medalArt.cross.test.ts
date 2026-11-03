/**
 * The medal illustrations' keying (Soc15), held to the two lists it must
 * agree with: the challenges the server actually builds
 * (functions/lib/challengeDefs.js, the RUNNING copy), and the definitions
 * the art generator makes (scripts/art/generate-medals.py). A challenge
 * added on the server with no definition here would draw its medal by
 * hand for ever; a definition the generator does not know would never get
 * its art; one the generator makes that nothing reads would be wasted.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import {
  MEDAL_ART,
  MEDAL_DEFINITIONS,
  medalArtFor,
  medalDefinition,
} from "../medalArt";

const require = createRequire(import.meta.url);
const server = require("../../../../functions/lib/challengeDefs.js") as {
  buildCurrentChallenges: (now: Date) => {
    id: string;
    metric: string;
    startDate: Date;
    collectiveTarget?: number;
  }[];
};
const medals = require("../../../../functions/lib/medals.js") as {
  isMedalChallenge: (challenge: unknown, id: string) => boolean;
};

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);

/** Every challenge the server builds across a year: the featured month
 *  alternates and the season turns, so one month shows only some. */
function aYearOfChallenges() {
  const year = new Date().getUTCFullYear();
  const byId = new Map<
    string,
    ReturnType<typeof server.buildCurrentChallenges>[number]
  >();
  for (let month = 0; month < 12; month++) {
    for (const def of server.buildCurrentChallenges(
      new Date(Date.UTC(year, month, 15))
    )) {
      byId.set(def.id, def);
    }
  }
  return [...byId.values()];
}

const asMedal = (def: { id: string; metric: string; startDate: Date }) => ({
  challengeId: def.id,
  metric: def.metric,
  startDate: def.startDate.toISOString().slice(0, 10),
});

describe("medal art keys", () => {
  const defs = aYearOfChallenges();

  it("gives every challenge that awards medals a definition, and the community goal none", () => {
    expect(defs.length).toBeGreaterThan(40);
    for (const def of defs) {
      const definition = medalDefinition(asMedal(def));
      if (medals.isMedalChallenge(def, def.id)) {
        expect(definition, def.id).not.toBeNull();
      } else {
        expect(definition, def.id).toBeNull();
      }
    }
  });

  it("has no definition the server never builds", () => {
    const built = new Set(defs.map((def) => medalDefinition(asMedal(def))));
    expect(MEDAL_DEFINITIONS.filter((d) => !built.has(d))).toEqual([]);
  });

  it("is the generator's list, in its order", () => {
    const script = readFileSync(
      resolve(repoRoot, "scripts/art/generate-medals.py"),
      "utf8"
    );
    const table = script.slice(
      script.indexOf("MEDALS = ["),
      script.indexOf("]", script.indexOf("MEDALS = ["))
    );
    const generated = [...table.matchAll(/^\s*\("([a-z0-9-]+)",/gm)].map(
      (m) => m[1]
    );
    expect(generated).toEqual([...MEDAL_DEFINITIONS]);
  });

  it("finds a medal's art by its definition and tier, and none without", () => {
    const art = { "monthly-mileage-gold": "/medals/monthly-mileage-gold.webp" };
    const medal = {
      challengeId: "monthly-2026-11-01",
      metric: "total_km",
      startDate: "2026-11-01",
    };
    expect(medalArtFor({ ...medal, tier: "gold" }, art)).toBe(
      "/medals/monthly-mileage-gold.webp"
    );
    expect(medalArtFor({ ...medal, tier: "silver" }, art)).toBeUndefined();
    expect(
      medalArtFor(
        { ...medal, challengeId: "group-goal-2026-11-01", tier: "gold" },
        art
      )
    ).toBeUndefined();
  });

  it("names every listed image by a definition and a tier, under public/medals", () => {
    for (const [key, path] of Object.entries(MEDAL_ART)) {
      const [definition, tier] = [
        key.slice(0, key.lastIndexOf("-")),
        key.slice(key.lastIndexOf("-") + 1),
      ];
      expect(MEDAL_DEFINITIONS).toContain(definition);
      expect(["bronze", "silver", "gold"]).toContain(tier);
      expect(path).toMatch(new RegExp(`medals/${key}\\.webp$`));
    }
  });
});
