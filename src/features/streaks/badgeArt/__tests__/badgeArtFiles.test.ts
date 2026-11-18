import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { BADGE_ART, BADGE_ART_LOCKED, BADGE_DEFINITIONS } from "../../badges";
import { BADGE_ART_SPECS } from "../catalogue";
import { badgeArtFile, drawBadge } from "../draw";

/**
 * The badges' art as it ships (DS4 call 4): public/badges/<id>.svg and
 * <id>-locked.svg, drawn by `npm run art:badges`. These hold the files to
 * the drawing, the catalogue to the badges, and the art to what an <img>
 * can show on its own.
 */
const DIR = resolve(process.cwd(), "public/badges");
const read = (file: string) => readFileSync(resolve(DIR, file), "utf8");

/** Per file: about 2 to 4 kB each today. */
const FILE_BUDGET = 6 * 1024;
/** All 60: 176 kB today, against the 692 kB of WebP they replace. */
const SET_BUDGET = 220 * 1024;

describe("badge art catalogue", () => {
  it("draws every badge, and only badges", () => {
    const ids = BADGE_DEFINITIONS.map((b) => b.id).sort();
    expect(Object.keys(BADGE_ART_SPECS).sort()).toEqual(ids);
    expect(Object.keys(BADGE_ART).sort()).toEqual(ids);
    expect(Object.keys(BADGE_ART_LOCKED).sort()).toEqual(ids);
  });

  it("points every badge at its two files", () => {
    for (const b of BADGE_DEFINITIONS) {
      expect(BADGE_ART[b.id]).toMatch(new RegExp(`badges/${b.id}\\.svg$`));
      expect(BADGE_ART_LOCKED[b.id]).toMatch(
        new RegExp(`badges/${b.id}-locked\\.svg$`)
      );
    }
  });

  it("carries the number for a count or a distance (§14m rule 27)", () => {
    for (const b of BADGE_DEFINITIONS) {
      if (b.threshold && b.threshold > 1) {
        expect(BADGE_ART_SPECS[b.id].numeral, b.id).toBe(String(b.threshold));
      }
    }
    const numbers = Object.fromEntries(
      Object.entries(BADGE_ART_SPECS)
        .filter(([, spec]) => spec.numeral)
        .map(([id, spec]) => [id, [spec.numeral, spec.unit].join(" ").trim()])
    );
    expect(numbers).toEqual({
      three_day: "3",
      week_warrior: "7",
      two_week: "14",
      month_master: "30",
      two_month: "60",
      century_club: "100",
      year_long: "365",
      tonnage_100: "100 t",
      first_5k: "5K",
      "10k_club": "10K",
      half_marathon: "21.1",
      marathon: "42.2",
      speed_demon: "5:00",
      century_km: "100 km",
      protein_pro: "7",
      hydration_hero: "7",
      meal_prep_master: "14",
      ultimate_athlete: "15",
    });
  });

  it("draws every badge a sign, a number or both", () => {
    for (const [id, spec] of Object.entries(BADGE_ART_SPECS)) {
      expect(!!(spec.sign || spec.numeral), id).toBe(true);
      // A unit always has its number.
      if (spec.unit) expect(spec.numeral, id).toBeTruthy();
    }
  });
});

describe("badge art files", () => {
  it("are what `npm run art:badges` draws", () => {
    for (const b of BADGE_DEFINITIONS) {
      for (const state of ["earned", "locked"] as const) {
        const file = badgeArtFile(b.id, state);
        expect(read(file), `${file}: run npm run art:badges`).toBe(
          `${drawBadge(b.id, b.tier, state)}\n`
        );
      }
    }
  });

  it("leave nothing else in public/badges but the seals", () => {
    const expected = new Set(
      BADGE_DEFINITIONS.flatMap((b) => [
        badgeArtFile(b.id, "earned"),
        badgeArtFile(b.id, "locked"),
      ])
    );
    for (const f of readdirSync(DIR)) {
      if (/^seal_(bronze|silver|gold|platinum)\.webp$/.test(f)) continue;
      expect(expected.has(f), `${f} is not a badge's art`).toBe(true);
    }
  });

  it("stay small", () => {
    let total = 0;
    for (const f of readdirSync(DIR).filter((f) => f.endsWith(".svg"))) {
      const size = Buffer.byteLength(read(f));
      expect(size, f).toBeLessThanOrEqual(FILE_BUDGET);
      total += size;
    }
    expect(total).toBeLessThanOrEqual(SET_BUDGET);
  });

  it("need nothing outside themselves: no text, font, link or image", () => {
    for (const f of readdirSync(DIR).filter((f) => f.endsWith(".svg"))) {
      const svg = read(f);
      expect(svg, f).not.toMatch(/<text|font-family|href=|<image|<style/);
      // The only URL is the SVG namespace; every url() is a local id.
      expect(svg.match(/https?:\/\/[^"]+/g), f).toEqual([
        "http://www.w3.org/2000/svg",
      ]);
      expect(svg, f).not.toMatch(/url\((?!#)/);
    }
  });

  it("draw a badge not yet earned in greys alone", () => {
    for (const b of BADGE_DEFINITIONS) {
      const svg = read(badgeArtFile(b.id, "locked"));
      for (const hex of svg.match(/#[0-9a-f]{6}\b/gi) ?? []) {
        const [r, g, bl] = [1, 3, 5].map((i) => hex.slice(i, i + 2));
        expect(r === g && g === bl, `${b.id}-locked has ${hex}`).toBe(true);
      }
    }
  });
});
