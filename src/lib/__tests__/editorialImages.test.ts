/**
 * Editorial imagery manifest — the challenge photos and the set as a whole.
 *
 * Every challenge the server defines gets a photo of its own (owner,
 * 2026-10-16: "these are just recycled"): until 2026-10 three photos were
 * shared by metric, so every running challenge showed one runner, and
 * several race cards shared one city view. The definitions are read from
 * the server's own module, so a challenge added there without a photo, or
 * sharing another's, fails here.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  challengeEditorialImage,
  challengeEditorialStem,
  type EditorialChallenge,
} from "../editorialImages";

const require_ = createRequire(import.meta.url);
const { buildCurrentChallenges } = require_(
  "../../../functions/lib/challengeDefs.js"
) as { buildCurrentChallenges: (now: Date) => EditorialChallenge[] };

/** A day in each season, so every seasonal definition is built. */
const SEASON_DAYS = ["01-15", "04-15", "07-15", "10-15"].map(
  (day) => new Date(`2026-${day}T12:00:00Z`)
);

describe("challenge photos", () => {
  it("gives each challenge the server defines a photo of its own", () => {
    for (const now of SEASON_DAYS) {
      const defs = buildCurrentChallenges(now);
      const stems = defs.map(challengeEditorialStem);
      expect(new Set(stems).size, stems.join(", ")).toBe(stems.length);
      for (const def of defs) {
        expect(challengeEditorialImage(def), def.name).toEqual(
          expect.any(String)
        );
      }
    }
  });

  it("gives each season's challenge its own season's photo", () => {
    const seasonal = SEASON_DAYS.map(
      (now) =>
        buildCurrentChallenges(now).find((def) =>
          def.id.startsWith("seasonal-")
        )!
    );
    expect(seasonal.map(challengeEditorialStem)).toEqual([
      "challenge-season-winter",
      "challenge-season-spring",
      "challenge-season-summer",
      "challenge-season-autumn",
    ]);
  });

  it("finds a challenge from elsewhere by what it measures", () => {
    expect(challengeEditorialStem({ id: "custom-1", metric: "total_km" })).toBe(
      "challenge-mileage"
    );
    expect(
      challengeEditorialStem({ id: "custom-2", metric: "workout_count" })
    ).toBe("challenge-weekly");
    expect(
      challengeEditorialStem({ id: "custom-3", metric: "some_future_metric" })
    ).toBe("challenge-hybrid-hero");
  });
});

describe("the editorial set", () => {
  it("never ships one photo as two files", () => {
    const dir = resolve(process.cwd(), "src/assets/editorial");
    const byHash = new Map<string, string[]>();
    for (const file of readdirSync(dir)) {
      if (!/\.(webp|avif|jpe?g|png)$/i.test(file)) continue;
      const hash = createHash("sha256")
        .update(readFileSync(resolve(dir, file)))
        .digest("hex");
      byHash.set(hash, [...(byHash.get(hash) ?? []), file]);
    }
    expect([...byHash.values()].filter((files) => files.length > 1)).toEqual(
      []
    );
  });
});
