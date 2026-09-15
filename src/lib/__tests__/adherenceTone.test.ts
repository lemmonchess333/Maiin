import { describe, it, expect } from "vitest";
import { adherenceTone } from "@/lib/adherenceTone";
import { THEME } from "@/lib/theme";

/**
 * Two of the three bands were broken in ways that look identical in a
 * screenshot to a reader who is not measuring.
 *
 * The 50-80 band asked for muted with `color: "var(--muted-foreground)"`.
 * That token holds an HSL TRIPLET, so the declaration resolves to
 * `color: 240 3.8% 43%`, which is invalid — the browser drops it and the
 * text inherits the row's foreground. The band rendered as if it had no
 * tone rule at all.
 *
 * The >= 80 band asked for green with the bare `THEME.success` identity:
 * 2.29:1 as 12px text on its own 10% wash in light, against a 4.5:1
 * floor. It was the reassurance line — the one a consistent logger sees
 * most — and it was the least legible thing on the card.
 *
 * The < 50 amber band already did both correctly. That is the shape
 * CLAUDE.md names: one number computed right and its siblings missed.
 *
 * So these tests assert the CONTRACT rather than three literal strings:
 * every band's colour is an `hsl(var(--…))` wrapper, and no band ever
 * paints text with a raw token reference or a hex.
 */
const BANDS = [100, 80, 79.9, 65, 50, 49.9, 0];

describe("adherenceTone", () => {
  it("never paints text with a raw token reference", () => {
    // `var(--x)` outside an hsl() wrapper is the invalid-CSS bug: the
    // token is a triplet, so the declaration is dropped silently.
    for (const adh of BANDS) {
      const { color } = adherenceTone(adh);
      expect(color, `adherence ${adh}`).toMatch(/^hsl\(var\(--[a-z-]+\)\)$/);
    }
  });

  it("never paints text with a bare identity hex", () => {
    for (const adh of BANDS) {
      expect(adherenceTone(adh).color, `adherence ${adh}`).not.toMatch(/#/);
    }
    // Stated positively for the band that had the identity, so this
    // cannot pass by the colour simply having moved somewhere else.
    expect(adherenceTone(85).color).toBe("hsl(var(--success-strong))");
  });

  it("keeps the alpha concat on a hex, where it is valid", () => {
    // `${var(--x)}1A` would be invalid CSS. Only the two washed bands
    // have a tint; the muted band is transparent.
    expect(adherenceTone(85).bg).toBe(`${THEME.success}1A`);
    expect(adherenceTone(20).bg).toBe(`${THEME.amberLight}1A`);
    expect(adherenceTone(65).bg).toBe("transparent");
  });

  it("switches band at 80 and at 50, inclusive", () => {
    expect(adherenceTone(80).color).toBe("hsl(var(--success-strong))");
    expect(adherenceTone(79.9).color).toBe("hsl(var(--muted-foreground))");
    expect(adherenceTone(50).color).toBe("hsl(var(--muted-foreground))");
    expect(adherenceTone(49.9).color).toBe("hsl(var(--warning-strong))");
  });
});
