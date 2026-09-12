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

import PageShell from "@/components/ui/PageShell";

afterEach(cleanup);

describe("PageShell header", () => {
  it("renders the title as the page's h1 at the H1 token, not text-xl", () => {
    render(<PageShell title="Analytics">x</PageShell>);
    const h1 = screen.getByRole("heading", { level: 1, name: "Analytics" });
    expect(h1.className).toMatch(/\btext-h1\b/);
    expect(h1.className).not.toMatch(/\btext-xl\b/);
    expect(h1.className).toMatch(/font-extrabold/);
  });

  it("gives the brand wordmark its own treatment instead of the H1 scale", () => {
    // Home's header is the brand, not a page name — tracked uppercase is
    // that design, kept as an option rather than forced onto the scale.
    render(
      <PageShell brand title="TROPOS">
        x
      </PageShell>
    );
    const h1 = screen.getByRole("heading", { level: 1, name: "TROPOS" });
    expect(h1.className).toMatch(/uppercase/);
    expect(h1.className).toMatch(/tracking-\[0\.14em\]/);
    expect(h1.className).not.toMatch(/\btext-h1\b/);
  });

  it("renders leading tile, subtitle and actions in their slots", () => {
    render(
      <PageShell
        title="Train"
        leading={<span data-testid="tile" />}
        subtitle="Race prep · Marathon"
        actions={<button type="button">More</button>}
      >
        x
      </PageShell>
    );
    expect(screen.getByTestId("tile")).toBeInTheDocument();
    expect(screen.getByText("Race prep · Marathon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("reserves two subtitle lines only when asked", () => {
    // Train's subtitle is tab-aware and changes length; without the
    // reserve everything under it moved ~12px on Lift↔Run.
    const { rerender } = render(
      <PageShell title="Train" subtitle="one line">
        x
      </PageShell>
    );
    expect(screen.getByText("one line").className).not.toMatch(/min-h-/);
    rerender(
      <PageShell title="Train" subtitle="one line" subtitleReserveLines={2}>
        x
      </PageShell>
    );
    const p = screen.getByText("one line");
    expect(p.className).toMatch(/min-h-\[2rem\]/);
    expect(p.className).toMatch(/line-clamp-2/);
  });

  it("tints the header zone from the accent at low alpha", () => {
    // Train's sport tint: the whole zone answers to the active mode. The
    // alpha suffix keeps it a wash rather than a filled block.
    render(
      <PageShell title="Train" accent="#D4637A">
        x
      </PageShell>
    );
    const header = screen.getByRole("banner");
    expect(header.style.backgroundColor).not.toBe("");
    expect(header.className).toMatch(/rounded-2xl/);
  });

  it("does not tint or pad the header without an accent", () => {
    render(<PageShell title="Food">x</PageShell>);
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
