/**
 * Card — the one card surface.
 *
 * Thirty-seven `bg-card` surfaces sat on a radius/padding pairing that
 * nothing else used, and three that meant to float were flat because
 * `shadow-card` is a Tailwind colour, not a shadow. The primitive decides
 * those once; these tests pin what it decides.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Card from "@/components/ui/Card";
import { cardClasses } from "@/components/ui/cardClasses";

afterEach(cleanup);

describe("Card sizes", () => {
  it("hero is rounded-2xl with p-4", () => {
    render(<Card data-testid="c">x</Card>);
    const c = screen.getByTestId("c");
    expect(c.className).toMatch(/\brounded-2xl\b/);
    expect(c.className).toMatch(/\bp-4\b/);
  });

  it("compact is rounded-xl with p-3", () => {
    render(
      <Card size="compact" data-testid="c">
        x
      </Card>
    );
    const c = screen.getByTestId("c");
    expect(c.className).toMatch(/\brounded-xl\b/);
    expect(c.className).toMatch(/\bp-3\b/);
    expect(c.className).not.toMatch(/\brounded-2xl\b/);
  });

  it("a size never mixes the other size's pairing", () => {
    // The drift being closed: hero radius on compact padding and the
    // reverse. Both halves of each pairing come from one table row.
    expect(cardClasses({ size: "hero" })).not.toMatch(/\bp-3\b/);
    expect(cardClasses({ size: "compact" })).not.toMatch(/\bp-4\b/);
  });
});

describe("Card surface", () => {
  it("card tone floats: bg-card with the card-shadow utility, never shadow-card", () => {
    const cls = cardClasses();
    expect(cls).toMatch(/\bbg-card\b/);
    expect(cls).toMatch(/\bcard-shadow\b/);
    // `shadow-card` parses as shadow-color=card and renders nothing.
    expect(cls).not.toMatch(/\bshadow-card\b/);
  });

  it("muted tone sits flush: bg-muted and no elevation", () => {
    const cls = cardClasses({ tone: "muted" });
    expect(cls).toMatch(/\bbg-muted\b/);
    expect(cls).not.toMatch(/\bbg-card\b/);
    expect(cls).not.toMatch(/card-shadow/);
  });

  it("tinted tone supplies no surface: the CTA card paints its own 8% wash", () => {
    // Lift, Run and Rest sat at two radii on one screen. They share the
    // hero pairing now; only the wash differs, and that stays theirs.
    const cls = cardClasses({ tone: "tinted" });
    expect(cls).toMatch(/\brounded-2xl\b/);
    expect(cls).toMatch(/\bp-4\b/);
    expect(cls).not.toMatch(/\bbg-/);
    expect(cls).not.toMatch(/card-shadow/);
  });

  it("padded=false drops the padding and keeps the radius and surface", () => {
    const cls = cardClasses({ padded: false });
    expect(cls).not.toMatch(/\bp-4\b/);
    expect(cls).toMatch(/\brounded-2xl\b/);
    expect(cls).toMatch(/\bbg-card\b/);
  });
});

describe("Card element", () => {
  it("renders the landmark it is asked for and forwards attributes", () => {
    render(
      <Card as="section" aria-label="Water" className="mt-2">
        x
      </Card>
    );
    const s = screen.getByRole("region", { name: "Water" });
    expect(s.tagName).toBe("SECTION");
    expect(s.className).toMatch(/\bmt-2\b/);
    expect(s.className).toMatch(/\brounded-2xl\b/);
  });

  it("className cannot silently override the pairing (twMerge keeps the caller's, so callers must not pass one)", () => {
    // Documented, not defended: `cn` is twMerge, so a caller passing
    // `p-6` WINS. The invariant test over the source tree is what stops
    // that; here we only pin that layout classes pass through intact.
    render(
      <Card data-testid="c" className="flex items-center gap-2">
        x
      </Card>
    );
    expect(screen.getByTestId("c").className).toMatch(
      /\bflex items-center gap-2\b/
    );
  });
});
