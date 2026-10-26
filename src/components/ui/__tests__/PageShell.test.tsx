/**
 * PageShell — the one page template.
 *
 * Five route pages, three header idioms, page titles hand-sized at
 * `text-xl` (the card-title tier) while the H1 token went almost unused.
 * The shell exists so a page cannot make those choices; these tests pin
 * the choices the shell makes on its behalf, and the two deliberate
 * designs it keeps as options rather than flattening.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import { motion } from "framer-motion";
import PageShell from "@/components/ui/PageShell";
import { pageItemVariant } from "@/components/ui/pageMotion";

afterEach(cleanup);

describe("PageShell header", () => {
  it("renders the title as the page's h1 at the H1 token, not text-xl", () => {
    render(<PageShell title="Analytics">x</PageShell>);
    const h1 = screen.getByRole("heading", { level: 1, name: "Analytics" });
    expect(h1.className).toMatch(/\btext-h1\b/);
    expect(h1.className).not.toMatch(/\btext-xl\b/);
    expect(h1.className).toMatch(/font-extrabold/);
  });

  it("puts the eyebrow above the title, outside the heading", () => {
    // Home's date sits over "Today". It is not part of the page's name,
    // so it stays out of the h1's accessible name.
    render(
      <PageShell eyebrow="Sunday 27 September" title="Today">
        x
      </PageShell>
    );
    const h1 = screen.getByRole("heading", { level: 1, name: "Today" });
    expect(h1.className).toMatch(/\btext-h1\b/);
    const eyebrow = screen.getByText("Sunday 27 September");
    expect(eyebrow.tagName).toBe("P");
    expect(h1.contains(eyebrow)).toBe(false);
    expect(
      eyebrow.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("renders subtitle and actions in their slots", () => {
    render(
      <PageShell
        title="Train"
        subtitle="Race prep · Marathon"
        actions={<button type="button">More</button>}
      >
        x
      </PageShell>
    );
    expect(screen.getByText("Race prep · Marathon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("wraps the subtitle rather than cutting it off", () => {
    // Train's five-day split ran "Push / Pull / Legs + Upper / Lower · 5…"
    // on a 393px phone, clamped to one line.
    render(
      <PageShell title="Train" subtitle="Push / Pull / Legs + Upper / Lower">
        x
      </PageShell>
    );
    const p = screen.getByText("Push / Pull / Legs + Upper / Lower");
    expect(p.className).not.toMatch(/line-clamp|truncate|min-h-/);
  });

  it("holds the height of the longest line a switching subtitle can show", () => {
    // Train's subtitle is tab-aware and changes length. The other tab's
    // line sits in the same grid cell, unseen and unread, so the cell is
    // as tall as the longer of the two and Lift↔Run moves nothing below.
    render(
      <PageShell
        title="Train"
        subtitle="Free running · Start whenever"
        subtitleAlternates={[
          "Push / Pull / Legs + Upper / Lower · 5 days/week",
        ]}
      >
        x
      </PageShell>
    );
    const shown = screen.getByText("Free running · Start whenever");
    const held = screen.getByText(
      "Push / Pull / Legs + Upper / Lower · 5 days/week"
    );
    expect(shown.parentElement).toBe(held.parentElement);
    expect(shown.parentElement!.className).toMatch(/\bgrid\b/);
    for (const line of [shown, held]) {
      expect(line.className).toMatch(/\bcol-start-1\b/);
      expect(line.className).toMatch(/\brow-start-1\b/);
    }
    expect(shown.className).not.toMatch(/\binvisible\b/);
    expect(shown).not.toHaveAttribute("aria-hidden");
    expect(held.className).toMatch(/\binvisible\b/);
    expect(held).toHaveAttribute("aria-hidden", "true");
    expect(shown.parentElement!.className).not.toMatch(/line-clamp|truncate/);
  });

  it("draws every header the same plain way", () => {
    // DS3 retired Train's sport-tinted header zone: no page's header is
    // a tinted, padded block any more.
    render(<PageShell title="Train">x</PageShell>);
    const header = screen.getByRole("banner");
    expect(header.style.backgroundColor).toBe("");
    expect(header.className).not.toMatch(/rounded-2xl/);
  });

  it("puts the banner above the header, inside the page", () => {
    // Food and Train show an offline notice before the title; the slot
    // keeps it there rather than pushing it under the h1.
    render(
      <PageShell title="Food" banner={<div data-testid="offline" />}>
        <div data-testid="body" />
      </PageShell>
    );
    const banner = screen.getByTestId("offline");
    const header = screen.getByRole("banner");
    const body = screen.getByTestId("body");
    expect(
      banner.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      header.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("forwards root props so pages keep their own responsibilities", () => {
    // Food pins its bottom padding to the safe-area token; Social and
    // History spread pull-to-refresh handlers onto the root. The shell
    // owns the header and rhythm, not those.
    render(
      <PageShell
        title="Food"
        data-testid="root"
        style={{ paddingBottom: "var(--page-bottom-pad)" }}
      >
        x
      </PageShell>
    );
    const root = screen.getByTestId("root");
    expect(root.style.paddingBottom).toBe("var(--page-bottom-pad)");
    expect(root.className).toMatch(/space-y-4/);
  });
});

/* The page starts settled, and the settle reaches every section, one
   that mounts after the page included: framer hands `initial={false}` on
   to each variant child. So no page section fades in, with or without
   Reduce Motion, and the section variants have no fade to take out. */
describe("PageShell motion", () => {
  it("draws the header and every section settled, however late it arrives", () => {
    const section = (id: string) => (
      <motion.div key={id} data-testid={id} variants={pageItemVariant}>
        {id}
      </motion.div>
    );
    const { rerender } = render(
      <PageShell title="Food">{[section("first")]}</PageShell>
    );
    rerender(
      <PageShell title="Food">{[section("first"), section("later")]}</PageShell>
    );
    for (const el of [
      screen.getByRole("banner"),
      screen.getByTestId("first"),
      screen.getByTestId("later"),
    ]) {
      expect(el.style.opacity).toBe("1");
      expect(el.style.transform).toBe("none");
    }
  });
});
