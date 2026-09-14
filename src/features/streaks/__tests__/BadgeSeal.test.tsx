/**
 * The seal is one material: the rim is the badge's tier metal, the face
 * is obsidian, the cracks leak light, and the shards carry the same rim
 * and face so the break reads as this object coming apart.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { SealFace, SealShards } from "../BadgeSeal";
import { SEAL_CRACKS, SEAL_SHARDS } from "../sealGeometry";
import { TIER_PALETTES } from "../tierPalettes";
import { SEAL_ART, type BadgeTier } from "../badges";

afterEach(cleanup);

function face(tier: "bronze" | "gold", cracks: number, idBase = "t") {
  return render(
    <svg viewBox="0 0 100 100">
      <SealFace tier={tier} idBase={idBase} visibleCracks={cracks} />
    </svg>
  ).container;
}

describe("SealFace", () => {
  it("rims the seal in the badge's tier metal, with the medallion in the same metal", () => {
    const c = face("gold", 0);
    const rim = c.querySelector("#t-rim");
    expect(rim).not.toBeNull();
    const stops = Array.from(rim!.querySelectorAll("stop")).map((s) =>
      s.getAttribute("stop-color")
    );
    expect(stops).toEqual([
      TIER_PALETTES.gold.highlight,
      TIER_PALETTES.gold.base,
      TIER_PALETTES.gold.edge,
    ]);
    expect(c.querySelector('polygon[fill="url(#t-rim)"]')).not.toBeNull();
    expect(c.querySelector('circle[fill="url(#t-wax)"]')).not.toBeNull();
    // Bronze is a different rim, not the same drawing recoloured by CSS.
    const bronze = face("bronze", 0, "b").querySelector("#b-rim stop");
    expect(bronze?.getAttribute("stop-color")).toBe(
      TIER_PALETTES.bronze.highlight
    );
  });

  it("draws exactly the cracks asked for, each as a light leak under a line", () => {
    expect(face("gold", 0).querySelectorAll("[data-seal-crack]")).toHaveLength(
      0
    );
    const two = face("gold", 2);
    expect(two.querySelectorAll("[data-seal-crack]")).toHaveLength(2);
    expect(two.querySelectorAll("[data-seal-crack] path")).toHaveLength(4);
    const leak = two.querySelector("[data-seal-crack] path");
    expect(leak?.getAttribute("stroke")).toBe(TIER_PALETTES.gold.highlight);
    expect(leak?.getAttribute("filter")).toBe("url(#t-leak)");
    expect(
      face("gold", SEAL_CRACKS.length + 3).querySelectorAll("[data-seal-crack]")
    ).toHaveLength(SEAL_CRACKS.length);
  });
});

describe("SealShards", () => {
  it("is six pieces, each with the face inside and the metal rim on its outer edge", () => {
    const c = render(
      <div>
        <SealShards tier="gold" idBase="t" size={132} />
      </div>
    ).container;
    const svgs = c.querySelectorAll("svg");
    expect(svgs).toHaveLength(SEAL_SHARDS.length);
    expect(svgs).toHaveLength(6);
    svgs.forEach((svg, i) => {
      expect(
        svg.querySelector(`polygon[fill="url(#t-s${i}-face)"]`)
      ).not.toBeNull();
      expect(
        svg.querySelector(`polygon[fill="url(#t-s${i}-rim)"]`)
      ).not.toBeNull();
    });
    // Each shard flies along its own edge's outward normal — six distinct headings.
    const headings = new Set(
      SEAL_SHARDS.map((s) => Math.round(Math.atan2(s.dy, s.dx) * 100))
    );
    expect(headings.size).toBe(6);
  });
});

describe("the rendered seal (SEAL_ART)", () => {
  const tiers: BadgeTier[] = ["bronze", "silver", "gold", "platinum"];

  it("ships one keyed WebP per tier under public/badges, small enough to preload", () => {
    for (const tier of tiers) {
      const file = resolve(process.cwd(), "public/badges", `seal_${tier}.webp`);
      expect(existsSync(file), `${tier}: ${file}`).toBe(true);
      expect(statSync(file).size).toBeLessThan(60_000);
      expect(SEAL_ART[tier]).toMatch(new RegExp(`badges/seal_${tier}\\.webp$`));
    }
  });

  it("layers the art over the drawn seal, clipped inside the rim, with the cracks on top", () => {
    const c = render(
      <svg viewBox="0 0 100 100">
        <SealFace tier="gold" idBase="t" visibleCracks={2} imageSrc="/x.webp" />
      </svg>
    ).container;
    const art = c.querySelector("image[data-seal-art]");
    expect(art).not.toBeNull();
    expect(art?.getAttribute("href")).toBe("/x.webp");
    expect(art?.getAttribute("clip-path")).toBe("url(#t-clip)");
    expect(c.querySelector("#t-clip polygon")).not.toBeNull();
    // Fallback stays underneath (rim drawn before the art) and cracks come after it.
    const all = Array.from(c.querySelectorAll("*"));
    const rim = all.findIndex(
      (el) => el.getAttribute("fill") === "url(#t-rim)"
    );
    const artAt = all.indexOf(art!);
    const crack = all.findIndex((el) => el.hasAttribute("data-seal-crack"));
    expect(rim).toBeGreaterThan(-1);
    expect(rim).toBeLessThan(artAt);
    expect(artAt).toBeLessThan(crack);
    // Without art there is no image and no clip.
    const plain = render(
      <svg viewBox="0 0 100 100">
        <SealFace tier="gold" idBase="p" visibleCracks={0} />
      </svg>
    ).container;
    expect(plain.querySelector("image")).toBeNull();
  });

  it("cuts each shard from the same art along its own piece", () => {
    const c = render(
      <div>
        <SealShards tier="gold" idBase="t" size={132} imageSrc="/x.webp" />
      </div>
    ).container;
    const svgs = Array.from(c.querySelectorAll("svg"));
    expect(svgs).toHaveLength(6);
    svgs.forEach((svg, i) => {
      const img = svg.querySelector("image[data-seal-art]");
      expect(img?.getAttribute("clip-path")).toBe(`url(#t-s${i}-clip)`);
      expect(
        svg.querySelector(`#t-s${i}-clip polygon`)?.getAttribute("points")
      ).toBe(SEAL_SHARDS[i].points);
    });
  });
});
