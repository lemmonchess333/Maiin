/**
 * Editorial imagery — the set as a whole.
 *
 * Photographs are for places and communities only: a race shows its real
 * place and a Space its cover. A challenge carries no photograph; its
 * picture is its own medal (Soc16), as Strava's, Nike Run Club's and
 * Garmin's challenges are badge art. A stock photo of someone else on a
 * challenge was the same for every person and said nothing of the goal.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { spaceEditorialImage } from "../editorialImages";

const DIR = resolve(process.cwd(), "src/assets/editorial");
const images = () =>
  readdirSync(DIR).filter((file) => /\.(webp|avif|jpe?g|png)$/i.test(file));

describe("the editorial set", () => {
  it("never ships one photo as two files", () => {
    const byHash = new Map<string, string[]>();
    for (const file of images()) {
      const hash = createHash("sha256")
        .update(readFileSync(resolve(DIR, file)))
        .digest("hex");
      byHash.set(hash, [...(byHash.get(hash) ?? []), file]);
    }
    expect([...byHash.values()].filter((files) => files.length > 1)).toEqual(
      []
    );
  });

  it("is race and Space covers only: no challenge carries a photograph", () => {
    expect(images().filter((file) => !file.startsWith("space-"))).toEqual([]);
  });

  it("finds a Space's cover by its id, and nothing for one without", () => {
    expect(spaceEditorialImage("london-marathon")).toEqual(expect.any(String));
    expect(spaceEditorialImage("no-such-space")).toBeNull();
  });
});
