/**
 * The seal is one material: the rim is the badge's tier metal, the face
 * is obsidian, the cracks leak light, and the shards carry the same rim
 * and face so the break reads as this object coming apart.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SealFace, SealShards } from "../BadgeSeal";
import { SEAL_CRACKS, SEAL_SHARDS } from "../sealGeometry";
import { TIER_PALETTES } from "../tierPalettes";

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
