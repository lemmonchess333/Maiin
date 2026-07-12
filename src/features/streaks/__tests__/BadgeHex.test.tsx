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
 * Earned art must NOT get the class — it keeps its inline, size-dependent
 * tier-glow filter.
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

  it("earned badge art keeps its inline glow and no locked class", () => {
    const { container } = render(
      <BadgeHex Icon={Trophy} tier="silver" earned imageSrc="/badges/x.webp" />
    );
    expect(container.querySelector(".badge-art-locked")).toBeNull();
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.filter).toContain("drop-shadow");
    expect(el.style.opacity).toBe("1");
  });

  it("SVG fallback (no art) does not use the artwork class", () => {
    const { container } = render(
      <BadgeHex Icon={Trophy} tier="silver" earned={false} />
    );
    expect(container.querySelector(".badge-art-locked")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
