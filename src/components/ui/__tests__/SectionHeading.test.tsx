/**
 * SectionHeading primitive tests.
 *
 * The heading above a group of cards or rows (DS3, 2026-09-27). What it
 * promises:
 *   1. It is a real heading element (h2 by default), in sentence case —
 *      no `uppercase`, no letter-spacing, unlike the label it replaced.
 *   2. Two sizes: `page` (the H3 step, 20px) and `compact` (16px) for
 *      sheets, cards and dense forms. Both bold, both foreground.
 *   3. A colour override in `className` wins over the foreground default,
 *      with and without an action row.
 *   4. An `action` shares the heading's row without becoming part of the
 *      heading's accessible name.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import SectionHeading from "../SectionHeading";

afterEach(() => cleanup());

describe("SectionHeading", () => {
  it("renders an h2 at the page size, bold, foreground, sentence case", () => {
    render(<SectionHeading>This week</SectionHeading>);
    const el = screen.getByRole("heading", { level: 2, name: "This week" });
    const tokens = el.className.split(/\s+/);
    expect(tokens).toContain("text-h3");
    expect(tokens).toContain("font-bold");
    expect(tokens).toContain("text-foreground");
    expect(tokens).not.toContain("uppercase");
    expect(tokens).not.toContain("tracking-widest");
    expect(tokens).not.toContain("tracking-wider");
  });

  it("steps down to 16px at the compact size", () => {
    render(<SectionHeading size="compact">Goal</SectionHeading>);
    const tokens = screen
      .getByRole("heading", { name: "Goal" })
      .className.split(/\s+/);
    expect(tokens).toContain("text-base");
    expect(tokens).toContain("font-bold");
    expect(tokens).not.toContain("text-h3");
  });

  it("takes the heading level from `as`", () => {
    render(
      <SectionHeading as="h3" size="compact">
        Weekly insights
      </SectionHeading>
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Weekly insights" })
    ).toBeTruthy();
  });

  it("lets a token colour override the foreground default", () => {
    render(
      <SectionHeading className="text-running-strong">Running</SectionHeading>
    );
    const tokens = screen
      .getByRole("heading", { name: "Running" })
      .className.split(/\s+/);
    expect(tokens).toContain("text-running-strong");
    expect(tokens).not.toContain("text-foreground");
  });

  it("puts an action on the heading's row without joining its name", () => {
    render(
      <SectionHeading
        className="text-lifting-strong"
        action={<a href="/review">Weekly review</a>}
      >
        This week
      </SectionHeading>
    );
    const heading = screen.getByRole("heading", { name: "This week" });
    const row = heading.parentElement!;
    expect(row).toContainElement(
      screen.getByRole("link", { name: "Weekly review" })
    );
    // The colour lands on the row, so the heading inherits it and the
    // foreground default does not win over it.
    expect(row.className.split(/\s+/)).toContain("text-lifting-strong");
    expect(row.className.split(/\s+/)).not.toContain("text-foreground");
    expect(heading.className.split(/\s+/)).not.toContain("text-foreground");
  });
});
