import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Trophy } from "lucide-react";
import { BadgeHex } from "../BadgeHex";

afterEach(cleanup);

/**
 * Guards the theme-aware locked-artwork treatment. The bespoke badge art is a
 * light silver metallic; grayscaled + dimmed it washed out on the WHITE
 * light-mode card, so the locked case now routes its opacity/filter through
 * the `.badge-art-locked` CSS class (light darkens it, dark keeps it faint).
 * Earned art must NOT get the class: it keeps its inline neutral drop
 * shadow, with no coloured light round it (DESIGN_GUIDE §14o).
 */
describe("BadgeHex — locked artwork theming", () => {
  it("locked badge art gets the theme-aware .badge-art-locked class", () => {
    const { container } = render(
      <BadgeHex
        Icon={Trophy}
        tier="silver"
        earned={false}
        imageSrc="/badges/x.webp"
      />
    );
    expect(container.querySelector(".badge-art-locked")).not.toBeNull();
    // The locked class owns opacity/filter, so they are NOT set inline.
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.filter).toBe("");
    expect(el.style.opacity).toBe("");
  });

  it("earned badge art keeps a neutral shadow, no coloured glow and no locked class", () => {
    const { container } = render(
      <BadgeHex Icon={Trophy} tier="gold" earned imageSrc="/badges/x.webp" />
    );
    expect(container.querySelector(".badge-art-locked")).toBeNull();
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.opacity).toBe("1");
    // One shadow, offset and black: depth, not light.
    const shadows = el.style.filter.match(/drop-shadow\([^)]*\)\)/g) ?? [];
    expect(shadows).toHaveLength(1);
    expect(shadows[0]).toMatch(
      /drop-shadow\(0(px)? 2px 6px rgba\(0, ?0, ?0, ?0\.22\)\)/
    );
  });

  it("SVG fallback (no art) does not use the artwork class", () => {
    const { container } = render(
      <BadgeHex Icon={Trophy} tier="silver" earned={false} />
    );
    expect(container.querySelector(".badge-art-locked")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
